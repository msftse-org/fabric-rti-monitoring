import assert from 'node:assert/strict';
import test from 'node:test';
import { AlertService, appCoordinates, validateLiveDraft } from '../dist/rti-oncall/packages/functions/src/alerts.js';
import { buildSeed } from '../dist/oncall/src/seed.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const appId = '22222222-2222-4222-8222-222222222222';
const databaseId = '33333333-3333-4333-8333-333333333333';
const itemId = '44444444-4444-4444-8444-444444444444';
const operationId = '55555555-5555-4555-8555-555555555555';
const draft = () => ({
  name: 'Checkout errors', signal: 'error_rate', service: 'checkout', comparison: 'above',
  windowMinutes: 10, warn: 5, alert: 10, teamId: buildSeed(Date.now()).teams[0].id,
  priority: 2, message: 'Investigate checkout', actions: { page: null, teams: { recipients: ['responder@contoso.com'] }, email: { to: ['responder@contoso.com'] } },
});
const json = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
const entitiesOf = (definition) => JSON.parse(Buffer.from(definition.parts[0].payload, 'base64').toString('utf8'));

function fixture({ longRunning = false, foreignOperation = false, failedOperation = false } = {}) {
  const items = new Map();
  const calls = [];
  let pending;
  const fetcher = async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.fabric.microsoft.com');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer fixture-token');
    calls.push({ path: url.pathname, method: init.method });
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname === `/v1/operations/${operationId}`) return json({ status: failedOperation ? 'Failed' : 'Succeeded' });
    if (url.pathname === `/v1/operations/${operationId}/result`) return json(pending);
    assert(url.pathname.startsWith(`/v1/workspaces/${workspaceId}/items`));
    const suffix = url.pathname.split('/items')[1];
    if (init.method === 'GET' && !suffix) {
      return json({ value: url.searchParams.get('type') === 'KQLDatabase' ? [{ id: databaseId, displayName: 'observability', type: 'KQLDatabase' }] : [...items.values()].map(({ definition, ...item }) => item) });
    }
    if (init.method === 'POST' && !suffix) {
      const { definition, ...item } = body;
      const stored = { ...item, id: itemId, definition };
      items.set(itemId, stored);
      pending = { ...item, id: itemId };
      return longRunning ? json(null, 202, { Location: `${foreignOperation ? 'https://untrusted.invalid' : 'https://api.fabric.microsoft.com'}/v1/operations/${operationId}`, 'Retry-After': '0' }) : json(pending, 201);
    }
    const found = items.get(suffix.split('/')[1]);
    if (!found) return json({ errorCode: 'ItemNotFound' }, 404);
    if (init.method === 'GET') return json(found);
    if (init.method === 'DELETE') {
      items.delete(found.id);
      return json(null, 204);
    }
    if (suffix.endsWith('/getDefinition')) return json({ definition: found.definition });
    if (suffix.endsWith('/updateDefinition')) {
      found.definition = body.definition;
      return json(null);
    }
    throw new Error(`Unexpected request ${init.method} ${url}`);
  };
  const service = () => new AlertService(workspaceId, appId, 'fixture-token', fetcher, async () => {});
  return { items, calls, service };
}

test('creates native actions, reloads persistent rules, edits, starts, stops and deletes', async () => {
  const { service, items } = fixture({ longRunning: true });
  let result = await service().handle({ operation: 'save', draft: draft(), ruleId: 900_001, enabled: false });
  let rule = result.rule;
  assert.equal(rule.authored.fabric.itemId, itemId);
  const native = entitiesOf(items.get(itemId).definition).filter((entity) => entity.payload.definition?.type === 'Rule');
  assert.equal(native.length, 4);
  assert(native.every((entity) => !entity.payload.definition.settings.shouldRun));
  assert.deepEqual(native.map((entity) => JSON.parse(entity.payload.definition.instance).steps.at(-1).rows[0].kind), ['TeamsMessage', 'EmailMessage', 'TeamsMessage', 'EmailMessage']);
  const reloaded = await service().handle({ operation: 'list' });
  assert.equal(reloaded.rules[0].id, rule.id);
  for (const enabled of [true, false]) {
    result = await service().handle({ operation: 'save', draft: { ...draft(), message: 'Updated message' }, ruleId: rule.id, enabled, itemId, revision: rule.authored.fabric.revision });
    rule = result.rule;
    assert.equal(rule.authored.enabled, enabled);
    assert(entitiesOf(items.get(itemId).definition).filter((entity) => entity.payload.definition?.type === 'Rule').every((entity) => entity.payload.definition.settings.shouldRun === enabled));
  }
  await service().handle({ operation: 'delete', itemId, revision: rule.authored.fabric.revision });
  assert.equal((await service().handle({ operation: 'list' })).rules.length, 0);
});

