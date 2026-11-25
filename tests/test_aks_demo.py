"""Offline tests for the AKS OpenTelemetry demo chart, apps, and contracts."""

import importlib.util
import random
from pathlib import Path
import re
import threading
import time
import unittest
from unittest.mock import MagicMock, patch
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
CHART = ROOT / "k8s/otel-demo"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


shop = load("aks_shop", CHART / "files/shop.py")
loadgen = load("aks_loadgen", CHART / "files/loadgen.py")


def processor_block(config, name):
    match = re.search(rf"^  {re.escape(name)}:\n(?:(?:    .*)?\n)+", config, re.M)
    if not match:
        raise AssertionError(f"processor {name} not found")
    return match.group(0)


class ShopTests(unittest.TestCase):
    def payment(self):
        payment = shop.Shop.__new__(shop.Shop)
        payment.role = "payment"
        payment.downstream_url = "http://shipping:8080"
        payment.rng = random.Random(7)
        payment.failure_multiplier = 1.0
        payment.tracer = MagicMock()
        propagate = MagicMock()
        propagate.inject.side_effect = lambda headers: headers.update({"traceparent": "test-parent"})
        payment.otel = {"SpanKind": MagicMock(), "StatusCode": MagicMock(), "propagate": propagate}
        return payment

    def test_payment_continues_to_shipping_with_trace_context(self):
        payment = self.payment()
        with patch.object(shop, "local_work", return_value=(0, False)), \
                patch.object(shop.urllib.request, "urlopen") as send:
            send.return_value.__enter__.return_value.status = 200
            self.assertIsNone(payment._work("checkout", {}))
            request = send.call_args.args[0]
            self.assertEqual(request.full_url, "http://shipping:8080/checkout")
            self.assertEqual(request.get_header("Traceparent"), "test-parent")
            payment.tracer.start_as_current_span.assert_called_once()

    def test_failed_payment_does_not_ship_and_downstream_failure_propagates(self):
        payment = self.payment()
        with patch.object(shop, "local_work", return_value=(0, True)), \
                patch.object(shop.urllib.request, "urlopen") as send:
            failure = payment._work("checkout", {})
            self.assertEqual(failure[0], "PaymentProcessingError")
            send.assert_not_called()
        query = payment.tracer.start_as_current_span.return_value.__enter__.return_value
        query.add_event.assert_called_once()
        name, attributes = query.add_event.call_args.args
        self.assertEqual(name, "exception")
        self.assertEqual(attributes["exception.type"], "QueryCanceledError")
        self.assertEqual(set(attributes), {"exception.type", "exception.message"})
        with patch.object(shop, "local_work", return_value=(0, False)), \
                patch.object(shop.urllib.request, "urlopen", side_effect=ConnectionError):
            self.assertEqual(payment._work("checkout", {}),
                             ("DownstreamServiceError", "shipping could not be reached"))
        error = urllib.error.HTTPError("http://shipping:8080/checkout", 500, "failed", {}, None)
        with patch.object(shop, "local_work", return_value=(0, False)), \
                patch.object(shop.urllib.request, "urlopen", side_effect=error):
            self.assertEqual(payment._work("checkout", {}),
                             ("DownstreamServiceError", "shipping returned HTTP 500"))

    def test_release_version_and_failure_multiplier_are_validated(self):
        self.assertEqual(shop.read_release({}), (shop.VERSION, 1.0))
        self.assertEqual(shop.read_release({"SERVICE_VERSION": "1.3.0-rc.1", "FAILURE_MULTIPLIER": "4"}),
                         ("1.3.0-rc.1", 4.0))
        for environ in ({"SERVICE_VERSION": "1.3 bad"}, {"SERVICE_VERSION": ""}, {"SERVICE_VERSION": "v" * 65},
                        {"FAILURE_MULTIPLIER": "-1"}, {"FAILURE_MULTIPLIER": "11"}, {"FAILURE_MULTIPLIER": "lots"}):
            with self.subTest(environ=environ), self.assertRaises(ValueError):
                shop.read_release(environ)

    def test_failure_multiplier_scales_and_can_disable_simulated_failures(self):
        def failures(multiplier):
            rng = random.Random(11)
            return sum(shop.local_work("payment", "checkout", rng, multiplier)[1] for _ in range(4000))

        self.assertEqual(failures(0), 0)
        self.assertGreater(failures(4), 3 * failures(1))

    def test_every_role_fails_with_a_typed_message_carrying_variable_values(self):
        rng = random.Random(3)
        for role in shop.ROLES:
            with self.subTest(role=role):
                exception_type, message = shop.local_failure(role, rng)
                self.assertRegex(exception_type, r"^[A-Z][A-Za-z]+Error$")
                self.assertRegex(message, r"[0-9]")
                self.assertLessEqual(len(message), 256)
        self.assertNotEqual(shop.local_failure("gateway", rng), shop.local_failure("gateway", rng))

    def test_handle_records_one_exception_event_only_on_failure(self):
        for failure in (None, ("CartValidationError", "cart 1 has 2 items with stale prices")):
            with self.subTest(failure=failure):
                checkout = shop.Shop.__new__(shop.Shop)
                checkout.role, checkout.span_name = "checkout", "demo.checkout"
                checkout.tracer, checkout.log = MagicMock(), MagicMock()
                checkout.requests, checkout.durations = MagicMock(), shop.IntervalMean()
                checkout.otel = {name: MagicMock() for name in (
                    "propagate", "baggage", "context", "SpanKind", "StatusCode", "SeverityNumber")}
                checkout.otel["baggage"].get_baggage.return_value = None
                span = checkout.tracer.start_as_current_span.return_value.__enter__.return_value
                with patch.object(checkout, "_work", return_value=failure):
                    status = checkout.handle("checkout", {})
                self.assertEqual(status, 500 if failure else 200)
                if failure:
                    span.add_event.assert_called_once_with("exception", {
                        "exception.type": failure[0], "exception.message": failure[1]})
                else:
                    span.add_event.assert_not_called()

    def test_run_id_is_canonical_uuid_or_ignored(self):
        self.assertEqual(shop.parse_run_id("8E6299B9-0B6A-44B7-BE90-2CBB9B002F0F"),
                         "8e6299b9-0b6a-44b7-be90-2cbb9b002f0f")
        for value in (None, "", "not-a-uuid", "8e6299b9-0b6a-44b7-be90-2cbb9b002f0f" + "0" * 40):
            self.assertIsNone(shop.parse_run_id(value))

    def test_interval_mean_is_per_key_and_resets_on_collect(self):
        means = shop.IntervalMean()
        threads = [threading.Thread(target=lambda: [means.record(("browse", "success"), 10.0) for _ in range(500)])
                   for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        means.record(("checkout", "error"), 30.0)
        means.record(("checkout", "error"), 50.0)
        self.assertEqual(means.collect(), {("browse", "success"): 10.0, ("checkout", "error"): 40.0})
        self.assertEqual(means.collect(), {})

    def test_request_logs_carry_the_current_event_time(self):
        class Severity:
            name = "ERROR"

        class Logger:
            def emit(self, **record):
                self.record = record

        logger = Logger()
        before = time.time_ns()
        shop.emit_request_log(logger, Severity(), {"outcome": "error"})
        self.assertGreaterEqual(logger.record["timestamp"], before)
        self.assertEqual(logger.record["severity_text"], "ERROR")
        self.assertEqual(logger.record["attributes"], {"outcome": "error"})

    def test_handler_passes_lowercase_headers_so_trace_context_propagates(self):
        class FakeShop:
            role = "gateway"

            def __init__(self):
                self.calls = []

            def handle(self, scenario, headers):
                self.calls.append((scenario, headers))
                return 200

        fake = FakeShop()
        server = ThreadingHTTPServer(("127.0.0.1", 0), shop.make_handler(fake))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            request = urllib.request.Request(f"{base}/checkout", headers={
                "traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
                "baggage": "demo.run_id=8e6299b9-0b6a-44b7-be90-2cbb9b002f0f"})
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(response.status, 200)
            with self.assertRaises(urllib.error.HTTPError) as unknown:
                urllib.request.urlopen(f"{base}/admin", timeout=5)
            self.assertEqual(unknown.exception.code, 404)
            unknown.exception.close()
        finally:
            server.shutdown()
            server.server_close()
        scenario, headers = fake.calls[0]
        self.assertEqual(scenario, "checkout")
        self.assertIn("traceparent", headers)
        self.assertIn("baggage", headers)


class RecordingSpan:
    def __init__(self, tracer, name, kind, attributes):
        self.tracer, self.name, self.attributes, self.status, self.events = tracer, name, dict(attributes), None, []
        self.parent = tracer.stack[-1].name if tracer.stack else None

    def __enter__(self):
        self.tracer.stack.append(self)
        return self

    def __exit__(self, *_):
        self.tracer.stack.pop()

    def set_attribute(self, key, value):
        self.attributes[key] = value

    def set_status(self, status):
        self.status = status

    def add_event(self, name, attributes):
        self.events.append((name, attributes))


class RecordingTracer:
    def __init__(self):
        self.stack, self.spans = [], []

    def start_as_current_span(self, name, kind=None, attributes=None):
        span = RecordingSpan(self, name, kind, attributes or {})
        self.spans.append(span)
        return span


class AssistantTests(unittest.TestCase):
    def run_agent(self, seed, multiplier=1.0):
        assistant = shop.Shop.__new__(shop.Shop)
        assistant.role, assistant.rng, assistant.failure_multiplier = "assistant", random.Random(seed), multiplier
        assistant.tracer = RecordingTracer()
        assistant.otel = {"SpanKind": MagicMock(), "StatusCode": MagicMock()}
        with patch.object(shop.time, "sleep"):
            failure = assistant._work("assist", {"demo.scenario": "assist"})
        return failure, assistant.tracer.spans

    def test_agent_runs_follow_genai_conventions_without_content(self):
        for seed in range(40):
            failure, spans = self.run_agent(seed, multiplier=0)
            self.assertIsNone(failure)
            names = [span.name for span in spans]
            self.assertEqual(names[0], "invoke_agent support-agent")
            self.assertRegex(" ".join(names), r"chat demo-chat-small.*execute_tool lookup_order")
            for span in spans:
                self.assertRegex(span.name, r"^(invoke_agent|chat|execute_tool) [A-Za-z0-9._-]{1,64}$")
                self.assertEqual(span.attributes["gen_ai.provider.name"], "demo")
                self.assertTrue(all(key.startswith(("gen_ai.", "demo.")) for key in span.attributes))
                self.assertFalse({"gen_ai.input.messages", "gen_ai.output.messages"} & set(span.attributes))
                if span.name.startswith("chat "):
                    self.assertGreater(span.attributes["gen_ai.usage.input_tokens"], 0)
                    self.assertIn(span.attributes["gen_ai.response.finish_reasons"], (["tool_calls"], ["stop"]))
        handoffs = sum(any(s.name == "invoke_agent refunds-agent" for s in self.run_agent(seed, 0)[1]) for seed in range(40))
        self.assertGreater(handoffs, 0)

    def test_tool_and_model_failures_mark_the_run_and_record_exceptions(self):
        failures = [self.run_agent(seed, multiplier=10) for seed in range(30)]
        failed = [(failure, spans) for failure, spans in failures if failure]
        self.assertTrue(failed)
        for failure, spans in failed:
            self.assertEqual(failure[0], "AgentRunError")
            erroring = [span for span in spans if span.events]
            self.assertTrue(any(span.name.startswith("invoke_agent") for span in erroring))
            types = {event[1]["exception.type"] for span in erroring for event in span.events}
            self.assertTrue(types & {"ToolExecutionError", "RateLimitError"})

    def test_gateway_routes_assist_to_the_assistant(self):
        gateway = shop.Shop.__new__(shop.Shop)
        gateway.role, gateway.rng, gateway.failure_multiplier = "gateway", random.Random(1), 0
        gateway.downstream_url, gateway.assistant_url = "http://checkout:8080", "http://assistant:8080"
        gateway.otel = {"propagate": MagicMock()}
        with patch.object(shop.time, "sleep"), patch.object(shop.urllib.request, "urlopen") as send:
            send.return_value.__enter__.return_value.status = 200
            self.assertIsNone(gateway._work("assist", {}))
        self.assertEqual(send.call_args.args[0].full_url, "http://assistant:8080/assist")
        with patch.object(shop.time, "sleep"), \
                patch.object(shop.urllib.request, "urlopen", side_effect=ConnectionError):
            self.assertEqual(gateway._work("assist", {}),
                             ("DownstreamServiceError", "assistant could not be reached"))


class LoadgenTests(unittest.TestCase):
    def test_defaults_target_the_in_cluster_gateway(self):
        self.assertEqual(loadgen.read_settings({}), ("http://gateway:8080", 1.0, 0.5, 3600, 0.1))

    def test_scenarios_mix_assist_checkout_and_browse(self):
        rng = random.Random(5)
        picks = [loadgen.pick_scenario(rng, 0.5, 0.1) for _ in range(5000)]
        self.assertAlmostEqual(picks.count("assist") / len(picks), 0.1, delta=0.02)
        self.assertEqual(set(picks), {"assist", "checkout", "browse"})
        self.assertNotIn("assist", {loadgen.pick_scenario(rng, 0.5, 0) for _ in range(500)})

    def test_unsafe_or_out_of_range_settings_are_rejected(self):
        for environ in (
            {"TARGET_URL": "ftp://gateway:8080"},
            {"TARGET_URL": "http://user:secret@gateway:8080"},
            {"TARGET_URL": "http://gateway:8080/checkout"},
            {"TARGET_URL": "http://gateway:8080?x=1"},
            {"REQUESTS_PER_SECOND": "50"},
            {"CHECKOUT_RATIO": "1.5"},
            {"RUN_ID_ROTATION_SECONDS": "5"},
            {"ASSIST_RATIO": "1.5"},
        ):
            with self.subTest(environ=environ), self.assertRaises(ValueError):
                loadgen.read_settings(environ)


class ContractTests(unittest.TestCase):
    def test_every_service_hop_is_deployed_permitted_and_exported(self):
        def template_map(filename):
            text = (CHART / "templates" / filename).read_text()
            entries = re.search(r"\brange .*? := dict (.*?) }}", text).group(1)
            return dict(re.findall(r'"([^"]+)" "([^"]*)"', entries))

        downstreams = {role: downstream or "" for role, (_, downstream) in shop.ROLES.items()}
        self.assertEqual(template_map("apps.yaml"), downstreams)
        expected_ingress = {"gateway": "loadgen", "assistant": "gateway"}
        expected_ingress.update({target: source for source, target in downstreams.items() if target})
        self.assertEqual(template_map("networkpolicies.yaml"), expected_ingress)
        selector = processor_block((CHART / "files/collector.yaml").read_text(), "filter/synthetic")
        for span_name, _ in shop.ROLES.values():
            self.assertIn(f'name != "{span_name}"', selector)

    def test_aks_collector_keeps_the_cloud_selector_and_uses_workload_identity(self):
        cloud = (ROOT / "collector/cloud.yaml").read_text()
        aks = (CHART / "files/collector.yaml").read_text()
        self.assertEqual(processor_block(aks, "filter/synthetic"), processor_block(cloud, "filter/synthetic"))
        self.assertIn("use_azure_auth: true", aks)
        self.assertNotIn("managed_identity_id", aks)
        self.assertEqual(aks.count("processors: [memory_limiter, filter/synthetic, resource/k8s, transform/demo, batch]"), 3)

    def test_every_collector_keeps_only_sanitized_exception_events(self):
        def spanevent_rules(path):
            config = (ROOT / path).read_text()
            block = re.search(r"^      - context: spanevent\n        statements:\n((?:          - .*\n)+)", config, re.M)
            self.assertIsNotNone(block, path)
            self.assertIn("      spanevent:\n        - 'name != \"exception\"'\n", config, path)
            return block.group(1)

        rules = {path: spanevent_rules(path) for path in (
            "collector/cloud.yaml", "collector/local.yaml", "k8s/otel-demo/files/collector.yaml")}
        self.assertEqual(len(set(rules.values())), 1, "exception event rules differ between collectors")
        statements = next(iter(rules.values()))
        self.assertIn('keep_keys(attributes, ["exception.type", "exception.message"])', statements)
        self.assertNotIn("exception.stacktrace", statements)
        for placeholder in ("<uuid>", "<email>", "<ip>", "<hex>", "<n>"):
            self.assertIn(f'"{placeholder}")', statements)
        self.assertIn("truncate_all(attributes, 256)", statements)

    def test_aks_collector_queues_exports_on_disk_owned_by_one_pod(self):
        config = (CHART / "files/collector.yaml").read_text()
        template = (CHART / "templates/collector.yaml").read_text()
        self.assertRegex(config, r"file_storage/queue:\n    directory: /var/lib/otelcol/queue\n")
        self.assertIn("      storage: file_storage/queue", config)
        # Longer than the 30s termination grace period, so a replacement pod waits for the lock.
        self.assertIn("    timeout: 45s\n", config)
        self.assertIn("extensions: [health_check, file_storage/queue]", config)
        self.assertIn("mountPath: /var/lib/otelcol/queue", template)
        self.assertRegex(template, r"rollingUpdate:\n      maxSurge: 0\n      maxUnavailable: 1")
        self.assertIn("kind: PersistentVolumeClaim", template)
        self.assertIn('accessModes: ["ReadWriteOnce"]', template)
        # The Container Apps collector has no disk and stays in memory.
        self.assertNotIn("file_storage", (ROOT / "collector/cloud.yaml").read_text())
        workflow = (ROOT / ".github/workflows/validate.yml").read_text()
        self.assertIn("--tmpfs /var/lib/otelcol/queue", workflow)

    def test_chart_identity_matches_terraform_federated_credential_subject(self):
        module = (ROOT / "infra/terraform/modules/aks/main.tf").read_text()
        namespace = re.search(r'workload_namespace\s*=\s*"([^"]+)"', module).group(1)
        account = re.search(r'collector_service_account\s*=\s*"([^"]+)"', module).group(1)
        values = (CHART / "values.yaml").read_text()
        self.assertIn(f"  namespace: {namespace}\n", values)
        self.assertIn(f"  serviceAccountName: {account}\n", values)
        self.assertIn(f"  name: {namespace}\n", (ROOT / "k8s/namespace.yaml").read_text())

    def test_requirements_are_pinned_with_sha256_hashes_only(self):
        lock = (CHART / "files/requirements.txt").read_text()
        pins = re.findall(r"^([A-Za-z0-9_.-]+)==\S+", lock, re.M)
        self.assertIn("opentelemetry-sdk", pins)
        self.assertNotRegex(lock, r"--hash=(?!sha256:)")
        requirements = "\n".join(line for line in lock.splitlines() if not line.startswith("#"))
        for block in re.split(r"\n(?=[A-Za-z0-9_.-]+==)", requirements):
            with self.subTest(requirement=block.split()[0]):
                self.assertIn("--hash=sha256:", block)


if __name__ == "__main__":
    unittest.main()
