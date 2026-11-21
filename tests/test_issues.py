"""Offline tests for issue grouping, triage state, and alert definitions."""

import base64
import importlib.util
import io
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


issue_state = load("issue_state", ROOT / "scripts/issue-state.py")
bootstrap = load("bootstrap_for_issues", ROOT / "scripts/bootstrap-fabric.py")
SCHEMA = (ROOT / "fabric/schema.kql").read_text()
FINGERPRINT = "0123456789abcdef"


def command(prefix):
    matches = [c for c in bootstrap.split_schema_commands(SCHEMA) if c.startswith(prefix)]
    if len(matches) != 1:
        raise AssertionError(f"expected one schema command starting with {prefix!r}, found {len(matches)}")
    return matches[0]


class FakeKusto:
    def __init__(self, known=True):
        self.known = known
        self.managed = []
        self.queries = []

    def query(self, csl):
        self.queries.append(csl)
        if csl.startswith("Issues1h"):
            return [{"Fingerprint": FINGERPRINT}] if self.known else []
        return [{"Fingerprint": FINGERPRINT, "Status": "open", "Events": 3, "Environment": "aks",
                 "Title": "QueryCanceledError: canceling statement", "LastSeen": "2026-11-21T00:00:00Z"}]

    def manage(self, csl):
        self.managed.append(csl)


class StateCommandTests(unittest.TestCase):
    def test_resolve_records_version_and_server_side_identity(self):
        csl = issue_state.state_command(FINGERPRINT, "resolved", "1.3.0", note="fixed")
        self.assertTrue(csl.startswith(".set-or-append IssueState <|\nprint "))
        self.assertIn(f"Fingerprint='{FINGERPRINT}'", csl)
        self.assertIn("ResolvedInVersion='1.3.0'", csl)
        self.assertIn("MutedUntil=datetime(null)", csl)
        # The author comes from the authenticated principal, never from the caller.
        self.assertIn("current_principal_details()['UserPrincipalName']", csl)

    def test_mute_requires_a_bounded_duration(self):
        self.assertIn("MutedUntil=now() + 12h", issue_state.state_command(FINGERPRINT, "muted", mute_for="12h"))
        for duration in (None, "", "12", "0h", "12w", "99999d", "1h; drop"):
            with self.subTest(duration=duration), self.assertRaises(issue_state.IssueStateError):
                issue_state.state_command(FINGERPRINT, "muted", mute_for=duration)

    def test_untrusted_text_cannot_break_out_of_the_command(self):
        note = "it's \"quoted\" ') | .drop table OTELTraces"
        csl = issue_state.state_command(FINGERPRINT, "open", note=note)
        encoded = re.search(r"base64_decode_tostring\('([A-Za-z0-9+/=]+)'\)", csl).group(1)
        self.assertEqual(base64.b64decode(encoded).decode(), note)
        self.assertNotIn("drop", csl)
        for fingerprint in ("0123456789ABCDEF", "0123", "x" * 16, f"{FINGERPRINT}'"):
            with self.subTest(fingerprint=fingerprint), self.assertRaises(issue_state.IssueStateError):
                issue_state.state_command(fingerprint, "open")
        for version in ("1.0'", "a" * 65, "-1", "1 0"):
            with self.subTest(version=version), self.assertRaises(issue_state.IssueStateError):
                issue_state.state_command(FINGERPRINT, "resolved", version)
        with self.assertRaises(issue_state.IssueStateError):
            issue_state.state_command(FINGERPRINT, "deleted")
        with self.assertRaises(issue_state.IssueStateError):
            issue_state.state_command(FINGERPRINT, "open", note="x" * 201)

    def test_only_fabric_query_service_uris_are_accepted(self):
        self.assertEqual(issue_state.query_service_uri("https://abc.z3.kusto.fabric.microsoft.com/"),
                         "https://abc.z3.kusto.fabric.microsoft.com")
        for uri in ("http://abc.kusto.fabric.microsoft.com", "https://example.com",
                    "https://user:pw@abc.kusto.fabric.microsoft.com", "https://abc.kusto.fabric.microsoft.com/x",
                    "https://abc.kusto.fabric.microsoft.com?db=x", "https://abc.kusto.fabric.microsoft.com:8443"):
            with self.subTest(uri=uri), self.assertRaises(issue_state.IssueStateError):
                issue_state.query_service_uri(uri)


class CliTests(unittest.TestCase):
    def run_cli(self, argv, fake):
        out = io.StringIO()
        code = issue_state.main(["--query-uri", "https://abc.z3.kusto.fabric.microsoft.com",
                                 "--database", "observability", *argv], kusto_factory=lambda *_: fake, out=out)
        return code, out.getvalue()

    def test_resolve_appends_exactly_one_state_row_for_a_known_issue(self):
        fake = FakeKusto()
        code, output = self.run_cli(["resolve", FINGERPRINT, "--in-version", "1.3.0"], fake)
        self.assertEqual(code, 0)
        self.assertEqual(len(fake.managed), 1)
        self.assertIn("Status='resolved'", fake.managed[0])
        self.assertIn("now resolved", output)

    def test_unknown_fingerprints_and_bad_lookbacks_change_nothing(self):
        fake = FakeKusto(known=False)
        self.assertEqual(self.run_cli(["mute", FINGERPRINT, "--for", "1h"], fake)[0], 1)
        self.assertEqual(self.run_cli(["list", "--lookback", "1h | take 1"], fake)[0], 1)
        self.assertEqual(fake.managed, [])

    def test_list_prints_one_line_per_issue(self):
        code, output = self.run_cli(["list", "--lookback", "7d"], FakeKusto())
        self.assertEqual(code, 0)
        self.assertIn(FINGERPRINT, output)
        self.assertIn("QueryCanceledError", output)


