import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAlert, formatAlertValue, seedAlertDefinitions } from '../src/lib/alerts.ts';

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
