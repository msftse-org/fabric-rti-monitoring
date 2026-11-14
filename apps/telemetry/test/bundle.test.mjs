import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBundle, buildHistory, percentile } from '../bundle.mjs';

const base = Date.parse('2026-11-04T08:00:00Z');
const span = (trace, id, parent, name, service, kind, offset, duration, status = 'STATUS_CODE_OK') => ({
  traceId: trace,
  spanId: id,
  parentId: parent,
  name,
  status,
  spanKind: kind,
  startTime: new Date(base + offset).toISOString(),
  durationMs: duration,
  service,
  version: '1.1.0',
  pod: `${service}-pod`,
  node: 'node-1',
  cluster: 'dev-aks',
  namespace: 'otel-demo',
  environment: 'aks',
  scenario: 'checkout',
  outcome: status === 'STATUS_CODE_ERROR' ? 'error' : 'success',
});

const spans = [
  span('t1', 'a', '', 'demo.request', 'gateway', 'SPAN_KIND_SERVER', 0, 100),
  span('t1', 'b', 'a', 'demo.checkout', 'checkout', 'SPAN_KIND_SERVER', 10, 80, 'STATUS_CODE_ERROR'),
  span('t1', 'c', 'b', 'demo.postgres.query', 'checkout', 'SPAN_KIND_CLIENT', 20, 30),
  span('t2', 'd', '', 'demo.request', 'gateway', 'SPAN_KIND_SERVER', 70_000, 40),
  span('t3', 'e', 'missing', 'demo.checkout', 'checkout', 'SPAN_KIND_SERVER', 90_000, 10),
];
const logs = [
  { ts: new Date(base + 5).toISOString(), traceId: 't1', spanId: 'b', severity: 'ERROR', body: 'failed', service: 'checkout', scenario: 'checkout', outcome: 'error' },
  { ts: new Date(base + 70_005).toISOString(), traceId: 't2', spanId: 'd', severity: 'WARNING', body: 'slow', service: 'gateway' },
];
const metrics = [
  { t: new Date(base).toISOString(), name: 'demo.requests', unit: '{request}', type: 'Sum', service: 'gateway', scenario: 'checkout', outcome: 'success', sumValue: 8, avgValue: 4 },
  { t: new Date(base).toISOString(), name: 'demo.request.duration', unit: 'ms', type: 'Gauge', service: 'gateway', scenario: 'checkout', outcome: 'success', sumValue: 90, avgValue: 45 },
];

const bundle = buildBundle({ spans, logs, metrics, windowMinutes: 10, generatedAt: '2026-11-04T08:10:00.000Z' });

test('percentile uses nearest rank', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 95), 5);
  assert.equal(percentile([], 95), 0);
});

test('services count server spans and errors', () => {
  const checkout = bundle.services.find((service) => service.name === 'checkout');
  assert.equal(checkout.requests, 2);
  assert.equal(checkout.errors, 1);
  assert.equal(checkout.errorRate, 0.5);
  assert.deepEqual(checkout.dependsOn, ['postgres']);
  assert.deepEqual(bundle.services.find((service) => service.name === 'gateway').dependsOn, ['checkout']);
});

test('rates use the observed data span, not the requested window', () => {
  const gateway = bundle.services.find((service) => service.name === 'gateway');
  assert.equal(gateway.rpm, 1.33);
  const sparse = buildBundle({ spans, logs, metrics, windowMinutes: 600, generatedAt: '2026-11-04T08:10:00.000Z' });
  assert.equal(sparse.services.find((service) => service.name === 'gateway').rpm, 1.33);
});

test('edges include service calls and datastore client spans', () => {
  assert.deepEqual(
    bundle.edges.map((edge) => [edge.from, edge.to, edge.kind, edge.calls, edge.errors]).sort(),
    [['checkout', 'postgres', 'database', 1, 0], ['gateway', 'checkout', 'service', 1, 1]],
  );
});

test('traces without a root span are dropped and span depth follows parents', () => {
  assert.deepEqual(bundle.traces.map((trace) => trace.traceId).sort(), ['t1', 't2']);
  assert.equal(bundle.totals.traces, 2);
  const t1 = bundle.spans.t1;
  assert.deepEqual(t1.map((item) => item.depth), [0, 1, 2]);
  assert.equal(t1[1].offsetMs, 10);
  const summary = bundle.traces.find((trace) => trace.traceId === 't1');
  assert.equal(summary.status, 'error');
  assert.equal(summary.durationMs, 100);
  assert.equal(summary.logCount, 1);
});

test('logs are joined to their span and severities are normalised', () => {
  assert.equal(bundle.logs[0].severity, 'WARN');
  assert.equal(bundle.logs[1].spanName, 'demo.checkout');
  assert.equal(bundle.logs[1].durationMs, 80);
  assert.equal(bundle.totals.errorLogs, 1);
  assert.equal(bundle.logBuckets.length, 2);
});

test('metrics sum counters and average gauges', () => {
  const requests = bundle.metrics.find((series) => series.name === 'demo.requests');
  const duration = bundle.metrics.find((series) => series.name === 'demo.request.duration');
  assert.equal(requests.aggregation, 'sum');
  assert.equal(requests.points[0].value, 8);
  assert.equal(duration.aggregation, 'mean');
  assert.equal(duration.points[0].value, 45);
});

test('history keeps sorted, typed buckets and reports the newest bucket', () => {
  const history = buildHistory(
    [
      { t: '2026-11-04T08:05:00Z', service: 'gateway', requests: '10', errors: '1', avgMs: 12.345, p50: 10, p95: 30, p99: 40 },
      { t: '2026-11-04T08:00:00Z', service: 'checkout', requests: 4, errors: 0, avgMs: 8, p50: 7, p95: 9, p99: 9 },
      { t: '2026-11-04T08:00:00Z', service: '', requests: 1, errors: 0, avgMs: 1, p50: 1, p95: 1, p99: 1 },
    ],
    { bucketMinutes: 5, from: '2026-10-28T08:00:00.000Z' },
  );
  assert.deepEqual(history.points.map((point) => point.service), ['checkout', 'gateway']);
  assert.equal(history.points[1].requests, 10);
  assert.equal(history.points[1].avgMs, 12.35);
  assert.equal(history.to, '2026-11-04T08:05:00.000Z');
  assert.equal(buildBundle({ spans, logs, windowMinutes: 5, generatedAt: new Date(base).toISOString(), history }).history, history);
});
