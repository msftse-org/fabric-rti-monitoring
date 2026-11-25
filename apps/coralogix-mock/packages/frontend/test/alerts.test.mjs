import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAlert, formatAlertValue, seedAlertDefinitions } from '../src/lib/alerts.ts';
import { applyIncidentAction, createIncidentState, reconcileIncidents } from '../src/lib/incidents.ts';

const service = (overrides = {}) => ({
  name: 'checkout',
  requests: 100,
  errors: 12,
  errorRate: 0.12,
  p95: 800,
  rpm: 30,
  errorLogs: 4,
  ...overrides,
});
const rule = (overrides = {}) => ({
  id: 'rule-1',
  name: 'Checkout errors',
  signal: 'error_rate',
  service: 'checkout',
  comparison: 'above',
  threshold: 10,
  severity: 'critical',
  destinations: [{ id: 'email', target: 'oncall@example.test' }],
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});
const log = (severity, serviceName = 'checkout') => ({ severity, service: serviceName });
const trace = (errorCount, rootService = 'checkout') => ({ errorCount, rootService });

test('evaluates metric thresholds for the selected service and all services', () => {
  const result = evaluateAlert(rule(), [service()], [], []);
  assert.equal(result.value, 12);
  assert.equal(result.triggered, true);
  assert.equal(evaluateAlert(rule({ service: 'gateway', threshold: 10 }), [service()], [], []).value, null);
  assert.equal(evaluateAlert(rule({ service: 'All services', threshold: 10 }), [service(), service({ name: 'gateway', requests: 300, errors: 0, errorRate: 0, rpm: 20 })], [], []).value, 3);
});

test('supports below-threshold rules and non-breaching conditions', () => {
  assert.equal(evaluateAlert(rule({ signal: 'p95_latency', comparison: 'below', threshold: 900 }), [service()], [], []).triggered, true);
  assert.equal(evaluateAlert(rule({ signal: 'request_rate', comparison: 'above', threshold: 30 }), [service()], [], []).triggered, false);
});

test('evaluates log and trace alert signals from the matching service only', () => {
  const logs = [log('ERROR'), log('FATAL'), log('INFO'), log('ERROR', 'gateway')];
  assert.equal(evaluateAlert(rule({ signal: 'error_logs', threshold: 1 }), [service()], logs, []).value, 2);
  assert.equal(evaluateAlert(rule({ signal: 'trace_errors', threshold: 1 }), [service()], [], [trace(1), trace(2), trace(0), trace(1, 'gateway')]).value, 2);
});

test('seeds realistic local-only examples and formats values with units', () => {
  const seeded = seedAlertDefinitions([service()], 0);
  assert.equal(seeded.length, 3);
  assert(seeded.every((definition) => definition.service === 'checkout'));
  assert.equal(seeded[0].destinations[0].target, 'RTI operations service');
  assert.equal(formatAlertValue('error_rate', 2.45), '2.45%');
  assert.equal(formatAlertValue('p95_latency', 350), '350 ms');
  assert.equal(formatAlertValue('trace_errors', null), 'No data');
});

test('creates alert-generated incidents on trigger edges and auto-resolves on recovery', () => {
  const enabledRule = rule({ id: 'edge-rule', name: 'Checkout errors' });
  let state = createIncidentState();
  state = reconcileIncidents(state, [{ rule: enabledRule, value: 12, triggered: true }], 1_000, () => 'episode-1');
  assert.equal(state.incidents.length, 1);
  assert.equal(state.incidents[0].status, 'triggered');
  assert.equal(state.incidents[0].alertId, enabledRule.id);

  state = reconcileIncidents(state, [{ rule: enabledRule, value: 2, triggered: false }], 2_000, () => 'unused');
  assert.equal(state.incidents[0].status, 'resolved');
  assert.equal(state.incidents[0].resolvedBy, 'alert');

  state = reconcileIncidents(state, [{ rule: enabledRule, value: 13, triggered: true }], 3_000, () => 'episode-2');
  assert.deepEqual(state.incidents.map((incident) => incident.id), ['episode-2', 'episode-1']);
  assert.equal(state.incidents[0].status, 'triggered');
});

test('acknowledges and assigns locally, snoozes, and resolves with an audit history', () => {
  let state = reconcileIncidents(createIncidentState(), [{ rule: rule({ id: 'ops-rule' }), value: 12, triggered: true }], 1_000, () => 'ops-episode');
  state = applyIncidentAction(state, 'ops-episode', { kind: 'assign', by: 'You', at: 1_500 });
  state = applyIncidentAction(state, 'ops-episode', { kind: 'acknowledge', by: 'You', at: 2_000 });
  assert.equal(state.incidents[0].status, 'acknowledged');
  assert.equal(state.incidents[0].assignedTo, 'You');

  state = applyIncidentAction(state, 'ops-episode', { kind: 'snooze', by: 'You', at: 3_000, until: 63_000 });
  state = applyIncidentAction(state, 'ops-episode', { kind: 'assign', by: 'You', at: 4_000 });
  state = applyIncidentAction(state, 'ops-episode', { kind: 'resolve', by: 'You', at: 5_000 });
  assert.equal(state.incidents[0].status, 'resolved');
  assert.equal(state.incidents[0].resolvedBy, 'user');
  assert.deepEqual(state.incidents[0].events.map((event) => event.kind), ['triggered', 'assigned', 'acknowledged', 'snoozed', 'resolved']);
});
