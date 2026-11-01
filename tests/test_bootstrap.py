"""Offline tests for Fabric bootstrap safety and asynchronous API behavior."""

import argparse
import base64
import importlib.util
import io
import json
from pathlib import Path
import unittest
import urllib.error

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/bootstrap-fabric.py"
SPEC = importlib.util.spec_from_file_location("bootstrap_fabric", MODULE_PATH)
bootstrap = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bootstrap)


class Response:
    def __init__(self, status, payload, headers=None):
        self.status = status
        self.payload = payload
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode()


class QueueOpener:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class ExistingClient:
    """A dedicated workspace with an existing matching database and identity."""
    def __init__(self, capacity_id="capacity", role="Viewer"):
        self.capacity_id = capacity_id
        self.role = role
        self.mutations = []

    def request(self, method, path, body=None):
        if path == "/workspaces/workspace":
            return 200, {}, {"id": "workspace", "capacityId": self.capacity_id}
        if path == "/workspaces/workspace/kqlDatabases/database":
            return 200, {}, {
                "id": "database", "displayName": "Observability",
                "properties": {"parentEventhouseItemId": "eventhouse", "queryServiceUri": "https://example.kusto.fabric.microsoft.com"},
            }
        raise AssertionError("Unexpected request: " + path)

    def list_all(self, path):
        return {
            "/workspaces": [{"id": "workspace", "displayName": "demo"}],
            "/workspaces/workspace/eventhouses": [{"id": "eventhouse", "displayName": "observability"}],
            "/workspaces/workspace/kqlDatabases": [{"id": "database", "displayName": "Observability"}],
            "/workspaces/workspace/roleAssignments": [{"principal": {"id": "grafana"}, "role": self.role}],
        }[path]

    def mutate(self, method, path, body, result=False):
        self.mutations.append((method, path, body))
        return {}


def arguments(**overrides):
    values = dict(workspace_id=None, workspace_name="demo", capacity_id="capacity",
                  eventhouse_name="observability", database_name="Observability",
                  update_schema=False, grafana_principal_id="grafana")
    values.update(overrides)
    return argparse.Namespace(**values)


