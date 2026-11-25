import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTotals, defaultComparison, restoreComparison, validateComparison } from '../src/comparison.ts';

test('monthly totals compare bills without implying telemetry-derived sizing', () => {
  const result = compareTotals({ method: 'totals', sourceMonthly: '1000', targetMonthly: '750' });
  assert.equal(result.difference, 250);
  assert.equal(result.percent, 25);
  assert.equal(result.annualDifference, 3000);
  assert.match(result.basis, /Customer-entered/);
});
test('higher target costs and zero source spend are represented without infinite savings', () => {
  const result = compareTotals({ method: 'totals', sourceMonthly: '0', targetMonthly: '100' });
  assert.equal(result.difference, -100);
  assert.equal(result.percent, null);
  assert.equal(compareTotals({ method: 'totals', sourceMonthly: '100', targetMonthly: '150' }).percent, -50);
});
test('missing or invalid totals block calculation while explicit zero remains valid', () => {
  for (const value of ['', '-1', 'NaN', '1e999', '1000000000001']) {
    const settings = { method: 'totals', sourceMonthly: value, targetMonthly: '0' };
    assert.ok(validateComparison(settings).sourceMonthly);
    assert.throws(() => compareTotals(settings), /valid monthly totals/);
  }
  assert.deepEqual(validateComparison({ method: 'totals', sourceMonthly: '0', targetMonthly: '0' }), {});
});
test('restores blank drafts and rejects unexpected properties or invalid comparisons', () => {
  assert.deepEqual(restoreComparison(defaultComparison()), defaultComparison());
  assert.throws(() => restoreComparison({ ...defaultComparison(), secret: 'not accepted' }), /schema/);
  assert.throws(() => restoreComparison({ ...defaultComparison(), method: 'unknown' }), /schema/);
  assert.throws(() => restoreComparison({ ...defaultComparison(), sourceMonthly: '-1' }), /non-negative/);
});
