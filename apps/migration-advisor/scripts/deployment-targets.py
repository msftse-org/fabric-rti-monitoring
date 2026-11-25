"""Generate an allowlisted, non-secret target inventory for protected hosting."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import urllib.request


def az(*arguments):
    return json.loads(subprocess.check_output(["az", *arguments, "-o", "json"], text=True))


def generate(args):
    fabric = json.loads(Path(args.fabric_config).read_text())
    token = az("account", "get-access-token", "--resource", "https://api.fabric.microsoft.com")["accessToken"]
    base = "https://api.fabric.microsoft.com/v1/workspaces/" + fabric["workspaceId"]

    def get(url):
        request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    workspace = get(base)
    eventhouse = get(base + "/items/" + fabric["eventhouseId"])
    collector = az("containerapp", "show", "--resource-group", args.resource_group, "--name", args.collector)
    grafana = az("grafana", "show", "--resource-group", args.resource_group, "--name", args.grafana)
    fqdn = collector["properties"]["configuration"]["ingress"].get("fqdn", "")
    inventory = {
        "version": 1,
        "discoveredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "workspaceName": workspace["displayName"],
        "eventhouseName": eventhouse["displayName"],
        "queryUri": fabric["queryServiceUri"],
        "database": fabric["databaseName"],
        "grafanaUrl": grafana["properties"]["endpoint"],
        "collectorName": collector["name"],
        "collectorEndpoint": "https://" + fqdn if fqdn else "",
    }
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(inventory, indent=2) + "\n")
    print("Wrote non-secret deployment target inventory to", target)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fabric-config", required=True, help="Existing local Fabric bootstrap output.")
    parser.add_argument("--resource-group", required=True)
    parser.add_argument("--collector", required=True)
    parser.add_argument("--grafana", required=True)
    parser.add_argument("--output", default="apps/migration-advisor/packages/frontend/public/deployment-targets.json")
    generate(parser.parse_args())
