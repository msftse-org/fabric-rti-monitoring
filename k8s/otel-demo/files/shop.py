#!/usr/bin/env python3
"""Synthetic shop service instrumented with the OpenTelemetry Python SDK.

One file serves six roles, selected by SERVICE_ROLE: gateway -> checkout ->
inventory -> payment -> shipping -> notifications. Telemetry follows the demo
contract enforced by the collector, including demo.synthetic=true.
OpenTelemetry is imported only in main() so unit tests need the stdlib only.
"""

import os
import random
import re
import signal
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.2.0"
VERSION_PATTERN = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$")
# role -> (server span name, downstream role)
ROLES = {
    "gateway": ("demo.request", "checkout"),
    "checkout": ("demo.checkout", "inventory"),
    "inventory": ("demo.inventory", "payment"),
    "payment": ("demo.payment", "shipping"),
    "shipping": ("demo.shipping", "notifications"),
    "notifications": ("demo.notifications", None),
}
SCENARIOS = ("browse", "checkout")


def local_failure(role, rng):
    """Return (exception.type, exception.message) for a failure that starts at this hop.

    Messages deliberately carry variable values (IDs, numbers, addresses) the way
    real errors do, so issue grouping has to normalize them. All values are fake.
    """
    if role == "gateway":
        return ("UpstreamTimeoutError",
                f"catalog lookup for session {uuid.UUID(int=rng.getrandbits(128))} "
                f"timed out after {rng.randint(800, 3000)} ms")
    if role == "checkout":
        return ("CartValidationError",
                f"cart {uuid.UUID(int=rng.getrandbits(128))} contains {rng.randint(1, 9)} items with stale prices")
    if role == "inventory":
        return ("StockReservationError",
                f"could not reserve sku-{rng.randint(1000, 9999)} for order "
                f"{uuid.UUID(int=rng.getrandbits(128))}: insufficient stock")
    if role == "payment":
        return ("QueryCanceledError",
                f"canceling statement due to statement timeout on orders.id={rng.randint(10000, 99999)}")
    if role == "shipping":
        return ("CarrierUnavailableError",
                f"rate service at 10.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(1, 254)} refused the connection")
    return ("SmtpDeliveryError",
            f"message to customer-{rng.randint(1000, 9999)}@example.com deferred: mailbox busy")


def downstream_failure(downstream, detail):
    """Return the exception a hop records when the service it called failed."""
    return ("DownstreamServiceError", f"{downstream} {detail}")


def record_exception(span, failure):
    """Add one OpenTelemetry exception event. No stack trace: the collector would drop it."""
    exception_type, message = failure
    span.add_event("exception", {"exception.type": exception_type, "exception.message": message})


def parse_run_id(value):
    """Return a canonical UUID string, or None for absent or malformed input."""
    if not value or len(value) > 36:
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def local_work(role, scenario, rng, failure_multiplier=1.0):
    """Return (seconds of simulated work, whether this hop fails) for one request.

    failure_multiplier scales each hop's failure probability to simulate a bad release.
    """
    if role == "gateway":
        latency = rng.uniform(0.02, 0.08) if scenario == "browse" else rng.uniform(0.005, 0.02)
        failed = scenario == "browse" and rng.random() < 0.02 * failure_multiplier
    elif role == "checkout":
        latency, failed = rng.uniform(0.01, 0.04), rng.random() < 0.01 * failure_multiplier
    elif role == "payment":
        latency, failed = rng.uniform(0.01, 0.03), rng.random() < 0.08 * failure_multiplier
    else:
        latency, failed = rng.uniform(0.01, 0.04), rng.random() < 0.01 * failure_multiplier
    if rng.random() < 0.03:
        latency += rng.uniform(0.2, 0.6)
    return latency, failed


def emit_request_log(logger, severity, attributes):
    # The Logs API leaves the event time unset (exported as 1970) unless given.
    logger.emit(timestamp=time.time_ns(), severity_number=severity, severity_text=severity.name,
                body="Request completed", attributes=attributes)


