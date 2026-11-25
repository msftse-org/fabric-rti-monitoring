import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTelemetryQueries } from '../query-bundle.mjs';

const target = { uri: 'https://example.kusto.fabric.microsoft.com', database: 'observability' };

test('browser and server share bounded queries and bundle building', async () => {
  const calls = [];
  const { fetchBundle } = createTelemetryQueries(async (csl, actualTarget) => {
    assert.equal(actualTarget, target);
    calls.push(csl);
    return [];
  });
  const bundle = await fetchBundle({ target, minutes: '999; drop table OTELLogs', historyDays: 99 });
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((csl) => csl.includes('ago(360m)')).length, 3);
  assert.match(calls[3], /ago\(7d\)/);
  assert.ok(calls.every((csl) => !csl.includes('drop table')));
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.source, 'live');
  assert.deepEqual(bundle.logs, []);
});

test('cached history avoids the multi-day query on refresh', async () => {
  const history = { from: '2026-11-18T00:00:00Z', to: '2026-11-25T00:00:00Z', bucketMinutes: 5, points: [] };
  const calls = [];
  const { fetchBundle } = createTelemetryQueries(async (csl) => {
    calls.push(csl);
    return [];
  });
  const bundle = await fetchBundle({ target, history: Promise.resolve(history) });
  assert.equal(calls.length, 3);
  assert.equal(bundle.history, history);
});

test('query failures are not presented as an empty successful bundle', async () => {
  const { fetchBundle } = createTelemetryQueries(async () => { throw new Error('Access denied'); });
  await assert.rejects(fetchBundle({ target }), /Access denied/);
});
