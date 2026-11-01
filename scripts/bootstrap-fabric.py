#!/usr/bin/env python3
"""Create a dedicated Fabric demo workspace and its Eventhouse/KQL database.

Uses Python's standard library and the current Azure CLI login. Never creates
credentials, deletes resources, migrates existing workspaces, or deploys Azure
capacity. See docs/deployment.md for prerequisites and separate identity grants.
"""

import argparse
import base64
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API_ROOT = "https://api.fabric.microsoft.com/v1"
REPO_ROOT = Path(__file__).resolve().parents[1]


class FabricError(RuntimeError):
    """An actionable API or configuration failure without credential output."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        # Do not forward bearer tokens through redirects.
        return None


def azure_cli_token():
    try:
        result = subprocess.run(
            ["az", "account", "get-access-token", "--resource",
             "https://api.fabric.microsoft.com", "--query", "accessToken", "-o", "tsv"],
            check=True, capture_output=True, text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise FabricError("Cannot obtain a Fabric token. Sign in with Azure CLI in the correct tenant and verify Fabric API permissions.") from exc
    token = result.stdout.strip()
    if not token:
        raise FabricError("Azure CLI returned no Fabric access token.")
    return token


def validate_api_url(path):
    url = API_ROOT + path if path.startswith("/") else path
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.netloc != "api.fabric.microsoft.com"
            or not parsed.path.startswith("/v1/") or parsed.fragment):
        raise FabricError("Refusing a Fabric pagination or operation URL outside the Fabric API.")
    return url


def delay_seconds(headers):
    try:
        return max(1, min(60, int(headers.get("Retry-After", "5"))))
    except ValueError:
        return 5


class FabricClient:
    def __init__(self, token_provider=azure_cli_token, opener=None, sleep=time.sleep, clock=time.monotonic):
        self.token_provider = token_provider
        self.opener = opener or urllib.request.build_opener(NoRedirect)
        self.sleep = sleep
        self.clock = clock

    def request(self, method, path, body=None):
        url = validate_api_url(path)
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(5):
            request = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": "Bearer " + self.token_provider(),
                "Content-Type": "application/json",
            })
            try:
                with self.opener.open(request, timeout=60) as response:
                    content = response.read()
                    return response.status, response.headers, json.loads(content) if content else {}
            except urllib.error.HTTPError as exc:
                if exc.code == 429 and attempt < 4:
                    retry_delay = delay_seconds(exc.headers)
                    exc.close()
                    self.sleep(retry_delay)
                    continue
                # Return structured codes, not server body text that could contain
                # a token, payload, or other tenant-specific data.
                try:
                    error_code = json.loads(exc.read()).get("errorCode", "UnknownError")
                except (ValueError, AttributeError):
                    error_code = "UnknownError"
                finally:
                    exc.close()
                if not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", str(error_code)):
                    error_code = "UnknownError"
                raise FabricError(f"Fabric HTTP {exc.code} ({error_code}); check tenant permissions, capacity state and API prerequisites.") from exc
            except urllib.error.URLError as exc:
                raise FabricError("Cannot reach the Fabric API. Check connectivity and retry; existing items can be reused.") from exc

    def list_all(self, path):
        items = []
        visited = set()
        while path:
            url = validate_api_url(path)
            if url in visited:
                raise FabricError("Fabric returned a repeated pagination URL.")
            visited.add(url)
            _, _, page = self.request("GET", url)
            items.extend(page.get("value", []))
            path = page.get("continuationUri")
        return items

    def mutate(self, method, path, body, result=False):
        status, headers, payload = self.request(method, path, body)
        if status != 202:
            return payload
        operation_url = headers.get("Location")
        if not operation_url:
            operation_id = headers.get("x-ms-operation-id")
            if not operation_id:
                raise FabricError("Fabric accepted the request without an operation URL. Inspect the workspace before retrying.")
            operation_url = API_ROOT + "/operations/" + str(uuid.UUID(operation_id))
        operation_url = validate_api_url(operation_url)
        deadline = self.clock() + 900
        while self.clock() < deadline:
            self.sleep(delay_seconds(headers))
            _, headers, operation = self.request("GET", operation_url)
            state = operation.get("status")
            if state == "Succeeded":
                if result:
                    _, _, payload = self.request("GET", operation_url.rstrip("/") + "/result")
                    return payload
                return {}
            if state in ("Failed", "Cancelled", "Canceled"):
                raise FabricError(f"Fabric operation {state}. Inspect the Fabric portal and retry after resolving the cause.")
        raise FabricError("Fabric operation did not finish within 15 minutes. Inspect the workspace before retrying.")


def unique_named(items, display_name):
    matches = [item for item in items if item.get("displayName") == display_name]
    if len(matches) > 1:
        raise FabricError(f"More than one accessible item is named {display_name!r}; use unique names or --workspace-id.")
    return matches[0] if matches else None


def definition_part(path, content):
    return {"path": path, "payload": base64.b64encode(content.encode()).decode(), "payloadType": "InlineBase64"}


def database_definition(eventhouse_id, schema):
    properties = {
        "databaseType": "ReadWrite",
        "parentEventhouseItemId": eventhouse_id,
        "oneLakeCachingPeriod": "P1D",
        "oneLakeStandardStoragePeriod": "P30D",
    }
    return {"parts": [
        definition_part("DatabaseProperties.json", json.dumps(properties)),
        definition_part("DatabaseSchema.kql", schema),
    ]}


def bootstrap(client, args, schema):
    if args.workspace_id:
        _, _, workspace = client.request("GET", "/workspaces/" + args.workspace_id)
        existing_workspace = True
    else:
        workspace = unique_named(client.list_all("/workspaces"), args.workspace_name)
        existing_workspace = workspace is not None
        if workspace:
            _, _, workspace = client.request("GET", "/workspaces/" + workspace["id"])
        else:
            workspace = client.mutate("POST", "/workspaces", {
                "displayName": args.workspace_name,
                "capacityId": args.capacity_id,
                "description": "Dedicated OpenTelemetry and Fabric observability demonstration.",
            }, result=True)
    if existing_workspace and workspace.get("capacityId", "").lower() != args.capacity_id.lower():
        raise FabricError("Existing workspace is not on the requested capacity. Assign it deliberately in Fabric or choose a new workspace; this script never migrates a workspace.")
    workspace_id = workspace["id"]
    base = "/workspaces/" + workspace_id

    eventhouse = unique_named(client.list_all(base + "/eventhouses"), args.eventhouse_name)
    if eventhouse is None:
        eventhouse = client.mutate("POST", base + "/eventhouses", {
            "displayName": args.eventhouse_name,
            "description": "OpenTelemetry logs, metrics and traces demonstration.",
            "creationPayload": {"minimumConsumptionUnits": 0},
        }, result=True)

    database = unique_named(client.list_all(base + "/kqlDatabases"), args.database_name)
    definition = database_definition(eventhouse["id"], schema)
    updated_existing_database = False
    if database is None:
        database = client.mutate("POST", base + "/kqlDatabases", {
            "displayName": args.database_name,
            "description": "Synthetic OpenTelemetry demonstration data.",
            "definition": definition,
        }, result=True)
    else:
        _, _, database = client.request("GET", base + "/kqlDatabases/" + database["id"])
        if database.get("properties", {}).get("parentEventhouseItemId") != eventhouse["id"]:
            raise FabricError("Existing database belongs to another Eventhouse; choose a unique database name.")
        if args.update_schema:
            client.mutate("POST", base + "/kqlDatabases/" + database["id"] + "/updateDefinition", {"definition": definition})
            updated_existing_database = True

    if args.grafana_principal_id:
        roles = client.list_all(base + "/roleAssignments")
        existing_roles = [role for role in roles if role.get("principal", {}).get("id", "").lower() == args.grafana_principal_id.lower()]
        if existing_roles and any(role["role"] != "Viewer" for role in existing_roles):
            raise FabricError("Grafana identity already has a broader workspace role. Review it manually; this script does not change existing grants.")
        if not existing_roles:
            client.mutate("POST", base + "/roleAssignments", {
                "principal": {"id": args.grafana_principal_id, "type": "ServicePrincipal"},
                "role": "Viewer",
            })

    # Refresh endpoints after provisioning. No secrets are persisted or printed.
    _, _, database = client.request("GET", base + "/kqlDatabases/" + database["id"])
    properties = database.get("properties", {})
    if not properties.get("queryServiceUri"):
        raise FabricError("The database exists but its query endpoint is not available yet. Wait for provisioning, then rerun to reuse the existing items.")
    return {
        "workspaceId": workspace_id,
        "eventhouseId": eventhouse["id"],
        "databaseItemId": database["id"],
        "databaseName": database["displayName"],
        "queryServiceUri": properties.get("queryServiceUri", ""),
        "ingestionServiceUri": properties.get("ingestionServiceUri", ""),
        "existingDatabaseSchemaUpdated": updated_existing_database,
    }


def uuid_argument(value):
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Expected a UUID, not an Azure ARM resource ID.") from exc


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-capacities", action="store_true", help="List accessible Fabric capacities and exit; makes no changes.")
    parser.add_argument("--capacity-id", type=uuid_argument, help="Fabric capacity UUID, not the Azure ARM ID.")
    parser.add_argument("--workspace-id", type=uuid_argument, help="Use this existing dedicated demo workspace instead of finding one by name.")
    parser.add_argument("--workspace-name", default="fabric-rti-observability")
    parser.add_argument("--eventhouse-name", default="observability")
    parser.add_argument("--database-name", default="Observability")
    parser.add_argument("--schema-file", type=Path, default=REPO_ROOT / "fabric/schema.kql")
    parser.add_argument("--update-schema", action="store_true", help="Apply the versioned schema definition to an existing database. Review schema and retention commands first.")
    parser.add_argument("--grafana-principal-id", type=uuid_argument, help="Optional Grafana managed identity OBJECT ID. Grants Viewer on the dedicated workspace.")
    args = parser.parse_args()
    if not args.list_capacities and not args.capacity_id:
        parser.error("--capacity-id is required unless --list-capacities is specified")
    for name in (args.eventhouse_name, args.database_name):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            parser.error("Eventhouse and database names may contain only letters, digits, underscores, periods and hyphens")
    return args


def main():
    args = parse_args()
    client = FabricClient()
    try:
        if args.list_capacities:
            capacities = client.list_all("/capacities")
            print(json.dumps([{key: item.get(key) for key in ("id", "displayName", "sku", "state", "region")} for item in capacities], indent=2))
            return 0
        schema = args.schema_file.read_text()
        result = bootstrap(client, args, schema)
        print(json.dumps(result, indent=2))
        return 0
    except (FabricError, OSError, ValueError, KeyError) as exc:
        print(f"Bootstrap stopped: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
