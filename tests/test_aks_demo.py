"""Offline tests for the AKS OpenTelemetry demo chart, apps, and contracts."""

import importlib.util
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
        payment.rng = None
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
            self.assertFalse(payment._work("checkout", {}))
            request = send.call_args.args[0]
            self.assertEqual(request.full_url, "http://shipping:8080/checkout")
            self.assertEqual(request.get_header("Traceparent"), "test-parent")
            payment.tracer.start_as_current_span.assert_called_once()

    def test_failed_payment_does_not_ship_and_downstream_failure_propagates(self):
        payment = self.payment()
        with patch.object(shop, "local_work", return_value=(0, True)), \
                patch.object(shop.urllib.request, "urlopen") as send:
            self.assertTrue(payment._work("checkout", {}))
            send.assert_not_called()
        with patch.object(shop, "local_work", return_value=(0, False)), \
                patch.object(shop.urllib.request, "urlopen", side_effect=ConnectionError):
            self.assertTrue(payment._work("checkout", {}))

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


class LoadgenTests(unittest.TestCase):
    def test_defaults_target_the_in_cluster_gateway(self):
        self.assertEqual(loadgen.read_settings({}), ("http://gateway:8080", 1.0, 0.5, 3600))

    def test_unsafe_or_out_of_range_settings_are_rejected(self):
        for environ in (
            {"TARGET_URL": "ftp://gateway:8080"},
            {"TARGET_URL": "http://user:secret@gateway:8080"},
            {"TARGET_URL": "http://gateway:8080/checkout"},
            {"TARGET_URL": "http://gateway:8080?x=1"},
            {"REQUESTS_PER_SECOND": "50"},
            {"CHECKOUT_RATIO": "1.5"},
            {"RUN_ID_ROTATION_SECONDS": "5"},
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
        expected_ingress = {"gateway": "loadgen"}
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
