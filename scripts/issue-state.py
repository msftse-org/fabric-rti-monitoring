#!/usr/bin/env python3
"""Resolve, mute, or reopen an issue in the demo KQL database.

Appends one row to the IssueState table through Kusto management, as the
signed-in Azure CLI user. The newest row per fingerprint is the issue's state;
IssueAlerts() then raises `regression` when a resolved issue occurs again and
`unmute` when a mute expires while the issue still occurs. Nothing is deleted.

Examples:
  python3 scripts/issue-state.py list
  python3 scripts/issue-state.py resolve 1a2b3c4d5e6f7a8b --in-version 1.3.0 --note "fixed retry"
  python3 scripts/issue-state.py mute 1a2b3c4d5e6f7a8b --for 24h
  python3 scripts/issue-state.py reopen 1a2b3c4d5e6f7a8b
"""

import argparse
import base64
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO_ROOT = Path(__file__).resolve().parents[1]
FINGERPRINT = re.compile(r"^[0-9a-f]{16}$")
VERSION = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$")
DURATION = re.compile(r"^([1-9][0-9]{0,3})([mhd])$")
MAX_NOTE = 200


class IssueStateError(RuntimeError):
    """An actionable failure that never includes a token or a raw response body."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        # Do not forward bearer tokens through redirects.
        return None


def azure_cli_token():
    try:
        result = subprocess.run(
            ["az", "account", "get-access-token", "--resource", "https://kusto.kusto.windows.net",
             "--query", "accessToken", "-o", "tsv"], check=True, capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise IssueStateError("Cannot obtain a Kusto token. Sign in with Azure CLI in the Fabric tenant.") from exc
    return result.stdout.strip()


def query_service_uri(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname
            or not parsed.hostname.lower().endswith(".kusto.fabric.microsoft.com")
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.port not in (None, 443) or parsed.path not in ("", "/")):
        raise IssueStateError("The query URI must be a Fabric Kusto query service URI.")
    return value.rstrip("/")


def kql_text(value):
    """A KQL expression for arbitrary text, base64-encoded so it can never break out of the literal."""
    encoded = base64.b64encode(value.encode()).decode()
    return f"base64_decode_tostring('{encoded}')"


def state_command(fingerprint, status, version="", mute_for=None, note=""):
    """Build the one management command that appends a state row. Inputs are validated, not escaped."""
    if not FINGERPRINT.match(fingerprint):
        raise IssueStateError("A fingerprint is 16 lowercase hex characters, as Issues() returns it.")
    if status not in ("open", "resolved", "muted"):
        raise IssueStateError("Status must be open, resolved, or muted.")
    if version and not VERSION.match(version):
        raise IssueStateError("A version is up to 64 letters, digits, and . + _ - characters.")
    if len(note) > MAX_NOTE:
        raise IssueStateError(f"Keep the note under {MAX_NOTE} characters; it is stored for a year.")
    muted_until = "datetime(null)"
    if status == "muted":
        match = DURATION.match(mute_for or "")
        if not match:
            raise IssueStateError("Mute for a duration such as 30m, 12h, or 7d.")
        muted_until = f"now() + {match.group(1)}{match.group(2)}"
    return (
        ".set-or-append IssueState <|\n"
        f"print Fingerprint='{fingerprint}', Status='{status}', ResolvedInVersion='{version}',\n"
        f"    MutedUntil={muted_until},\n"
        "    ChangedBy=tostring(current_principal_details()['UserPrincipalName']),\n"
        f"    ChangedAt=now(), Note={kql_text(note)}"
    )


class Kusto:
    def __init__(self, uri, database, token_provider=azure_cli_token, opener=None):
        self.uri = query_service_uri(uri)
        self.database = database
        self.token_provider = token_provider
        self.opener = opener or urllib.request.build_opener(NoRedirect)

    def _post(self, path, csl):
        request = urllib.request.Request(
            self.uri + path, data=json.dumps({"db": self.database, "csl": csl}).encode(), method="POST",
            headers={"Authorization": "Bearer " + self.token_provider(), "Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=120) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise IssueStateError("Kusto denied the request. Writing state needs database user or admin "
                                      "permission; see fabric/permissions.kql.") from exc
            raise IssueStateError(f"Kusto rejected the request (HTTP {exc.code}).") from exc
        except urllib.error.URLError as exc:
            raise IssueStateError("Cannot reach the Kusto query service.") from exc

    def query(self, csl):
        for frame in self._post("/v2/rest/query", csl):
            if frame.get("FrameType") == "DataTable" and frame.get("TableKind") == "PrimaryResult":
                return [dict(zip([c["ColumnName"] for c in frame["Columns"]], row)) for row in frame["Rows"]]
        return []

    def manage(self, csl):
        return self._post("/v1/rest/mgmt", csl)


def default_target():
    path = REPO_ROOT / "output/fabric.local.json"
    try:
        result = json.loads(path.read_text())
        return result["queryServiceUri"], result["databaseName"]
    except (OSError, KeyError, ValueError):
        return None, None


def main(argv=None, kusto_factory=Kusto, out=sys.stdout):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--query-uri", help="Query service URI; defaults to output/fabric.local.json.")
    parser.add_argument("--database", help="KQL database name; defaults to output/fabric.local.json.")
    commands = parser.add_subparsers(dest="action", required=True)
    listing = commands.add_parser("list", help="Show issues active in a window with their status.")
    listing.add_argument("--lookback", default="24h", help="KQL timespan such as 1h or 7d.")
    resolve = commands.add_parser("resolve", help="Mark an issue resolved; a later event is a regression.")
    resolve.add_argument("fingerprint")
    resolve.add_argument("--in-version", default="", help="Only events from this version or later count as a regression.")
    resolve.add_argument("--note", default="")
    mute = commands.add_parser("mute", help="Silence alerts for a while; expiry with ongoing events alerts as unmute.")
    mute.add_argument("fingerprint")
    mute.add_argument("--for", dest="mute_for", required=True, help="Duration such as 30m, 12h, or 7d.")
    mute.add_argument("--note", default="")
    reopen = commands.add_parser("reopen", help="Mark an issue open again.")
    reopen.add_argument("fingerprint")
    reopen.add_argument("--note", default="")
    args = parser.parse_args(argv)

    uri, database = default_target()
    uri, database = args.query_uri or uri, args.database or database
    try:
        if not uri or not database:
            raise IssueStateError("Pass --query-uri and --database, or run the Fabric bootstrap first.")
        kusto = kusto_factory(uri, database)
        if args.action == "list":
            if not re.fullmatch(r"[1-9][0-9]{0,3}[mhd]", args.lookback):
                raise IssueStateError("Use a lookback such as 1h, 24h, or 7d.")
            rows = kusto.query(f"Issues({args.lookback}) | project Fingerprint, Status, Events, Environment, Title, "
                               "LastSeen | order by Events desc | take 50")
            for row in rows:
                print(f"{row['Fingerprint']}  {row['Status']:<8} {row['Events']:>6}  {row['Environment']:<6} "
                      f"{row['Title']}", file=out)
            if not rows:
                print("No issues in that window.", file=out)
            return 0
        status = {"resolve": "resolved", "mute": "muted", "reopen": "open"}[args.action]
        command = state_command(args.fingerprint, status, getattr(args, "in_version", ""),
                                getattr(args, "mute_for", None), args.note)
        known = kusto.query(f"Issues1h | where Fingerprint == '{args.fingerprint}' | take 1 | project Fingerprint")
        if not known:
            raise IssueStateError("No issue has that fingerprint. Copy one from `list` or the Issues dashboard.")
        kusto.manage(command)
        print(f"Issue {args.fingerprint} is now {status}.", file=out)
        return 0
    except IssueStateError as error:
        print(f"Issue state not changed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
