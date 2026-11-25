#!/usr/bin/env python3
"""Configure secretless, delegated browser access to the mock apps' Eventhouse."""

import argparse
import json
from pathlib import Path
import subprocess
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
APPS = ("datadog-mock", "coralogix-mock", "groundcover-mock", "rti-oncall")
APP_NAME = "Fabric RTI Mock Telemetry"
RESOURCE = "https://kusto.kusto.windows.net"


def azure(*args):
    result = subprocess.run(
        ["az", *args, "--output", "json", "--only-show-errors"],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def update_env(path, values):
    lines = path.read_text().splitlines() if path.exists() else []
    remaining = dict(values)
    updated = []
    for line in lines:
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            updated.append(f"{key}={remaining.pop(key)}")
        elif key not in values:
            updated.append(line)
    updated.extend(f"{key}={value}" for key, value in remaining.items())
    path.write_text("\n".join(updated) + "\n")


def redirect_uris(root, callback_path):
    if not callback_path.startswith("/") or "?" in callback_path or "#" in callback_path:
        raise ValueError("The callback must be an absolute path without query or fragment.")
    uris = []
    for app in APPS:
        deployment = json.loads((root / "apps" / app / "rayfin/.deployments.json").read_text())
        active = deployment.get("active")
        entry = deployment["deployments"].get(active)
        if entry is None and len(deployment["deployments"]) == 1:
            entry = next(iter(deployment["deployments"].values()))
        if entry is None:
            raise ValueError(f"{app} has no unambiguous active Fabric deployment.")
        parsed = urlsplit(entry["hostingUrl"])
        if (parsed.scheme != "https" or not parsed.hostname
                or not parsed.hostname.endswith(".webapp.fabricapps.net")
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.port not in (None, 443) or parsed.path not in ("", "/")):
            raise ValueError(f"{app} has an unexpected hosting URL.")
        uris.append(f"https://{parsed.hostname}{callback_path}")
    return uris


def configure(args):
    target = json.loads((ROOT / "output/fabric.local.json").read_text())
    parsed = urlsplit(target["queryServiceUri"])
    if (parsed.scheme != "https" or not parsed.hostname
            or not parsed.hostname.endswith(".kusto.fabric.microsoft.com")
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.port not in (None, 443) or parsed.path not in ("", "/")):
        raise ValueError("Expected a Fabric Eventhouse HTTPS query endpoint.")
    uris = redirect_uris(ROOT, args.callback_path)
    account = azure("account", "show")
    resources = azure("ad", "sp", "list", "--filter",
                      f"servicePrincipalNames/any(x:x eq '{RESOURCE}')")
    if len(resources) != 1:
        raise ValueError("Cannot uniquely resolve the Azure Data Explorer API.")
    resource = resources[0]
    scopes = [scope for scope in resource["oauth2PermissionScopes"]
              if scope["value"] == "user_impersonation" and scope["isEnabled"]]
    if len(scopes) != 1 or scopes[0]["type"] != "User":
        raise ValueError("Expected the enabled delegated user_impersonation permission.")
    permission = {"id": scopes[0]["id"], "type": "Scope"}
    matches = azure("ad", "app", "list", "--filter", f"displayName eq '{APP_NAME}'")
    if len(matches) > 1:
        raise ValueError("Multiple matching app registrations exist; resolve the duplicate first.")
    if matches:
        app = matches[0]
        if app.get("signInAudience") != "AzureADMyOrg":
            raise ValueError("The existing registration must be single-tenant.")
        required = app.get("requiredResourceAccess", [])
        access = next((item for item in required if item["resourceAppId"] == resource["appId"]), None)
        if access is None:
            required.append({"resourceAppId": resource["appId"], "resourceAccess": [permission]})
        elif permission not in access["resourceAccess"]:
            access["resourceAccess"].append(permission)
        spa = dict(app.get("spa") or {})
        spa["redirectUris"] = sorted(set(spa.get("redirectUris", [])) | set(uris))
        azure("rest", "--method", "PATCH", "--url",
              f"https://graph.microsoft.com/v1.0/applications/{app['id']}",
              "--body", json.dumps({"spa": spa, "requiredResourceAccess": required}))
    else:
        app = azure("rest", "--method", "POST", "--url",
                    "https://graph.microsoft.com/v1.0/applications",
                    "--body", json.dumps({
                        "displayName": APP_NAME,
                        "signInAudience": "AzureADMyOrg",
                        "spa": {"redirectUris": uris},
                        "requiredResourceAccess": [{
                            "resourceAppId": resource["appId"], "resourceAccess": [permission],
                        }],
                    }))
    values = {
        "VITE_ENTRA_CLIENT_ID": app["appId"],
        "VITE_ENTRA_TENANT_ID": account["tenantId"],
        "VITE_KUSTO_CLUSTER_URI": target["queryServiceUri"].rstrip("/"),
        "VITE_KUSTO_DATABASE": target["databaseName"],
        "VITE_TELEMETRY_MODE": "live",
    }
    for name in APPS:
        update_env(ROOT / "apps" / name / "packages/frontend/.env.local", values)
    print("Configured delegated, secretless live telemetry for all four mock apps.")
    print("Users sign in and consent from each app; this command does not grant tenant-wide consent.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--callback-path", default="/auth-redirect.html",
                        help="MSAL callback page path shared by all four frontends.")
    args = parser.parse_args()
    try:
        configure(args)
    except subprocess.CalledProcessError:
        parser.exit(1, "Azure configuration failed. Check Entra app-registration permissions and Azure CLI sign-in.\n")
    except (OSError, KeyError, ValueError) as error:
        parser.exit(1, f"Live telemetry configuration stopped: {error}\n")


if __name__ == "__main__":
    main()
