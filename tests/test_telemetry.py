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

    def test_failing_spans_carry_one_exception_event_and_successful_spans_none(self):
        def events(index):
            payloads = emit.make_payloads(index)
            return [s.get("events") for r in payloads["traces"]["resourceSpans"]
                    for s in r["scopeSpans"][0]["spans"]]

        self.assertEqual(events(0), [None] * 4)
        failing = events(4)
        self.assertTrue(all(len(e) == 1 and e[0]["name"] == "exception" for e in failing))
        types = [{a["key"]: a["value"]["stringValue"] for a in e[0]["attributes"]}["exception.type"] for e in failing]
        self.assertEqual(types, ["DownstreamServiceError", "DownstreamServiceError",
                                 "PaymentProcessingError", "QueryCanceledError"])
        # Messages differ per request, so grouping must normalize them; counts are unchanged.
        self.assertNotEqual(events(4)[3][0]["attributes"], events(9)[3][0]["attributes"])
        self.assertEqual(sum(len(r["scopeSpans"][0]["spans"])
                             for r in emit.make_payloads(4)["traces"]["resourceSpans"]), 4)

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
            self.assertIn(f".alter materialized-view {name} policy caching hot = 1d", schema)

    def dashboards(self):
        return {name: json.loads((ROOT / "grafana" / f"{name}.json").read_text())
                for name in ("metrics", "logs", "traces")}

    def targets(self, dashboard):
        return [(panel, target) for panel in dashboard["panels"] for target in panel.get("targets", [])]

    def test_one_dashboard_per_signal_with_shared_navigation(self):
        dashboards = self.dashboards()
        self.assertEqual(sorted(path.name for path in (ROOT / "grafana").glob("*.json")
                                if "panels" in json.loads(path.read_text())),
                         ["logs.json", "metrics.json", "traces.json"])
        for name, dashboard in dashboards.items():
            self.assertEqual(dashboard["uid"], f"fabric-rti-{name}")
            self.assertIn("fabric-rti", dashboard["tags"])
            self.assertIn(name, dashboard["tags"])
            self.assertEqual(dashboard["links"][0]["type"], "dashboards")
            self.assertEqual(dashboard["links"][0]["tags"], ["fabric-rti"])
            self.assertTrue(dashboard["links"][0]["keepTime"])
            self.assertEqual([item["name"] for item in dashboard["__inputs"]], ["DS_FABRIC"])
        signals = {name: {table for _, target in self.targets(dashboard)
                          for table in re.findall(r"\bOTEL(?:Logs|Traces|Metrics)\b", target["query"])}
                   for name, dashboard in dashboards.items()}
        self.assertEqual(signals["logs"], {"OTELLogs"})
        self.assertNotIn("OTELMetrics", signals["traces"])
        self.assertIn("OTELMetrics", signals["metrics"])

    def test_dashboard_serving_functions_exist_and_detail_queries_are_bounded(self):
        schema = (ROOT / "fabric" / "schema.kql").read_text()
        used_functions = set()
        for dashboard in self.dashboards().values():
            for panel, target in self.targets(dashboard):
                query = target["query"]
                with self.subTest(dashboard=dashboard["uid"], panel=panel["title"], ref=target["refId"]):
                    self.assertIn("$__timeFilter(", query)
                    self.assertEqual(target["queryType"], "KQL")
                    self.assertIn("${environment:singlequote}", query)
                    self.assertIn("${service:singlequote}", query)
                    if target["resultFormat"] == "time_series":
                        self.assertIn("| order by WindowStart asc", query)
                        self.assertRegex(query, r'Series=strcat\(Environment, " / ')
                        if "OTELTraces" in query and panel["type"] == "timeseries":
                            self.assertIn("| summarize", query)
                    if target["resultFormat"] in ("table", "logs") and panel["type"] != "stat" and re.search(
                            r"\bOTEL(Logs|Traces)\b", query):
                        limits = [int(n) for n in re.findall(r"\| (?:take|top) (\d+)", query)]
                        self.assertTrue(limits and max(limits) <= 200, "raw detail queries must be bounded")
                    if target["resultFormat"] == "trace":
                        self.assertIn("| where TraceID == selected_trace", query)
                used_functions.update(re.findall(r"\b(\w+Overview)\(", query))
        self.assertEqual(used_functions, {"LogsOverview", "RequestsOverview", "MetricDurationOverview"})
        for name in used_functions:
            self.assertRegex(schema, rf"function with .*?\b{name}\(")

    def test_traces_dashboard_has_waterfall_and_service_map(self):
        dashboard = self.dashboards()["traces"]
        panels = {panel["type"]: panel for panel in dashboard["panels"]}
        waterfall = panels["traces"]["targets"][0]
        self.assertEqual(waterfall["resultFormat"], "trace")
        query = waterfall["query"]
        for column in ("traceID=", "spanID=", "parentSpanID=", "operationName=", "serviceName=", "serviceTags=",
                       "startTime=", "duration=", "tags=", "logs=", '["kind"]=', "statusCode="):
            self.assertIn(column, query)
        for clause in ("isempty(requested_trace)", "Spans > 1", "First < ago(1m)", "set_difference(Parents, Ids)"):
            self.assertIn(clause, query, "a blank trace ID must select a settled, complete trace")
        self.assertIn('tolong((Timestamp - datetime(1970-01-01)) / 1ms)', query)
        self.assertEqual(panels["logs"]["targets"][0]["resultFormat"], "logs")
        node_graph = panels["nodeGraph"]
        nodes, edges = (target["query"] for target in node_graph["targets"])
        self.assertEqual([target["refId"] for target in node_graph["targets"]], ["nodes", "edges"])
        for field in ("id=", "title=", "mainstat=", "secondarystat=", "arc__failed=", "arc__ok="):
            self.assertIn(field, nodes)
        for field in ("id=", "source", "target", "mainstat="):
            self.assertIn(field, edges)
        self.assertIn('SpanKind == "SPAN_KIND_SERVER"', nodes)
        trace_view = next(var for var in dashboard["templating"]["list"] if var["name"] == "trace_view")
        self.assertEqual([option["value"] for option in trace_view["options"]], ["recent", "errors", "slowest"])

    def test_trace_links_open_the_waterfall_and_logs_with_context(self):
        links = []
        for dashboard in self.dashboards().values():
            for panel in dashboard["panels"]:
                for override in panel["fieldConfig"]["overrides"]:
                    if override["matcher"]["options"] == "TraceID":
                        links += [(panel["type"], link) for prop in override["properties"]
                                  if prop["id"] == "links" for link in prop["value"]]
        self.assertTrue(links)
        targets = set()
        for panel_type, link in links:
            self.assertEqual(panel_type, "table", "logs panels ignore field-override data links")
            url = link["url"]
            self.assertRegex(url, r"^/d/fabric-rti-(traces|logs)/fabric-rti-(traces|logs)\?",
                             "Grafana resolves query-only links against the site root")
            self.assertIn("var-trace_id=${__value.raw}", url)
            self.assertIn("var-environment=${environment:percentencode}", url)
            self.assertIn("from=${__from}&to=${__to}", url)
            targets.add(url.split("/")[2])
        self.assertEqual(targets, {"fabric-rti-traces", "fabric-rti-logs"})

    def test_service_views_measure_server_spans(self):
        for dashboard in self.dashboards().values():
            for panel, target in self.targets(dashboard):
                query = target["query"]
                if "OTELTraces" in query and panel["title"] in (
                        "p95 latency from server spans", "Service health", "Service map"):
                    self.assertIn('SpanKind == "SPAN_KIND_SERVER"', query)
                    self.assertNotIn("RequestsOverview(", query)


class RealTimeDashboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dashboards = {
            subject: json.loads((ROOT / "fabric" / "dashboards" / f"{subject}.json").read_text())
            for subject in ("metrics", "logs", "traces")
        }

    def queries_for(self, dashboard):
        return {query["id"]: query for query in dashboard["queries"]}

    def tile_queries(self, dashboard):
        queries = self.queries_for(dashboard)
        return [(tile, queries[tile["queryRef"]["queryId"]]["text"])
                for tile in dashboard["tiles"] if "queryRef" in tile]

    def test_three_single_page_dashboards_have_matching_titles_and_refresh(self):
        expected = {
            "metrics": ("Fabric RTI Metrics", "Metrics", "30s"),
            "logs": ("Fabric RTI Logs", "Logs", "30s"),
            "traces": ("Fabric RTI Traces", "Traces", "1m"),
        }
        for subject, (title, page, refresh) in expected.items():
            with self.subTest(subject=subject):
                dashboard = self.dashboards[subject]
                self.assertEqual(dashboard["schema_version"], 75)
                self.assertEqual(dashboard["title"], title)
                self.assertEqual([item["name"] for item in dashboard["pages"]], [page])
                self.assertEqual(dashboard["autoRefresh"]["defaultInterval"], refresh)
                source, = dashboard["dataSources"]
                self.assertEqual(source["kind"], "kusto-trident")
                self.assertEqual(source["clusterUri"], "https://<eventhouse>.kusto.fabric.microsoft.com")
                for key in ("databaseArtifactId", "database", "workspace"):
                    self.assertEqual(source[key], "00000000-0000-0000-0000-000000000000",
                                     "commit no tenant identifiers")
                for query in dashboard["queries"]:
                    self.assertEqual(query["dataSource"], {"kind": "inline", "dataSourceId": source["id"]})

    def test_references_resolve_and_tiles_fit_without_overlap_or_cross_page_drillthrough(self):
        for subject, dashboard in self.dashboards.items():
            queries = self.queries_for(dashboard)
            parameters = {parameter["id"]: parameter for parameter in dashboard["parameters"]}
            page_ids = {page["id"] for page in dashboard["pages"]}
            bases = {base["queryId"] for base in dashboard["baseQueries"]}
            self.assertTrue(bases <= set(queries))
            for parameter in parameters.values():
                self.assertTrue(set(parameter["showOnPages"].get("pageIds", [])) <= page_ids)
                if parameter.get("dataSource", {}).get("kind") == "query":
                    self.assertIn(parameter["dataSource"]["queryRef"]["queryId"], queries)
            occupied = set()
            for tile in dashboard["tiles"]:
                with self.subTest(subject=subject, tile=tile["title"]):
                    self.assertIn(tile["pageId"], page_ids)
                    layout = tile["layout"]
                    self.assertLessEqual(layout["x"] + layout["width"], 24)
                    for cell in ((x, y) for x in range(layout["x"], layout["x"] + layout["width"])
                                 for y in range(layout["y"], layout["y"] + layout["height"])):
                        self.assertNotIn(cell, occupied)
                        occupied.add(cell)
                    options = tile.get("visualOptions", {})
                    self.assertFalse(options.get("drillthrough"), "cross-dashboard drillthrough is unsupported")
                    for link in options.get("crossFilter", []):
                        self.assertIn(link["parameterId"], parameters)

    def test_used_variables_match_each_dashboard_query(self):
        for subject, dashboard in self.dashboards.items():
            names = {parameter.get(key) for parameter in dashboard["parameters"]
                     for key in ("variableName", "beginVariableName", "endVariableName")} - {None}
            names |= {base["variableName"] for base in dashboard["baseQueries"]}
            for query in dashboard["queries"]:
                with self.subTest(subject=subject, query=query["id"]):
                    used = {name for name in names if re.search(rf"\b{name}\b", query["text"])}
                    self.assertEqual(set(query["usedVariables"]), used, query["text"][:80])

    def test_tile_queries_keep_time_environment_and_service_scope(self):
        for subject, dashboard in self.dashboards.items():
            base_queries = {base["variableName"] for base in dashboard["baseQueries"]}
            for tile, text in self.tile_queries(dashboard):
                with self.subTest(subject=subject, tile=tile["title"]):
                    if tile["visualType"] == "card":
                        self.assertRegex(text, rf"^({'|'.join(base_queries)})\n\| project \w+$")
                        continue
                    if "selected_trace" in text:
                        self.assertIn("let selected_trace", text)
                        self.assertIn("TraceID == selected_trace", text)
                        continue
                    self.assertRegex(text, r"between \(_startTime \.\. _endTime\)")
                    self.assertIn("isempty(_environment) or", text)
                    if tile["title"] != "Gateway latency (ms) · RequestsOverview":
                        self.assertIn("isempty(_service) or", text)
            for base in dashboard["baseQueries"]:
                text = self.queries_for(dashboard)[base["queryId"]]["text"]
                self.assertNotIn("let ", text, "base queries are composed into tile queries")
                self.assertIn("isempty(_environment) or", text)

    def test_detail_tables_are_bounded_and_every_visual_is_native(self):
        for subject, dashboard in self.dashboards.items():
            for tile, text in self.tile_queries(dashboard):
                with self.subTest(subject=subject, tile=tile["title"]):
                    self.assertNotIn(tile["visualType"], ("plotly", "embeddedapp"),
                                     "these visuals need an editor-identity cloud connection that has no API")
                    self.assertNotIn("plotly", text)
                    if tile["visualType"] == "table":
                        limits = [int(n) for n in re.findall(r"\| (?:take|top) (\d+)", text)]
                        self.assertTrue(limits and max(limits) <= 500)
            title_types = {tile["title"]: tile["visualType"] for tile in dashboard["tiles"]}
            if subject == "traces":
                self.assertEqual(title_types["Spans in this trace"], "table")
                self.assertEqual(title_types["Service dependencies"], "table")

    def test_trace_waterfall_and_dependency_chart_are_native_stacked_bars(self):
        dashboard = self.dashboards["traces"]
        queries = self.queries_for(dashboard)
        tiles = {tile["title"]: tile for tile in dashboard["tiles"]}

        def query_text(title):
            return queries[tiles[title]["queryRef"]["queryId"]]["text"]

        # The visual sorts series by name and draws the last one at the base of each bar.
        for title, base_series in (("Trace waterfall", "start offset (ms)"), ("Calls by dependency", "calls/min ok")):
            with self.subTest(tile=title):
                options = tiles[title]["visualOptions"]
                self.assertEqual(tiles[title]["visualType"], "stackedbar")
                for column in (options["xColumn"], *options["yColumns"]):
                    self.assertIn(column, query_text(title))
                self.assertTrue(options["forceAxisTicks"], "every row label must be shown")
                self.assertEqual(max(options["yColumns"]), base_series)
        waterfall = tiles["Trace waterfall"]["visualOptions"]
        self.assertEqual(waterfall["seriesColors"]["start offset (ms)"], "rgba(0,0,0,0)")
        self.assertTrue(waterfall["hideLegend"])
        # Rows sharing a label would collapse into one category.
        self.assertIn("row_number(1, Label != prev(Label))", query_text("Trace waterfall"))
        self.assertIn("Logs=coalesce(Logs, 0)", query_text("Spans in this trace"))

    def test_cross_dashboard_navigation_and_trace_id_handoff(self):
        traces = self.dashboards["traces"]
        trace = next(parameter for parameter in traces["parameters"]
                     if parameter.get("variableName") == "_trace_id")
        self.assertEqual(trace["defaultValue"], {"kind": "query-result"})
        targets = {link["parameterId"] for tile in traces["tiles"]
                   for link in tile.get("visualOptions", {}).get("crossFilter", [])}
        self.assertIn(trace["id"], targets)
        for subject, dashboard in self.dashboards.items():
            markdown = "\n".join(tile.get("markdownText", "") for tile in dashboard["tiles"])
            for sibling in set(self.dashboards) - {subject}:
                self.assertIn(f"{{{{url:{sibling}}}}}", markdown)
            self.assertNotIn(f"{{{{url:{subject}}}}}", markdown)
            if subject == "traces":
                self.assertIn("paste one from Logs into **Trace ID**", markdown)
                queries = self.queries_for(dashboard)
                picker = next(parameter for parameter in dashboard["parameters"]
                              if parameter.get("variableName") == "_trace_id")
                picker_text = queries[picker["dataSource"]["queryRef"]["queryId"]]["text"]
                self.assertIn('strcat(TraceID, " · "', picker_text)
                trace_id = next(parameter for parameter in dashboard["parameters"]
                                if parameter.get("variableName") == "_trace_lookup")
                self.assertIn("overrides Trace", trace_id["description"])
                self.assertIn("TraceID == pasted_trace", queries[next(
                    tile["queryRef"]["queryId"] for tile in dashboard["tiles"] if tile["title"] == "Find a trace"
                )]["text"])


if __name__ == "__main__":
    unittest.main()
