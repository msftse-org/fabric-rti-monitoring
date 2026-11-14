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
    def __init__(self, capacity_id="capacity", role="Viewer", database_name="Observability"):
        self.capacity_id = capacity_id
        self.role = role
        self.database_name = database_name
        self.mutations = []
        self.management_commands = []

    def request(self, method, path, body=None):
        if path == "/workspaces/workspace":
            return 200, {}, {"id": "workspace", "capacityId": self.capacity_id}
        if path == "/workspaces/workspace/kqlDatabases/database":
            return 200, {}, {
                "id": "database", "displayName": self.database_name,
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

    def execute_schema_commands(self, query_service_uri, database_name, commands):
        self.management_commands.append((query_service_uri, database_name, commands))


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

    def test_regional_lro_location_is_rebased_to_the_trusted_api(self):
        operation_id = "e198ad6f-ef92-4d16-8740-44c8114f3494"
        client, opener = self.client([
            Response(202, {}, {"Location": f"https://wabi-west-us3-a-primary-redirect.analysis.windows.net/v1/operations/{operation_id}"}),
            Response(200, {"status": "Succeeded"}),
            Response(200, {"id": "database"}),
        ])
        self.assertEqual(client.mutate("POST", "/workspaces/w/kqlDatabases", {}, result=True), {"id": "database"})
        self.assertTrue(all(request.full_url.startswith(bootstrap.API_ROOT) for request in opener.requests))

    def test_schema_policies_use_the_trusted_kusto_endpoint(self):
        opener = QueueOpener([Response(200, {})])
        client = bootstrap.FabricClient(
            token_provider=lambda: "fabric-token", kusto_token_provider=lambda: "kusto-token",
            opener=opener, sleep=lambda seconds: None,
        )
        client.execute_schema_commands(
            "https://cluster.z0.kusto.fabric.microsoft.com", "observability",
            [".alter table OTELLogs policy ingestiontime true"],
        )
        request = opener.requests[0]
        self.assertEqual(request.full_url, "https://cluster.z0.kusto.fabric.microsoft.com/v1/rest/mgmt")
        self.assertEqual(request.get_header("Authorization"), "Bearer kusto-token")
        self.assertEqual(json.loads(request.data), {
            "db": "observability", "csl": ".alter table OTELLogs policy ingestiontime true",
        })

    def test_untrusted_kusto_management_endpoint_is_rejected(self):
        opener = QueueOpener([])
        client = bootstrap.FabricClient(kusto_token_provider=lambda: "should-not-be-requested", opener=opener)
        with self.assertRaises(bootstrap.FabricError):
            client.execute_schema_commands("https://evil.example.com", "db", [".show tables"])
        self.assertEqual(opener.requests, [])

    def test_failed_lro_stops_without_fetching_result(self):
        client, opener = self.client([
            Response(202, {}, {"Location": bootstrap.API_ROOT + "/operations/op"}),
            Response(200, {"status": "Failed", "error": {"errorCode": "OperationFailed", "message": "tenant detail"}}),
        ])
        with self.assertRaisesRegex(bootstrap.FabricError, "operation Failed \\(OperationFailed\\)") as caught:
            client.mutate("POST", "/workspaces/w/eventhouses", {}, result=True)
        self.assertNotIn("tenant detail", str(caught.exception))
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

    def test_api_errors_identify_request_path_without_echoing_response_body(self):
        private_detail = "tenant-specific diagnostic"
        body = io.BytesIO(json.dumps({"errorCode": "ItemDisplayNameAlreadyInUse", "message": private_detail}).encode())
        error = urllib.error.HTTPError(
            bootstrap.API_ROOT + "/workspaces/workspace/kqlDatabases/database/updateDefinition",
            409, "Conflict", {}, body,
        )
        client, _ = self.client([error])
        with self.assertRaisesRegex(bootstrap.FabricError, "POST /v1/workspaces/workspace/kqlDatabases/database/updateDefinition") as caught:
            client.request("POST", "/workspaces/workspace/kqlDatabases/database/updateDefinition", {})
        self.assertNotIn(private_detail, str(caught.exception))

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

    def test_new_eventhouse_schema_is_applied_to_its_autocreated_database(self):
        class AutoDatabaseClient(ExistingClient):
            def request(self, method, path, body=None):
                if path == "/workspaces/workspace":
                    return 200, {}, {"id": "workspace", "capacityId": "capacity"}
                if path == "/workspaces/workspace/kqlDatabases/database":
                    return 200, {}, {
                        "id": "database", "displayName": "observability",
                        "properties": {
                            "parentEventhouseItemId": "eventhouse",
                            "queryServiceUri": "https://example.kusto.fabric.microsoft.com",
                        },
                    }
                raise AssertionError("Unexpected request: " + path)

            def list_all(self, path):
                if path == "/workspaces/workspace/kqlDatabases":
                    return [{"id": "database", "displayName": "observability"}]
                return []

            def mutate(self, method, path, body, result=False):
                self.mutations.append((method, path, body))
                if path == "/workspaces":
                    return {"id": "workspace"}
                if path.endswith("/eventhouses"):
                    return {"id": "eventhouse"}
                return {}

        client = AutoDatabaseClient()
        schema = ".create-merge table Example (Value:string)"
        result = bootstrap.bootstrap(client, arguments(), schema)
        self.assertEqual(client.management_commands[0][2], [schema])
        self.assertFalse(any(path.endswith("/kqlDatabases") for _, path, _ in client.mutations))
        self.assertFalse(result["existingDatabaseSchemaUpdated"])

    def test_schema_update_is_explicit(self):
        client = ExistingClient()
        result = bootstrap.bootstrap(client, arguments(update_schema=True), ".create-merge table Example (Value:string)")
        self.assertEqual(client.mutations, [])
        self.assertEqual(client.management_commands[0][2], [".create-merge table Example (Value:string)"])
        self.assertTrue(result["existingDatabaseSchemaUpdated"])

    def test_autocreated_database_is_reused_despite_name_casing(self):
        client = ExistingClient(database_name="observability")
        result = bootstrap.bootstrap(client, arguments(update_schema=True), ".create-merge table Example (Value:string)")
        self.assertEqual(result["databaseName"], "observability")
        self.assertEqual(client.mutations, [])
        self.assertEqual(client.management_commands[0][2], [".create-merge table Example (Value:string)"])

    def test_schema_commands_are_applied_only_when_schema_is_updated(self):
        client = ExistingClient(database_name="observability")
        schema = "\n".join([
            ".create-merge table OTELLogs (Timestamp:datetime)",
            ".alter-merge table OTELLogs policy retention softdelete = 7d",
            ".alter table OTELLogs policy ingestiontime true",
        ])
        result = bootstrap.bootstrap(client, arguments(update_schema=True), schema)
        self.assertTrue(result["existingDatabaseSchemaUpdated"])
        self.assertEqual(client.management_commands, [(
            "https://example.kusto.fabric.microsoft.com",
            "observability",
            [
                ".create-merge table OTELLogs (Timestamp:datetime)",
                ".alter-merge table OTELLogs policy retention softdelete = 7d",
                ".alter table OTELLogs policy ingestiontime true",
            ],
        )])

    def test_schema_parser_keeps_multiline_view_and_skips_comments(self):
        schema = """// a schema comment
.create-or-alter materialized-view Logs1m on table OTELLogs {
    OTELLogs
    | summarize Rows=count()
}

.create-or-alter function LogsOverview() {
    Logs1m
}
"""
        self.assertEqual(bootstrap.split_schema_commands(schema), [
            ".create-or-alter materialized-view Logs1m on table OTELLogs {\n    OTELLogs\n    | summarize Rows=count()\n}",
            ".create-or-alter function LogsOverview() {\n    Logs1m\n}",
        ])

    def test_missing_query_endpoint_stops_before_printing_configuration(self):
        class PendingClient(ExistingClient):
            def request(self, method, path, body=None):
                status, headers, data = super().request(method, path, body)
                data.get("properties", {}).pop("queryServiceUri", None)
                return status, headers, data

        with self.assertRaisesRegex(bootstrap.FabricError, "query endpoint is not available"):
            bootstrap.bootstrap(PendingClient(), arguments(), ".create-merge table Example (Value:string)")

    def test_workspace_capacity_mismatch_never_migrates(self):
        client = ExistingClient(capacity_id="different-capacity")
        with self.assertRaisesRegex(bootstrap.FabricError, "never migrates"):
            bootstrap.bootstrap(client, arguments(), ".create-merge table Example (Value:string)")
        self.assertEqual(client.mutations, [])

    def test_broader_existing_grafana_grant_requires_review(self):
        client = ExistingClient(role="Contributor")
        with self.assertRaisesRegex(bootstrap.FabricError, "broader workspace role"):
            bootstrap.bootstrap(client, arguments(), ".create-merge table Example (Value:string)")
        self.assertEqual(client.mutations, [])

    def test_duplicate_names_fail_closed(self):
        with self.assertRaisesRegex(bootstrap.FabricError, "More than one"):
            bootstrap.unique_named([{"displayName": "demo"}, {"displayName": "demo"}], "demo")


DEPLOY_SPEC = importlib.util.spec_from_file_location(
    "deploy_fabric_dashboard", MODULE_PATH.parent / "deploy-fabric-dashboard.py")
deploy = importlib.util.module_from_spec(DEPLOY_SPEC)
DEPLOY_SPEC.loader.exec_module(deploy)
TEMPLATES = {
    subject: json.loads((MODULE_PATH.parents[1] / f"fabric/dashboards/{subject}.json").read_text())
    for subject in deploy.SUBJECTS
}


class DashboardClient(ExistingClient):
    def __init__(self, dashboards=(), **kwargs):
        super().__init__(**kwargs)
        self.dashboards = list(dashboards)

    def list_all(self, path):
        if path == "/workspaces/workspace/kqlDashboards":
            return self.dashboards
        return super().list_all(path)

    def mutate(self, method, path, body, result=False):
        self.mutations.append((method, path, body))
        if result:
            return {"id": "new-" + body["displayName"].split()[-1].lower()}
        return {}


def deployed_dashboard(body):
    part, = body["definition"]["parts"]
    return part["path"], json.loads(base64.b64decode(part["payload"]))


class DashboardDeployTests(unittest.TestCase):
    def arguments(self, **overrides):
        return deploy.parse_args(["--database-name", "observability"] +
                                 [item for key, value in overrides.items() for item in (key, value)])

    def test_three_definitions_are_bound_and_navigation_urls_are_resolved(self):
        dashboards = [{"id": subject, "displayName": deploy.TITLES[subject]} for subject in deploy.SUBJECTS]
        client = DashboardClient(dashboards)
        results = deploy.deploy(client, self.arguments(**{"--workspace-name": "demo"}), TEMPLATES)
        self.assertEqual(len(client.mutations), 3)
        self.assertEqual([result["subject"] for result in results], list(deploy.SUBJECTS))
        for (method, path, body), subject, result in zip(client.mutations, deploy.SUBJECTS, results):
            self.assertEqual((method, path), (
                "POST", f"/workspaces/workspace/kqlDashboards/{subject}/updateDefinition"))
            name, dashboard = deployed_dashboard(body)
            self.assertEqual(name, "RealTimeDashboard.json")
            source, = dashboard["dataSources"]
            self.assertEqual(source | {"id": None}, {
                "id": None, "kind": "kusto-trident", "name": "observability",
                "clusterUri": "https://example.kusto.fabric.microsoft.com", "databaseArtifactId": "database",
                "database": "database", "workspace": "workspace"})
            self.assertEqual(dashboard["title"], deploy.TITLES[subject])
            self.assertEqual(result["action"], "updated")
            self.assertEqual(result["url"], f"https://app.fabric.microsoft.com/groups/workspace/"
                             f"kqldashboards/{subject}")
            self.assertNotIn("{{url:", json.dumps(dashboard))
            for sibling in set(deploy.SUBJECTS) - {subject}:
                self.assertIn(f"https://app.fabric.microsoft.com/groups/workspace/kqldashboards/{sibling}",
                              json.dumps(dashboard))
            self.assertIn("<eventhouse>", TEMPLATES[subject]["dataSources"][0]["clusterUri"],
                          "the template is not mutated")

    def test_missing_dashboards_are_created_then_updated(self):
        client = DashboardClient()
        results = deploy.deploy(client, self.arguments(**{"--workspace-name": "demo"}), TEMPLATES)
        self.assertEqual([(result["action"], result["dashboardId"]) for result in results],
                         [("created", "new-" + subject) for subject in deploy.SUBJECTS])
        creates = [mutation for mutation in client.mutations if mutation[1] == "/workspaces/workspace/kqlDashboards"]
        updates = [mutation for mutation in client.mutations if mutation[1].endswith("/updateDefinition")]
        self.assertEqual(len(creates), 3)
        self.assertEqual(len(updates), 3)
        self.assertEqual([mutation[2]["displayName"] for mutation in creates],
                         [deploy.TITLES[subject] for subject in deploy.SUBJECTS])

    def test_missing_database_or_untrusted_endpoint_stops_before_mutation(self):
        client = DashboardClient()
        with self.assertRaisesRegex(deploy.fabric.FabricError, "not found"):
            deploy.deploy(client, self.arguments(**{"--workspace-name": "demo", "--database-name": "other"}),
                          TEMPLATES)
        with self.assertRaisesRegex(deploy.fabric.FabricError, "outside the Fabric query service"):
            deploy.bind_data_source(TEMPLATES["metrics"], "workspace", {
                "id": "database", "properties": {"queryServiceUri": "https://attacker.example.com"}})
        self.assertEqual(client.mutations, [])

    def test_unknown_navigation_token_fails_closed(self):
        template = json.loads(json.dumps(TEMPLATES["metrics"]))
        template["tiles"][0]["markdownText"] = "[Unknown]({{url:unknown}})"
        with self.assertRaisesRegex(deploy.fabric.FabricError, "Unknown dashboard navigation token"):
            deploy.resolve_navigation(template, {"metrics": "https://example/metrics"})


if __name__ == "__main__":
    unittest.main()