class BootstrapTests(unittest.TestCase):
    def client(self, responses):
        opener = QueueOpener(responses)
        return bootstrap.FabricClient(token_provider=lambda: "test-token", opener=opener, sleep=lambda seconds: None), opener

    def test_creation_waits_for_lro_result(self):
        client, opener = self.client([
            Response(202, {}, {"Location": bootstrap.API_ROOT + "/operations/op", "Retry-After": "1"}),
            Response(200, {"status": "Running"}),
            Response(200, {"status": "Succeeded"}),
            Response(200, {"id": "eventhouse"}),
        ])
        self.assertEqual(client.mutate("POST", "/workspaces/w/eventhouses", {}, result=True), {"id": "eventhouse"})
        self.assertTrue(opener.requests[-1].full_url.endswith("/operations/op/result"))

    def test_failed_lro_stops_without_fetching_result(self):
        client, opener = self.client([
            Response(202, {}, {"Location": bootstrap.API_ROOT + "/operations/op"}),
            Response(200, {"status": "Failed"}),
        ])
        with self.assertRaisesRegex(bootstrap.FabricError, "operation Failed"):
            client.mutate("POST", "/workspaces/w/eventhouses", {}, result=True)
        self.assertEqual(len(opener.requests), 2)

    def test_untrusted_lro_does_not_receive_token(self):
        client, opener = self.client([Response(202, {}, {"Location": "https://example.com/operations/op"})])
        with self.assertRaises(bootstrap.FabricError):
            client.mutate("POST", "/workspaces/w/eventhouses", {}, result=True)
        self.assertEqual(len(opener.requests), 1)

    def test_pagination_follows_only_trusted_continuation(self):
        client, opener = self.client([
            Response(200, {"value": [{"id": "one"}], "continuationUri": bootstrap.API_ROOT + "/workspaces?continuationToken=page2"}),
            Response(200, {"value": [{"id": "two"}]}),
        ])
        self.assertEqual(client.list_all("/workspaces"), [{"id": "one"}, {"id": "two"}])

    def test_repeated_pagination_stops(self):
        client, opener = self.client([
            Response(200, {"value": [], "continuationUri": bootstrap.API_ROOT + "/workspaces"}),
        ])
        with self.assertRaisesRegex(bootstrap.FabricError, "repeated pagination"):
            client.list_all("/workspaces")

    def test_throttled_request_retries(self):
        body = io.BytesIO(b'{}')
        error = urllib.error.HTTPError(bootstrap.API_ROOT + "/workspaces", 429, "Rate limited", {"Retry-After": "1"}, body)
        client, opener = self.client([error, Response(200, {"value": []})])
        self.assertEqual(client.list_all("/workspaces"), [])
        self.assertEqual(len(opener.requests), 2)
        self.assertTrue(body.closed)

    def test_existing_resources_are_reused_without_mutations(self):
        client = ExistingClient()
        result = bootstrap.bootstrap(client, arguments(), ".create-merge table Example (Value:string)")
        self.assertEqual(result["databaseName"], "Observability")
        self.assertEqual(client.mutations, [])

    def test_first_run_creates_schema_and_read_only_grafana_access(self):
        class NewClient(ExistingClient):
            def list_all(self, path):
                return []

            def mutate(self, method, path, body, result=False):
                self.mutations.append((method, path, body))
                if path == "/workspaces":
                    return {"id": "workspace"}
                if path.endswith("/eventhouses"):
                    return {"id": "eventhouse"}
                if path.endswith("/kqlDatabases"):
                    return {"id": "database"}
                return {}

        client = NewClient()
        schema = ".create-merge table Example (Value:string)"
        bootstrap.bootstrap(client, arguments(), schema)
        self.assertEqual(client.mutations[0][2]["capacityId"], "capacity")
        self.assertEqual(client.mutations[1][2]["creationPayload"]["minimumConsumptionUnits"], 0)
        parts = client.mutations[2][2]["definition"]["parts"]
        self.assertEqual(base64.b64decode(parts[1]["payload"]).decode(), schema)
        self.assertEqual(client.mutations[3][2]["role"], "Viewer")

    def test_schema_update_is_explicit(self):
        client = ExistingClient()
        result = bootstrap.bootstrap(client, arguments(update_schema=True), ".create-merge table Example (Value:string)")
        self.assertEqual(len(client.mutations), 1)
        self.assertTrue(client.mutations[0][1].endswith("/updateDefinition"))
        self.assertTrue(result["existingDatabaseSchemaUpdated"])

    def test_missing_query_endpoint_stops_before_printing_configuration(self):
        class PendingClient(ExistingClient):
            def request(self, method, path, body=None):
                status, headers, data = super().request(method, path, body)
                data.get("properties", {}).pop("queryServiceUri", None)
                return status, headers, data

        with self.assertRaisesRegex(bootstrap.FabricError, "query endpoint is not available"):
            bootstrap.bootstrap(PendingClient(), arguments(), "schema")

    def test_workspace_capacity_mismatch_never_migrates(self):
        client = ExistingClient(capacity_id="different-capacity")
        with self.assertRaisesRegex(bootstrap.FabricError, "never migrates"):
            bootstrap.bootstrap(client, arguments(), "schema")
        self.assertEqual(client.mutations, [])

    def test_broader_existing_grafana_grant_requires_review(self):
        client = ExistingClient(role="Contributor")
        with self.assertRaisesRegex(bootstrap.FabricError, "broader workspace role"):
            bootstrap.bootstrap(client, arguments(), "schema")
        self.assertEqual(client.mutations, [])

    def test_duplicate_names_fail_closed(self):
        with self.assertRaisesRegex(bootstrap.FabricError, "More than one"):
            bootstrap.unique_named([{"displayName": "demo"}, {"displayName": "demo"}], "demo")


if __name__ == "__main__":
    unittest.main()
