import test from 'node:test';
import assert from 'node:assert/strict';
import { exportDocument, restoreDocument } from '../src/persistence.ts';
import { initialPlan } from '../src/catalog.ts';
import { defaultScenario, calculate } from '../src/model.ts';
import { defaultOtel } from '../src/otel.ts';
import { defaultComparison } from '../src/comparison.ts';

const document = comparison => exportDocument('Datadog', initialPlan(), defaultScenario(), defaultOtel(), comparison);
test('new comparison drafts default to automatic usage projections with an indicative basis', () => {
  const d = document(defaultComparison());
  assert.equal(d.comparison.method, 'usage');
  assert.deepEqual(restoreDocument(JSON.stringify(d)).comparison, defaultComparison());
  assert.equal(typeof d.comparisonResult.difference, 'number');
  assert.equal(d.comparisonResult.indicative, true);
  assert.match(d.comparisonResult.basis, /not a sizing guarantee or quote/);
});
test('older version 1 documents without comparison settings restore a usage draft', () => {
  const { comparison, comparisonResult, ...legacy } = document(defaultComparison());
  assert.deepEqual(restoreDocument(JSON.stringify(legacy)).comparison, defaultComparison());
});
test('monthly totals export the selected result and explicit basis', () => {
  const c = { method: 'totals', sourceMonthly: '120', targetMonthly: '80' };
  const d = document(c);
  assert.deepEqual(restoreDocument(JSON.stringify(d)).comparison, c);
  assert.equal(d.comparisonResult.difference, 40);
  assert.match(d.comparisonResult.basis, /Customer-entered/);
  assert.deepEqual(d.calculation, calculate(defaultScenario(), 'Datadog'));
});
test('confirmed zero source totals do not produce an infinite percentage', () => {
  assert.equal(document({ method: 'totals', sourceMonthly: '0', targetMonthly: '10' }).comparisonResult.percent, null);
});
test('automatic usage export does not treat missing source quotes as savings', () => {
  const d = exportDocument('Coralogix', initialPlan(), defaultScenario(), defaultOtel(), defaultComparison());
  assert.match(d.comparisonResult.basis, /usage/i);
  assert.equal(d.comparisonResult.difference, null);
  assert.equal(d.comparisonResult.complete, false);
  assert.ok(d.comparisonResult.targetRange.upperMonthly > 0);
});
test('unsupported Fabric targets export no full target total and the plan still restores', () => {
  const scenario = defaultScenario();
  scenario.logsGB = '1000000000000';
  const d = exportDocument('Datadog', initialPlan(), scenario);
  assert.equal(d.calculation.target.complete, false);
  assert.equal(d.comparisonResult.target, null);
  assert.equal(d.comparisonResult.difference, null);
  assert.equal(restoreDocument(JSON.stringify(d)).scenario.logsGB, scenario.logsGB);
});
test('automatic exports retain source usage and model assumptions without stale customer target overrides', () => {
  const scenario = defaultScenario();
  Object.assign(scenario, { days: '15', logsGB: '42', fabricRate: '999', collector: '999' });
  const d = exportDocument('Datadog', initialPlan(), scenario, defaultOtel(), defaultComparison());
  const restored = restoreDocument(JSON.stringify(d));
  assert.equal(restored.scenario.days, '15');
  assert.equal(restored.scenario.logsGB, '42');
  assert.equal(restored.scenario.hours, '360');
  assert.equal(restored.scenario.fabricRate, '');
  assert.equal(restored.scenario.collector, '');
  assert.equal(d.calculation.automatic.hours, 360);
  assert.ok(d.calculation.automatic.assumptions.length);
  assert.match(d.calculation.automatic.limitations[0], /not a confidence interval/);
});
test('comparison schema remains strict on imported documents', () => {
  const d = document(defaultComparison());
  for (const comparison of [null, [], { ...defaultComparison(), method: 'other' }, { ...defaultComparison(), secret: 'no' }]) {
    assert.throws(() => restoreDocument(JSON.stringify({ ...d, comparison })), /comparison/i);
  }
});
test('invalid quick draft strings do not block saving and restoring unrelated OTel settings', () => {
  const c = { method: 'totals', sourceMonthly: '-1', targetMonthly: 'unknown' };
  const d = document(c);
  assert.equal(d.comparisonResult, null);
  const restored = restoreDocument(JSON.stringify(d));
  assert.deepEqual(restored.comparison, c);
  assert.deepEqual(restored.otel, defaultOtel());
});