test('create retries reuse the persisted item and conflicting IDs are rejected', async () => {
  const { service, calls } = fixture();
  const request = { operation: 'save', draft: draft(), ruleId: 900_001, enabled: false };
  await service().handle(request);
  await service().handle(request);
  assert.equal(calls.filter((call) => call.method === 'POST' && call.path.endsWith('/items')).length, 1);
  await assert.rejects(service().handle({ ...request, draft: { ...draft(), name: 'Different alert' } }), /different alert/);
  await assert.rejects(service().handle({ ...request, enabled: true }), /running state/);
});

test('stale revisions and unowned items cannot be modified', async () => {
  const { service, items, calls } = fixture();
  const created = await service().handle({ operation: 'save', draft: draft(), ruleId: 900_001, enabled: false });
  await assert.rejects(service().handle({ operation: 'save', draft: draft(), ruleId: 900_001, enabled: true, itemId, revision: 'stale' }), /changed in Fabric/);
  await assert.rejects(service().handle({ operation: 'delete', itemId, revision: 'stale' }), /changed in Fabric/);
  assert(!calls.some((call) => call.method === 'DELETE'));
  items.get(itemId).description = 'User-managed item';
  await assert.rejects(service().handle({ operation: 'delete', itemId, revision: created.rule.authored.fabric.revision }), /not an alert managed/);
});

test('validates actions and recipients server-side without accepting arbitrary queries', () => {
  for (const patch of [
    { service: "gateway' | .drop table OTELTraces" },
    { windowMinutes: 7 }, { alert: NaN }, { priority: 0 },
    { actions: { ...draft().actions, page: { urgency: 'high' } } },
    { actions: { page: null, teams: null, email: null } },
    { actions: { page: null, teams: { recipients: ['demo@rti.example'] }, email: null } },
    { actions: { page: null, teams: { recipients: [123] }, email: null } },
  ]) assert.throws(() => validateLiveDraft({ ...draft(), ...patch }));
  assert.equal(validateLiveDraft(draft()).name, 'Checkout errors');
});

test('does not send credentials to an unexpected operation host', async () => {
  const { service, calls } = fixture({ longRunning: true, foreignOperation: true });
  await assert.rejects(service().handle({ operation: 'save', draft: draft(), ruleId: 900_001, enabled: false }), /unexpected operation URL/);
  assert(!calls.some((call) => call.path.includes('/operations/')));
});

test('workspace identity is derived only from the platform context', () => {
  assert.deepEqual(appCoordinates(`https://cluster.pbidedicated.windows.net/v1/workspaces/${workspaceId}/appbackends/${appId}/`), { workspaceId, appId });
  assert.throws(() => appCoordinates(`https://untrusted.invalid/v1/workspaces/${workspaceId}/appbackends/${appId}/`));
  assert.throws(() => appCoordinates(`http://cluster.pbidedicated.windows.net/v1/workspaces/${workspaceId}/appbackends/${appId}/`));
});

test('permission failures and failed LROs are surfaced without reporting success', async () => {
  const denied = new AlertService(workspaceId, appId, 'fixture-token', async () => json({ errorCode: 'Forbidden' }, 403));
  await assert.rejects(denied.handle({ operation: 'list' }), /Contributor access/);
  const { service } = fixture({ longRunning: true, failedOperation: true });
  await assert.rejects(service().handle({ operation: 'save', draft: draft(), ruleId: 900_001, enabled: false }), /operation Failed/);
});
