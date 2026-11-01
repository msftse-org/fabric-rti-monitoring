#!/usr/bin/env python3
"""Send a bounded synthetic OTLP/HTTP JSON dataset without an application or SDK."""

import argparse
import copy
import json
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def attribute(key, value):
    value_type = "boolValue" if isinstance(value, bool) else "stringValue"
    return {"key": key, "value": {value_type: value}}


def make_payloads(index, now_ns=None):
    """One request: two parent/child spans, a correlated log, and two metrics."""
    end = now_ns if now_ns is not None else time.time_ns()
    duration_ms = 40 + (index % 8) * 25
    start = end - duration_ms * 1_000_000
    failed = index % 5 == 4
    outcome = "error" if failed else "success"
    trace_id, root_id, child_id = secrets.token_hex(16), secrets.token_hex(8), secrets.token_hex(8)
    resource = {"attributes": [
        attribute("service.name", "synthetic-checkout"),
        attribute("service.version", "1.0.0"),
        attribute("deployment.environment.name", "demo"),
        attribute("demo.synthetic", True),
    ]}
    scope = {"name": "fabric-rti-monitoring-demo", "version": "1.0.0"}
    dimensions = [attribute("demo.scenario", "checkout"), attribute("outcome", outcome)]
    root = {
        "traceId": trace_id, "spanId": root_id, "name": "demo.request", "kind": 2,
        "startTimeUnixNano": str(start), "endTimeUnixNano": str(end),
        "attributes": copy.deepcopy(dimensions), "status": {"code": 2 if failed else 1},
    }
    child = {
        "traceId": trace_id, "spanId": child_id, "parentSpanId": root_id,
        "name": "demo.storage.read", "kind": 3,
        "startTimeUnixNano": str(start + 5_000_000),
        "endTimeUnixNano": str(end - 5_000_000),
        "attributes": copy.deepcopy(dimensions), "status": {"code": 2 if failed else 1},
    }
    log = {
        "timeUnixNano": str(end), "observedTimeUnixNano": str(end),
        "traceId": trace_id, "spanId": root_id,
        "severityNumber": 17 if failed else 9,
        "severityText": "ERROR" if failed else "INFO",
        "body": {"stringValue": "Synthetic request completed"},
        "attributes": copy.deepcopy(dimensions),
    }
    point = {"timeUnixNano": str(end), "attributes": copy.deepcopy(dimensions)}
    metrics = [
        {"name": "demo.request.duration", "description": "Synthetic request duration", "unit": "ms",
         "gauge": {"dataPoints": [{**copy.deepcopy(point), "asDouble": float(duration_ms)}]}},
        {"name": "demo.requests", "description": "Synthetic requests per emission", "unit": "{request}",
         "sum": {"aggregationTemporality": 1, "isMonotonic": True,
                 "dataPoints": [{**copy.deepcopy(point), "startTimeUnixNano": str(start), "asInt": "1"}]}},
    ]
    return {
        "traces": {"resourceSpans": [{"resource": copy.deepcopy(resource),
                    "scopeSpans": [{"scope": copy.deepcopy(scope), "spans": [root, child]}]}]},
        "logs": {"resourceLogs": [{"resource": copy.deepcopy(resource),
                  "scopeLogs": [{"scope": copy.deepcopy(scope), "logRecords": [log]}]}]},
        "metrics": {"resourceMetrics": [{"resource": copy.deepcopy(resource),
                     "scopeMetrics": [{"scope": copy.deepcopy(scope), "metrics": metrics}]}]},
    }


def validate_endpoint(endpoint):
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Endpoint must be an HTTP or HTTPS URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Endpoint must not contain credentials, a query, or a fragment")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("Use HTTPS for remote collectors; plain HTTP is limited to loopback")
    return endpoint.rstrip("/")


def send(endpoint, signal, payload):
    request = urllib.request.Request(
        f"{endpoint}/v1/{signal}", data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    # No automatic retry: retries can duplicate telemetry and obscure this demo.
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"Collector returned HTTP {response.status} for {signal}")
        raw = response.read()
        result = json.loads(raw) if raw else {}
        partial = result.get("partialSuccess", {})
        if partial.get("errorMessage") or any(
            int(partial.get(key, 0)) > 0
            for key in ("rejectedSpans", "rejectedLogRecords", "rejectedDataPoints")
        ):
            raise RuntimeError(f"Collector reported partial success for {signal}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default="http://localhost:4318", help="OTLP HTTP base URL")
    parser.add_argument("--count", type=int, default=12, help="Number of requests, from 1 to 1000")
    parser.add_argument("--interval", type=float, default=0.2, help="Seconds between requests, from 0 to 60")
    parser.add_argument("--dry-run", action="store_true", help="Print one request's three payloads; send nothing")
    args = parser.parse_args(argv)
    if not 1 <= args.count <= 1000:
        parser.error("--count must be between 1 and 1000")
    if not 0 <= args.interval <= 60:
        parser.error("--interval must be between 0 and 60")
    try:
        endpoint = validate_endpoint(args.endpoint)
        if args.dry_run:
            print(json.dumps(make_payloads(0), indent=2))
            return 0
        for index in range(args.count):
            for signal, payload in make_payloads(index).items():
                send(endpoint, signal, payload)
            if index + 1 < args.count:
                time.sleep(args.interval)
        print(f"Collector acknowledged {args.count * 2} spans, {args.count} logs, "
              f"and {args.count * 2} metric points. Verify ingestion separately in KQL.")
        return 0
    except (ValueError, urllib.error.URLError, RuntimeError) as error:
        # Avoid printing URL errors, which can contain proxy or endpoint details.
        print(f"Demo failed: {type(error).__name__}. Check collector health and logs.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