class IntervalMean:
    """Thread-safe mean per key, reset on every collection."""

    def __init__(self):
        self._lock = threading.Lock()
        self._totals = {}

    def record(self, key, value):
        with self._lock:
            total, count = self._totals.get(key, (0.0, 0))
            self._totals[key] = (total + value, count + 1)

    def collect(self):
        with self._lock:
            totals, self._totals = self._totals, {}
        return {key: total / count for key, (total, count) in totals.items()}


class Shop:
    def __init__(self, role, downstream_url, otel, rng=None, failure_multiplier=1.0):
        from opentelemetry.metrics import Observation

        self.role = role
        self.failure_multiplier = failure_multiplier
        self.span_name, downstream = ROLES[role]
        self.downstream_url = downstream_url if downstream else None
        self.otel = otel
        self.rng = rng or random.Random()
        self.tracer = otel["trace"].get_tracer("fabric-rti-monitoring-demo", VERSION)
        meter = otel["metrics"].get_meter("fabric-rti-monitoring-demo", VERSION)
        self.requests = meter.create_counter(
            "demo.requests", unit="{request}", description="Requests handled by this service")
        self.durations = IntervalMean()

        def observe(_options):
            for (scenario, outcome), mean in self.durations.collect().items():
                yield Observation(mean, {"demo.scenario": scenario, "outcome": outcome})

        # A gauge, not a histogram: the Fabric views read demo.request.duration as Gauge.
        meter.create_observable_gauge(
            "demo.request.duration", callbacks=[observe], unit="ms",
            description="Mean request duration per export interval")
        self.log = otel["logs"].get_logger("fabric-rti-monitoring-demo", VERSION)

    def handle(self, scenario, headers):
        """Serve one request inside the caller's trace; return an HTTP status."""
        otel = self.otel
        parent = otel["propagate"].extract(headers)
        run_id = parse_run_id(otel["baggage"].get_baggage("demo.run_id", parent))
        details = {"demo.scenario": scenario}
        if run_id:
            details["demo.run_id"] = run_id
        started = time.perf_counter()
        token = otel["context"].attach(parent)
        try:
            with self.tracer.start_as_current_span(
                    self.span_name, kind=otel["SpanKind"].SERVER, attributes=details) as span:
                failure = self._work(scenario, details)
                failed = failure is not None
                if failed:
                    record_exception(span, failure)
                outcome = "error" if failed else "success"
                span.set_attribute("outcome", outcome)
                span.set_status(otel["StatusCode"].ERROR if failed else otel["StatusCode"].OK)
                severity = otel["SeverityNumber"].ERROR if failed else otel["SeverityNumber"].INFO
                # Emitted inside the span so the record carries its trace and span IDs.
                emit_request_log(self.log, severity, {**details, "outcome": outcome})
        finally:
            otel["context"].detach(token)
        elapsed_ms = (time.perf_counter() - started) * 1000
        dimensions = {"demo.scenario": scenario, "outcome": outcome}
        self.requests.add(1, dimensions)
        self.durations.record((scenario, outcome), elapsed_ms)
        return 500 if failed else 200

    def _work(self, scenario, details):
        """Do this hop's work; return None on success or the (type, message) of the failure."""
        latency, failed = local_work(self.role, scenario, self.rng, self.failure_multiplier)
        failure = local_failure(self.role, self.rng) if failed else None
        if self.role == "payment":
            with self.tracer.start_as_current_span(
                    "demo.postgres.query", kind=self.otel["SpanKind"].CLIENT, attributes=details) as query:
                time.sleep(latency)
                query.set_attribute("outcome", "error" if failed else "success")
                if failed:
                    query.set_status(self.otel["StatusCode"].ERROR)
                    record_exception(query, failure)
            if failed:
                # The query failed, so the payment span reports why the charge did.
                failure = ("PaymentProcessingError",
                           f"charge for order {uuid.UUID(int=self.rng.getrandbits(128))} failed: database unavailable")
        else:
            time.sleep(latency)
        if failed or not self.downstream_url or scenario != "checkout":
            return failure
        downstream = ROLES[self.role][1]
        headers = {}
        self.otel["propagate"].inject(headers)
        request = urllib.request.Request(f"{self.downstream_url}/{scenario}", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                if response.status != 200:
                    return downstream_failure(downstream, f"returned HTTP {response.status}")
                return None
        except urllib.error.HTTPError as error:
            return downstream_failure(downstream, f"returned HTTP {error.code}")
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            return downstream_failure(downstream, "could not be reached")


def make_handler(shop):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self):
            path = urllib.parse.urlsplit(self.path).path
            if path == "/healthz":
                return self._reply(200)
            scenario = path.strip("/")
            allowed = SCENARIOS if shop.role == "gateway" else ("checkout",)
            if scenario not in allowed:
                return self._reply(404)
            # Propagators look up lower-case keys; urllib sends capitalized names.
            headers = {key.lower(): value for key, value in self.headers.items()}
            return self._reply(shop.handle(scenario, headers))

        def _reply(self, status):
            body = b"ok\n" if status == 200 else b"failed\n"
            self.send_response(status)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    return Handler


