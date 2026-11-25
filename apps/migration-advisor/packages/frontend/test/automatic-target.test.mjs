import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAutomatic, validateAutomaticScenario } from '../src/automaticTarget.ts';
import { defaultScenario } from '../src/model.ts';

test('source signals automatically price capacity, storage, Grafana and collector without target inputs', () => {
  const scenario = defaultScenario();
  const result = calculateAutomatic(scenario);
  assert.equal(result.automatic.dailyGB, 13);
  assert.equal(result.automatic.monthlyGB, 390);
  assert.equal(result.automatic.capacitySKU, 'F2');
  assert.equal(result.target.complete, true);
  assert.equal(result.target.missing, 0);
  assert.ok(Math.abs(result.target.total - (259.2 + .897 + 49.248 + 30 + 38.88)) < 1e-9);
  assert.match(result.automatic.basis, /not a Microsoft sizing formula/);
});

test('changing volume changes storage and scales the illustrative capacity and collector', () => {
  const scenario = defaultScenario();
  const before = calculateAutomatic(scenario);
  scenario.logsGB = '1000';
  const after = calculateAutomatic(scenario);
  assert.equal(after.automatic.dailyGB, 1003);
  assert.equal(after.automatic.capacitySKU, 'F32');
  assert.equal(after.automatic.collectorReplicas, 5);
  assert.ok(after.target.total > before.target.total);
  assert.ok(after.automatic.upperMonthly > after.automatic.lowerMonthly);
});

test('legacy target rates, capacity settings and discounts do not alter automatic projections', () => {
  const scenario = defaultScenario();
  const before = calculateAutomatic(scenario);
  Object.assign(scenario, { fabricRate: '999', grafanaRate: '999', userRate: '999', collector: '999', hours: '0', grafanaHours: '0', users: '100', targetDiscount: '100', allocation: '0', storageEnabled: true, storageGB: '9999', cacheEnabled: true, cacheGB: '9999', runtime: 'aks', aks: '999' });
  assert.deepEqual(calculateAutomatic(scenario).target, before.target);
  assert.deepEqual(calculateAutomatic(scenario).automatic, before.automatic);
});

test('zero data retains explicit always-on baseline and shorter billing months scale runtime', () => {
  const scenario = defaultScenario();
  Object.assign(scenario, { logsGB: '0', traceGB: '0', metricGB: '0' });
  const before = calculateAutomatic(scenario);
  assert.equal(before.automatic.capacitySKU, 'F2');
  assert.equal(before.target.lines.find(line => line.id === 'storage').amount, 0);
  assert.ok(before.target.total > 0);
  scenario.days = '15';
  assert.deepEqual(validateAutomaticScenario(scenario), {});
  const after = calculateAutomatic(scenario);
  assert.equal(after.automatic.hours, 360);
  assert.equal(after.target.lines.find(line => line.id === 'runtime').amount, before.target.lines.find(line => line.id === 'runtime').amount / 2);
});

test('source quote omissions still suppress differences and oversized loads are not clamped into a false estimate', () => {
  const scenario = defaultScenario();
  assert.equal(calculateAutomatic(scenario, 'Coralogix').savings, null);
  scenario.cxContract = '500';
  assert.notEqual(calculateAutomatic(scenario, 'Coralogix').savings, null);
  scenario.logsGB = '1000000000000';
  const result = calculateAutomatic(scenario);
  assert.equal(result.automatic.capacityUnits, null);
  assert.equal(result.automatic.upperMonthly, null);
  assert.equal(result.target.complete, false);
  assert.equal(result.savings, null);
  assert.match(result.automatic.limitations.at(-1), /exceeds/);
});

test('retention basis affects automatic storage and invalid source usage cannot be projected', () => {
  const scenario = defaultScenario();
  scenario.retention = '3';
  assert.equal(calculateAutomatic(scenario).automatic.retentionDays, 3);
  assert.equal(calculateAutomatic(scenario, 'Coralogix').automatic.retentionDays, 30);
  scenario.logsGB = '-1';
  assert.throws(() => calculateAutomatic(scenario));
});
