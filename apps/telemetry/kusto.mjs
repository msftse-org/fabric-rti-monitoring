// Read-only Kusto client for the Fabric Eventhouse. Uses the signed-in Azure CLI
// identity; no secret is read, stored, or written.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let cachedToken = null;

export async function loadTarget() {
  let uri = process.env.KUSTO_CLUSTER_URI;
  let database = process.env.KUSTO_DATABASE;
  if (!uri || !database) {
    try {
      const fabric = JSON.parse(await readFile(join(root, 'output', 'fabric.local.json'), 'utf8'));
      uri ||= fabric.queryServiceUri;
      database ||= fabric.databaseName;
    } catch {
      // Fall through to the explicit error below.
    }
  }
  if (!uri || !database) {
    throw new Error('Set KUSTO_CLUSTER_URI and KUSTO_DATABASE, or run scripts/bootstrap-fabric.py to create output/fabric.local.json.');
  }
  return { uri: uri.replace(/\/$/, ''), database };
}

async function token() {
  if (cachedToken && cachedToken.expires > Date.now() + 120_000) return cachedToken.value;
  const { stdout } = await run('az', ['account', 'get-access-token', '--resource', 'https://kusto.kusto.windows.net', '--output', 'json'], { maxBuffer: 1 << 20 });
  const parsed = JSON.parse(stdout);
  cachedToken = { value: parsed.accessToken, expires: Date.parse(parsed.expiresOn.replace(' ', 'T')) || Date.now() + 30 * 60_000 };
  return cachedToken.value;
}

/** Run one read-only KQL query and return rows as objects keyed by column name. */
export async function query(csl, target) {
  const response = await fetch(`${target.uri}/v1/rest/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: target.database, csl, properties: { Options: { request_readonly: true } } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Kusto HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const table = (await response.json()).Tables[0];
  const names = table.Columns.map((column) => column.ColumnName);
  return table.Rows.map((row) => Object.fromEntries(names.map((name, index) => [name, row[index]])));
}
