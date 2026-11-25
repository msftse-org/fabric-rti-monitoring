import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLiveConfig, telemetryTransport, validateTarget } from '../live-config.ts';
import { createBrowserQuery, parseKustoRows } from '../kusto-browser.ts';
import { createHistoryCache, createRefreshGate, initialRefreshState, liveSuccess, refreshFailure } from '../refresh-state.ts';

const target = { uri: 'https://example.z1.kusto.fabric.microsoft.com', database: 'demo' };
const bundle = { schemaVersion: 1, source: 'live', generatedAt: '2026-11-25T08:00:00Z' };
const response = { Tables: [{ TableName: 'PrimaryResult', Columns: [{ ColumnName: 'count' }], Rows: [[2]] }] };

test('only HTTPS Fabric cluster origins can receive tokens', () => {
  assert.deepEqual(validateTarget(`${target.uri}/`, ' demo '), target);
  for (const uri of ['http://x.kusto.fabric.microsoft.com', 'https://evil.example', `${target.uri}?x=1`, `${target.uri}#x`, `${target.uri}/path`, 'https://u:p@x.kusto.fabric.microsoft.com']) {
    assert.throws(() => validateTarget(uri, 'demo'));
  }
  assert.equal(telemetryTransport({ PROD: true }, true), 'browser');
  assert.equal(telemetryTransport({ PROD: true, VITE_TELEMETRY_MODE: 'snapshot' }, true), 'snapshot');
  assert.equal(telemetryTransport({ PROD: false }, false), 'local');
  assert.equal(telemetryTransport({ PROD: true }, false), 'snapshot');
  assert.ok(readLiveConfig({ VITE_ENTRA_CLIENT_ID: 'partial' }).error);
});

test('REST requests are read-only and retry 401 once with silent token renewal', async () => {
  const renewals = [];
  let calls = 0;
  const query = createBrowserQuery(async (force = false) => { renewals.push(force); return 'test-only'; }, async (url, init) => {
    assert.equal(url, `${target.uri}/v1/rest/query`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.properties.Options.request_readonly, true);
    assert.equal(body.properties.Options.servertimeout, '00:00:20');
    assert.ok(init?.signal);
    return ++calls === 1 ? new Response(null, { status: 401 }) : Response.json(response);
  });
  assert.deepEqual(await query('print count=2', target), [{ count: 2 }]);
  assert.deepEqual(renewals, [false, true]);
});

test('403 and HTTP-200 partial failures never produce a live bundle', async () => {
  await assert.rejects(createBrowserQuery(async () => 'test-only', async () => new Response(null, { status: 403 }))('print 1', target), /viewer access/);
  assert.throws(() => parseKustoRows({ ...response, Exceptions: [{}] }), /incomplete/);
  assert.throws(() => parseKustoRows({ Tables: [...response.Tables, { TableName: 'QueryStatus', Columns: [{ ColumnName: 'Severity' }], Rows: [[2]] }] }), /partial/);
});

test('repeated 401 stops after one retry and unsafe targets never acquire a token', async () => {
  let tokens = 0;
  const query = createBrowserQuery(async () => { tokens++; return 'test-only'; }, async () => new Response('private response must not be surfaced', { status: 401 }));
  await assert.rejects(query('print 1', target), (error) => error.status === 401 && !error.message.includes('private response'));
  assert.equal(tokens, 2);
  await assert.rejects(query('print 1', { ...target, uri: 'https://unexpected.example' }));
  assert.equal(tokens, 2);
});

test('caller cancellation reaches the REST request', async () => {
  const controller = new AbortController();
  const query = createBrowserQuery(async () => 'test-only', async (_url, init) => {
    controller.abort();
    assert.equal(init.signal.aborted, true);
    throw init.signal.reason;
  }, controller.signal);
  await assert.rejects(query('print 1', target), { name: 'AbortError' });
});

test('refresh failure preserves last successful live bundle and timestamp', () => {
  const good = liveSuccess(bundle, '2026-11-25T08:01:00Z');
  const failed = refreshFailure(good, 'Offline', false);
  assert.equal(failed.bundle, good.bundle);
  assert.equal(failed.mode, 'live');
  assert.equal(failed.lastSuccessAt, good.lastSuccessAt);
  assert.equal(failed.error, 'Offline');
  assert.equal(failed.fellBack, false);
  assert.equal(refreshFailure({ ...initialRefreshState, mode: 'snapshot' }, 'Connect', true).fellBack, true);
});

test('refresh gate suppresses overlap and invalidates late responses', async () => {
  const gate = createRefreshGate();
  let finish;
  let applied = 0;
  const work = gate.run(async (active) => {
    await new Promise((resolve) => { finish = resolve; });
    if (active()) applied++;
  });
  await gate.run(async () => { applied++; });
  assert.equal(applied, 0);
  gate.invalidate();
  finish();
  await work;
  assert.equal(applied, 0);
});

test('history cache coalesces requests and expires after 60 seconds', async () => {
  let now = 0;
  let count = 0;
  const history = createHistoryCache(async () => ++count, () => now);
  assert.deepEqual(await Promise.all([history(), history()]), [1, 1]);
  now = 59_999;
  assert.equal(await history(), 1);
  now = 60_000;
  assert.equal(await history(), 2);
});

test('a failed history query is not cached as successful', async () => {
  let calls = 0;
  const history = createHistoryCache(async () => {
    if (++calls === 1) throw new Error('offline');
    return 'fresh';
  });
  await assert.rejects(history(), /offline/);
  assert.equal(await history(), 'fresh');
  assert.equal(calls, 2);
});