class SchemaTests(unittest.TestCase):
    def test_issue_objects_are_defined_and_management_safe(self):
        for prefix in (
            ".create-or-alter function with (folder='Issues', docstring='Replaces variable values",
            ".create-or-alter function with (folder='Issues', docstring='One row per failed",
            ".create-or-alter materialized-view Issues1h on table OTELTraces",
            ".create-merge table IssueState (",
            ".create-or-alter function with (folder='Issues', docstring='Current triage state",
            ".create-or-alter function with (folder='Issues', docstring='Issues seen",
            ".create-or-alter function with (folder='Issues', docstring='new_issue, regression, and unmute",
        ):
            with self.subTest(prefix=prefix):
                command(prefix)
        self.assertIn(".alter-merge table IssueState policy retention softdelete = 365d", SCHEMA)

    def test_view_and_function_use_the_same_fingerprint(self):
        def fingerprint(text):
            return re.search(r"extend Fingerprint=(.*)\n", text).group(1)

        view = command(".create-or-alter materialized-view Issues1h")
        events = command(".create-or-alter function with (folder='Issues', docstring='One row per failed")
        self.assertEqual(fingerprint(view), fingerprint(events))
        self.assertIn("Service", fingerprint(view))
        self.assertNotRegex(fingerprint(view), r"Environment|Version|TraceID")

    def test_issue_view_dimensions_are_bounded(self):
        view = command(".create-or-alter materialized-view Issues1h")
        dimensions = view.rsplit(" by ", 1)[1]
        self.assertNotRegex(dimensions, r"TraceID|SpanID|ParentID|run_id|RawMessage")
        self.assertIn("Message", dimensions)
        self.assertNotRegex(view, r"ago\(|now\(")

    def test_alerts_cover_the_three_triggers_and_respect_mutes(self):
        alerts = command(".create-or-alter function with (folder='Issues', docstring='new_issue, regression, and unmute")
        for trigger in ('"new_issue"', '"regression"', '"unmute"'):
            self.assertIn(trigger, alerts)
        # A muted issue is the first case, so it raises nothing.
        self.assertRegex(alerts, r"case\(\s*Muted, \"\"")
        self.assertIn("parse_version(Version) >= parse_version(ResolvedInVersion)", alerts)
        # Each trigger is a one-time transition, not a repeat on every poll.
        self.assertIn("RegressedAt=min(Timestamp)", alerts)
        self.assertIn("RegressedAt > ago(lookback)", alerts)


class ReleaseSchemaTests(unittest.TestCase):
    def test_release_view_uses_version_as_a_bounded_dimension_of_server_spans(self):
        view = command(".create-or-alter materialized-view Releases1m on table OTELTraces")
        self.assertIn('SpanKind == "SPAN_KIND_SERVER"', view)
        self.assertEqual(view.rsplit(" by ", 1)[1].strip().rstrip("}").strip(),
                         "WindowStart=bin(StartTime, 1m), Service, Environment, Version")
        self.assertIn(".alter materialized-view Releases1m policy caching hot = 1d", SCHEMA)

    def test_release_health_tiers_are_parameters_with_a_minimum_sample(self):
        health = command(".create-or-alter function with (folder='Releases', docstring='Requests, error-free rate")
        self.assertIn("ReleaseHealth(lookback:timespan=24h, healthy:real=0.99, degraded:real=0.95, minRequests:long=50)", health)
        self.assertRegex(health, r'case\(Requests < minRequests, "too few requests"')
        comparison = command(".create-or-alter function with (folder='Releases', docstring='The newest release")
        for verdict in ('"first release"', '"worse"', '"better"', '"same"'):
            self.assertIn(verdict, comparison)

    def test_chart_exposes_version_and_failure_multiplier(self):
        values = (ROOT / "k8s/otel-demo/values.yaml").read_text()
        template = (ROOT / "k8s/otel-demo/templates/apps.yaml").read_text()
        self.assertIn('  version: "1.2.0"\n', values)
        self.assertIn("  failureMultiplier: 1\n", values)
        self.assertIn("name: SERVICE_VERSION", template)
        self.assertIn("name: FAILURE_MULTIPLIER", template)


class AgentSchemaTests(unittest.TestCase):
    def test_agent_functions_exist_and_read_only_genai_metadata(self):
        functions = [c for c in bootstrap.split_schema_commands(SCHEMA) if "folder='Agents'" in c.splitlines()[0]]
        names = {re.search(r"\) (\w+)\(", c.splitlines()[0]).group(1) for c in functions}
        self.assertEqual(names, {"AgentSpans", "AgentRuns", "AgentOverview", "AgentModels", "AgentTools", "AgentRun"})
        text = "\n".join(functions)
        self.assertNotRegex(text, r"input\.messages|output\.messages|tool\.call\.arguments|cost|price")
        self.assertIn("arg_min(StartTime, Agent)", text)

    def test_collector_admits_genai_span_names_and_metadata_only(self):
        for path in ("collector/cloud.yaml", "collector/local.yaml", "k8s/otel-demo/files/collector.yaml"):
            config = (ROOT / path).read_text()
            with self.subTest(path=path):
                self.assertIn('not IsMatch(name, "^(invoke_agent|chat|execute_tool) [A-Za-z0-9._-]{1,64}$")', config)
                self.assertIn('"gen_ai.usage.input_tokens"', config)
                self.assertNotIn("gen_ai.input.messages", config)
                self.assertNotIn("gen_ai.tool.call.arguments", config)


if __name__ == "__main__":
    unittest.main()
