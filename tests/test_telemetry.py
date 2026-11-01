"""Offline checks for the demo's OTLP wire contract and public serving assets."""

import contextlib
import importlib.util
import io
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re
import threading
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("demo_emit", ROOT / "demo" / "emit.py")
emit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(emit)


@contextlib.contextmanager
def receiver(response=None, status=200):
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            received.append((self.path, self.headers.get("Content-Type"),
                             json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response or {}).encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", received
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


class DemoTests(unittest.TestCase):
    def test_payloads_correlate_log_and_parent_child_spans(self):
        run_id = "6dce8097-c1fb-4b7a-9ac7-ebea106b8334"
        payloads = emit.make_payloads(4, now_ns=1_800_000_000_000_000_000, run_id=run_id)
        resource_spans = payloads["traces"]["resourceSpans"]
        spans = [r["scopeSpans"][0]["spans"][0] for r in resource_spans]
        log = payloads["logs"]["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0]
        root = spans[0]
        services = [{a["key"]: a["value"] for a in r["resource"]["attributes"]}["service.name"]["stringValue"] for r in resource_spans]
        self.assertEqual(services, ["gateway", "checkout", "payment", "postgres"])
        self.assertEqual([s["name"] for s in spans], ["demo.request", "demo.checkout", "demo.payment", "demo.postgres.query"])
        self.assertRegex(root["traceId"], r"^[0-9a-f]{32}$")
        self.assertRegex(root["spanId"], r"^[0-9a-f]{16}$")
        self.assertEqual((root["traceId"], root["spanId"]), (log["traceId"], log["spanId"]))
        self.assertNotIn("parentSpanId", root)
        self.assertEqual(len({s["spanId"] for s in spans}), 4)
        for parent, child in zip(spans, spans[1:]):
            self.assertEqual(root["traceId"], child["traceId"])
            self.assertEqual(parent["spanId"], child["parentSpanId"])
            self.assertLess(int(parent["startTimeUnixNano"]), int(child["startTimeUnixNano"]))
            self.assertLess(int(child["endTimeUnixNano"]), int(parent["endTimeUnixNano"]))
        for record in [*spans, log]:
            self.assertIn(emit.attribute("demo.run_id", run_id), record["attributes"])
        for resource in resource_spans:
            self.assertNotIn("demo.run_id", {a["key"] for a in resource["resource"]["attributes"]})
        self.assertEqual(root["status"]["code"], 2)
        self.assertEqual(log["severityNumber"], 17)

    def test_metrics_use_scalar_gauge_and_delta_sum_without_trace_id_dimensions(self):
        payload = emit.make_payloads(0)["metrics"]
        metrics = payload["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
        self.assertGreater(metrics[0]["gauge"]["dataPoints"][0]["asDouble"], 0)
        self.assertEqual(metrics[1]["sum"]["aggregationTemporality"], 1)
        self.assertEqual(metrics[1]["sum"]["dataPoints"][0]["asInt"], "1")
        for metric in metrics:
            datapoints = metric.get("gauge", metric.get("sum"))["dataPoints"]
            for point in datapoints:
                self.assertEqual({a["key"] for a in point["attributes"]}, {"demo.scenario", "outcome"})
        resource = payload["resourceMetrics"][0]["resource"]["attributes"]
        self.assertIn(emit.attribute("demo.synthetic", True), resource)

    def test_cloud_batch_preserves_request_and_error_counts(self):
        payloads = [emit.make_payloads(index, run_id="batch-test") for index in range(60)]
        resources = [resource for payload in payloads for resource in payload["traces"]["resourceSpans"]]
        spans = [resource["scopeSpans"][0]["spans"][0] for resource in resources]
        root_spans = [span for span in spans if span["name"] == "demo.request"]
        self.assertEqual(len(spans), 240)
        self.assertEqual(len(root_spans), 60)
        self.assertEqual(sum(span["status"]["code"] == 2 for span in root_spans), 12)
        self.assertEqual(len({span["traceId"] for span in root_spans}), 60)

    def test_http_emission_sends_each_signal_and_reports_acknowledgement(self):
        with receiver() as (endpoint, received), contextlib.redirect_stdout(io.StringIO()) as output:
            result = emit.main(["--endpoint", endpoint, "--count", "5", "--interval", "0"])
        self.assertEqual(result, 0)
        self.assertEqual(len(received), 15)
        self.assertEqual({r[0] for r in received}, {"/v1/traces", "/v1/logs", "/v1/metrics"})
        self.assertTrue(all(r[1] == "application/json" for r in received))
        self.assertIn("Verify ingestion separately", output.getvalue())
        self.assertIn("20 spans, 5 logs", output.getvalue())
        run_id = re.search(r"Run ID: ([0-9a-f-]+)", output.getvalue()).group(1)
        observed_run_ids = set()
        for path, _, payload in received:
            if path == "/v1/traces":
                for resource in payload["resourceSpans"]:
                    for span in resource["scopeSpans"][0]["spans"]:
                        observed_run_ids.update(a["value"]["stringValue"] for a in span["attributes"] if a["key"] == "demo.run_id")
            if path == "/v1/logs":
                for log in payload["resourceLogs"][0]["scopeLogs"][0]["logRecords"]:
                    observed_run_ids.update(a["value"]["stringValue"] for a in log["attributes"] if a["key"] == "demo.run_id")
            if path == "/v1/metrics":
                self.assertNotIn("demo.run_id", json.dumps(payload))
        self.assertEqual(observed_run_ids, {run_id})

    def test_partial_success_is_failure_and_stops_further_sends(self):
        with receiver({"partialSuccess": {"rejectedSpans": "1"}}) as (endpoint, received), contextlib.redirect_stderr(io.StringIO()):
            result = emit.main(["--endpoint", endpoint, "--count", "5", "--interval", "0"])
        self.assertEqual(result, 1)
        self.assertEqual(len(received), 1)

    def test_non_success_status_is_failure(self):
        with receiver(status=201) as (endpoint, _):
            with self.assertRaises(RuntimeError):
                emit.send(endpoint, "logs", emit.make_payloads(0)["logs"])

    def test_dry_run_and_remote_transport_require_explicit_choices(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(emit.main(["--dry-run"]), 0)
        self.assertEqual(set(json.loads(output.getvalue())), {"logs", "traces", "metrics"})
        with self.assertRaises(ValueError):
            emit.validate_endpoint("http://public.example.com")
        for endpoint in ("file:///tmp/collector", "https://user:secret@example.com", "https://example.com?key=secret"):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                emit.validate_endpoint(endpoint)


class ServingAssetTests(unittest.TestCase):
    def test_materialized_views_have_no_trace_identifiers_as_dimensions(self):
        schema = (ROOT / "fabric" / "schema.kql").read_text()
        views = re.findall(r"materialized-view (\w+) on table (\w+)\s*\{(.*?)\n\}", schema, re.S)
        self.assertEqual(len(views), 3)
        self.assertEqual({v[1] for v in views}, {"OTELLogs", "OTELTraces", "OTELMetrics"})
        for name, source, query in views:
            self.assertNotRegex(query, r"TraceID|SpanID|ParentID|demo\.run_id|ago\(|now\(")
            self.assertEqual(query.count("| summarize"), 1)
            self.assertTrue(query.rsplit("|", 1)[1].lstrip().startswith("summarize"))
            self.assertIn("policy retention softdelete = 30d", schema.split(f".alter materialized-view {name}")[1])

    def test_dashboard_serving_functions_exist_and_detail_queries_are_bounded(self):
        schema = (ROOT / "fabric" / "schema.kql").read_text()
        dashboard = json.loads((ROOT / "grafana" / "overview.json").read_text())
        used_functions = set()
        for panel in dashboard["panels"]:
            for target in panel.get("targets", []):
                query = target["query"]
                self.assertIn("$__timeFilter(", query)
                self.assertEqual(target["queryType"], "KQL")
                if target["resultFormat"] == "time_series":
                    self.assertIn("| order by WindowStart asc", query)
                if "OTELLogs" in query or "OTELTraces" in query:
                    self.assertIn("| take 100", query)
                used_functions.update(re.findall(r"\b(\w+Overview)\(", query))
        self.assertEqual(used_functions, {"LogsOverview", "RequestsOverview", "MetricDurationOverview"})
        for name in used_functions:
            self.assertRegex(schema, rf"function with .*?\b{name}\(")
        self.assertIn("${trace_id:singlequote}", json.dumps(dashboard))


if __name__ == "__main__":
    unittest.main()
