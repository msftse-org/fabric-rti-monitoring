#!/usr/bin/env python3
"""Create or update the six subject-specific Fabric Real-Time Dashboards.

The definitions in fabric/dashboards are templates: navigation links are resolved
after all six Fabric items exist, then data sources are bound to an existing KQL
database. This script never deletes items or changes workspace permissions.
"""

import argparse
import copy
import importlib.util
import json
from pathlib import Path
import re
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
_SPEC = importlib.util.spec_from_file_location("bootstrap_fabric", REPO_ROOT / "scripts/bootstrap-fabric.py")
fabric = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(fabric)

DEFINITION_FILE = "RealTimeDashboard.json"
PORTAL = "https://app.fabric.microsoft.com"
SUBJECTS = ("metrics", "logs", "traces", "issues", "releases", "agents")
DESCRIPTIONS = {
    "metrics": "OpenTelemetry metrics from the demo microservices.",
    "logs": "OpenTelemetry logs from the demo microservices.",
    "traces": "OpenTelemetry traces from the demo microservices.",
    "issues": "Failed spans grouped into issues, with triage status and lifecycle alerts.",
    "releases": "Release health per service version.",
    "agents": "AI agent runs from OpenTelemetry GenAI spans.",
}
TITLES = {subject: f"Fabric RTI {subject.title()}" for subject in SUBJECTS}
TOKEN = re.compile(r"\{\{url:([a-z]+)\}\}")


def bind_data_source(template, workspace_id, database):
    """Return a copy of the template pointing at the given workspace and KQL database."""
    dashboard = copy.deepcopy(template)
    sources = dashboard.get("dataSources", [])
    if len(sources) != 1 or sources[0].get("kind") != "kusto-trident":
        raise fabric.FabricError("The dashboard template must contain exactly one kusto-trident data source.")
    query_uri = database.get("properties", {}).get("queryServiceUri", "")
    if not query_uri:
        raise fabric.FabricError("The KQL database has no query endpoint yet. Wait for provisioning, then retry.")
    fabric.kusto_management_url(query_uri)
    sources[0].update(clusterUri=query_uri.rstrip("/"), databaseArtifactId=database["id"],
                      database=database["id"], workspace=workspace_id)
    return dashboard


def resolve_navigation(template, urls):
    """Replace subject URL tokens in markdown tiles, failing closed on unknown or unresolved tokens."""
    dashboard = copy.deepcopy(template)
    for tile in dashboard.get("tiles", []):
        markdown = tile.get("markdownText")
        if markdown is not None:
            def replace(match):
                subject = match.group(1)
                if subject not in urls:
                    raise fabric.FabricError(f"Unknown dashboard navigation token {match.group(0)!r}.")
                return urls[subject]
            tile["markdownText"] = TOKEN.sub(replace, markdown)
    if TOKEN.search(json.dumps(dashboard)):
        raise fabric.FabricError("Unresolved dashboard navigation token remains in the definition.")
    return dashboard


def _ensure_item(client, base, subject, existing):
    title = TITLES[subject]
    item = fabric.unique_named(existing, title)
    if item:
        return item["id"], "updated"
    created = client.mutate("POST", base + "/kqlDashboards", {
        "displayName": title,
        "description": DESCRIPTIONS[subject],
    }, result=True)
    dashboard_id = created.get("id")
    if not dashboard_id:
        raise fabric.FabricError(f"Fabric created {title!r} without returning its item ID; inspect the workspace.")
    return dashboard_id, "created"


def deploy(client, args, templates):
    if args.workspace_id:
        _, _, workspace = client.request("GET", "/workspaces/" + args.workspace_id)
    else:
        workspace = fabric.unique_named(client.list_all("/workspaces"), args.workspace_name)
        if workspace is None:
            raise fabric.FabricError("Workspace not found. Run scripts/bootstrap-fabric.py first or pass --workspace-id.")
    workspace_id = workspace["id"]
    base = "/workspaces/" + workspace_id

    database = fabric.unique_named(client.list_all(base + "/kqlDatabases"), args.database_name,
                                   case_sensitive=False)
    if database is None:
        raise fabric.FabricError(f"KQL database {args.database_name!r} not found in the workspace.")
    _, _, database = client.request("GET", base + "/kqlDatabases/" + database["id"])

    existing = client.list_all(base + "/kqlDashboards")
    items = {subject: _ensure_item(client, base, subject, existing) for subject in SUBJECTS}
    urls = {subject: f"{PORTAL}/groups/{workspace_id}/kqldashboards/{items[subject][0]}"
            for subject in SUBJECTS}

    results = []
    for subject in SUBJECTS:
        dashboard = resolve_navigation(templates[subject], urls)
        dashboard = bind_data_source(dashboard, workspace_id, database)
        dashboard["title"] = TITLES[subject]
        definition = {"parts": [fabric.definition_part(DEFINITION_FILE, json.dumps(dashboard, ensure_ascii=False))]}
        dashboard_id, action = items[subject]
        client.mutate("POST", f"{base}/kqlDashboards/{dashboard_id}/updateDefinition",
                      {"definition": definition})
        results.append({
            "subject": subject,
            "action": action,
            "dashboardId": dashboard_id,
            "workspaceId": workspace_id,
            "databaseItemId": database["id"],
            "url": urls[subject],
        })
    return results


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", type=fabric.uuid_argument, help="Fabric workspace UUID.")
    parser.add_argument("--workspace-name", default="fabric-rti-observability",
                        help="Workspace display name, used when --workspace-id is omitted.")
    parser.add_argument("--database-name", default="Observability",
                        help="KQL database that receives the OpenTelemetry tables (case-insensitive).")
    parser.add_argument("--definitions-dir", type=Path, default=REPO_ROOT / "fabric/dashboards",
                        help="Directory containing one JSON definition per dashboard: " + ", ".join(SUBJECTS) + ".")
    return parser.parse_args(argv)


def main():
    args = parse_args()
    try:
        templates = {subject: json.loads((args.definitions_dir / f"{subject}.json").read_text())
                     for subject in SUBJECTS}
        result = deploy(fabric.FabricClient(), args, templates)
        print(json.dumps(result, indent=2))
        return 0
    except (fabric.FabricError, OSError, ValueError, KeyError) as exc:
        print(f"Dashboard deployment stopped: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
