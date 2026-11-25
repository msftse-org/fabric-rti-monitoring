/**
 * Writes the Fabric "create item" request for the issue-alert Activator to stdout.
 *
 *   node apps/oncall/scripts/export-issue-alerts.ts --fabric output/fabric.local.json \
 *     --teams oncall@contoso.com --email sre@contoso.com [--start] > output/issue-alerts.local.json
 *
 * Then create the item with the printed `az rest` command. Nothing is sent from here.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createCommand, issueAlertsDefinition } from '../src/index.ts';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const { values } = parseArgs({
  options: {
    fabric: { type: 'string', default: 'output/fabric.local.json' },
    teams: { type: 'string', multiple: true, default: [] },
    email: { type: 'string', multiple: true, default: [] },
    start: { type: 'boolean', default: false },
  },
});

const fabric = JSON.parse(readFileSync(values.fabric!, 'utf8')) as { workspaceId?: string; databaseItemId?: string };
if (!GUID.test(fabric.workspaceId ?? '') || !GUID.test(fabric.databaseItemId ?? '')) {
  console.error('The bootstrap output needs workspaceId and databaseItemId. Run scripts/bootstrap-fabric.py first.');
  process.exit(2);
}
const addresses = [...values.teams!, ...values.email!];
const invalid = addresses.filter((address) => !EMAIL.test(address));
if (invalid.length) {
  console.error(`Not an email address: ${invalid.join(', ')}`);
  process.exit(2);
}
const exported = issueAlertsDefinition(
  { workspaceId: fabric.workspaceId!, databaseItemId: fabric.databaseItemId! },
  { teams: values.teams!, email: values.email! },
  { start: values.start!, now: Date.now(), placeholderRecipient: 'replace-me@example.com' },
);
process.stdout.write(JSON.stringify(exported.createBody) + '\n');
console.error(`Create it with:\n  ${createCommand(fabric.workspaceId!, 'output/issue-alerts.local.json')}`);
for (const followUp of exported.followUps) console.error(`Then: ${followUp}`);
