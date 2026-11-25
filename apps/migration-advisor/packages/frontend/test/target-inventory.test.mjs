import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetInventory } from '../src/targetInventory.ts';
import { defaultOtel } from '../src/otel.ts';

const targets = {
  version: 1, discoveredAt: '2026-11-21T12:00:00Z',
  workspaceName: 'Pilot', eventhouseName: 'Telemetry',
  queryUri: 'https://example.kusto.fabric.microsoft.com', database: 'pilot',
  grafanaUrl: '', collectorName: '', collectorEndpoint: '',
};
const settle = () => new Promise(resolve => setImmediate(resolve));
function draftStore(settings = defaultOtel(), autoAllowed = true) {
  let applied = 0;
  const draft = { settings, autoAllowed, onChange: next => { draft.settings = next; applied++; } };
  return { draft, store: createTargetInventory(() => draft), applied: () => applied };
}
test('first empty draft automatically loads only destination fields', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(targets));
  const { draft, store, applied } = draftStore();
  const unsubscribe = store.subscribe(() => {});
  await settle();
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(applied(), 1);
  assert.equal(draft.settings.database, 'pilot');
  assert.equal(draft.settings.mode, 'dual');
  assert.equal(draft.settings.logsExporters, '');
  assert.equal(store.getSnapshot().loading, false);
  unsubscribe();
});
test('restored or manually customized drafts do not auto-load', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(targets));
  for (const item of [draftStore(defaultOtel(), false), draftStore({ ...defaultOtel(), logsPipeline: 'logs/custom' })]) {
    const unsubscribe = item.store.subscribe(() => {});
    await settle();
    assert.equal(item.applied(), 0);
    unsubscribe();
  }
  assert.equal(fetch.mock.callCount(), 0);
});
test('editing while inventory is pending preserves the entire newer draft', async t => {
  let respond;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { respond = resolve; }));
  const { draft, store, applied } = draftStore();
  const unsubscribe = store.subscribe(() => {});
  draft.settings = { ...draft.settings, queryUri: 'https://manual.example', logsTable: 'CustomLogs' };
  respond(Response.json(targets));
  await settle();
  assert.equal(applied(), 0);
  assert.equal(draft.settings.queryUri, 'https://manual.example');
  assert.match(store.getSnapshot().status, /Kept your draft/);
  unsubscribe();
});
test('restore guard prevents automatic completion even for identical empty values', async t => {
  let respond;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { respond = resolve; }));
  const { draft, store, applied } = draftStore();
  const unsubscribe = store.subscribe(() => {});
  draft.autoAllowed = false;
  respond(Response.json(targets));
  await settle();
  assert.equal(applied(), 0);
  unsubscribe();
});
test('unsubscribing aborts and ignores a late inventory response', async t => {
  let respond, signal;
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    signal = init.signal;
    return new Promise(resolve => { respond = resolve; });
  });
  const { store, applied } = draftStore();
  const unsubscribe = store.subscribe(() => {});
  unsubscribe();
  assert.equal(signal.aborted, true);
  respond(Response.json(targets));
  await settle();
  assert.equal(applied(), 0);
});
test('missing inventory has manual fallback and refresh preserves advanced customizations', async t => {
  let available = false;
  t.mock.method(globalThis, 'fetch', async () => available ? Response.json(targets) : new Response('', { status: 404 }));
  const { draft, store } = draftStore();
  const unsubscribe = store.subscribe(() => {});
  await settle();
  assert.match(store.getSnapshot().status, /Enter the KQL query URI/);
  assert.equal(store.getSnapshot().loading, false);
  draft.settings = { ...draft.settings, auth: 'workload', logsPipeline: 'logs/custom', logsExporters: 'otlp/first, debug', logsTable: 'CustomLogs' };
  available = true;
  await store.load();
  assert.equal(draft.settings.queryUri, targets.queryUri);
  assert.equal(draft.settings.auth, 'workload');
  assert.equal(draft.settings.logsPipeline, 'logs/custom');
  assert.equal(draft.settings.logsExporters, 'otlp/first, debug');
  assert.equal(draft.settings.logsTable, 'CustomLogs');
  unsubscribe();
});
test('a completed automatic attempt is not repeated when the input page remounts', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const { draft, store } = draftStore();
  draft.onAutoComplete = () => { draft.autoAllowed = false; };
  const unsubscribe = store.subscribe(() => {});
  await settle();
  unsubscribe();
  const remounted = createTargetInventory(() => draft);
  const unsubscribeAgain = remounted.subscribe(() => {});
  await settle();
  assert.equal(fetch.mock.callCount(), 1);
  unsubscribeAgain();
});