def read_release(environ):
    """Return (service.version, failure multiplier) from the environment, validated."""
    version = environ.get("SERVICE_VERSION", VERSION)
    if not VERSION_PATTERN.match(version):
        raise ValueError("SERVICE_VERSION must be 1-64 letters, digits, and . + _ - characters")
    try:
        multiplier = float(environ.get("FAILURE_MULTIPLIER", "1"))
    except ValueError:
        raise ValueError("FAILURE_MULTIPLIER must be a number") from None
    if not 0 <= multiplier <= 10:
        raise ValueError("FAILURE_MULTIPLIER must be between 0 and 10")
    return version, multiplier


def setup_telemetry(role, version=VERSION):
    from opentelemetry import baggage, context, metrics, propagate, trace
    from opentelemetry._logs import SeverityNumber, set_logger_provider
    from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.trace import SpanKind, StatusCode

    # Resource.create also merges OTEL_RESOURCE_ATTRIBUTES (the k8s.* keys).
    # demo.synthetic must be a boolean, so it is set in code, not by env var.
    resource = Resource.create({
        "service.name": role,
        "service.version": version,
        "deployment.environment.name": os.environ.get("DEPLOYMENT_ENVIRONMENT", "aks"),
        "demo.synthetic": True,
    })
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tracer_provider)
    meter_provider = MeterProvider(resource=resource, metric_readers=[
        PeriodicExportingMetricReader(OTLPMetricExporter())])
    metrics.set_meter_provider(meter_provider)
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
    set_logger_provider(logger_provider)
    return {
        "trace": trace, "metrics": metrics, "logs": logger_provider, "propagate": propagate,
        "baggage": baggage, "context": context, "SpanKind": SpanKind, "StatusCode": StatusCode,
        "SeverityNumber": SeverityNumber,
        "providers": (meter_provider, tracer_provider, logger_provider),
    }


def main():
    role = os.environ.get("SERVICE_ROLE", "")
    if role not in ROLES:
        print(f"SERVICE_ROLE must be one of {', '.join(ROLES)}", file=sys.stderr)
        return 2
    downstream_url = os.environ.get("DOWNSTREAM_URL", "").rstrip("/")
    if ROLES[role][1] and not downstream_url.startswith(("http://", "https://")):
        print("DOWNSTREAM_URL must be an HTTP(S) URL for this role", file=sys.stderr)
        return 2
    port = os.environ.get("PORT", "8080")
    if not port.isdigit() or not 1024 <= int(port) <= 65535:
        print("PORT must be an unprivileged TCP port", file=sys.stderr)
        return 2
    try:
        version, failure_multiplier = read_release(os.environ)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    otel = setup_telemetry(role, version)
    shop = Shop(role, downstream_url, otel, failure_multiplier=failure_multiplier)
    server = ThreadingHTTPServer(("0.0.0.0", int(port)), make_handler(shop))
    signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=server.shutdown).start())
    print(f"{role} listening on :{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        for provider in otel["providers"]:
            provider.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
