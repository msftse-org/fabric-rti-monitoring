import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlowRoute, routeHash } from '../src/flow.ts';
for (const view of ['cost', 'otel']) {
  for (const step of ['input', 'results']) {
    test(`${view}/${step} has a distinct round-trippable route`, () => {
      assert.deepEqual(parseFlowRoute(routeHash({ view, step })), { view, step });
    });
  }
  test(`${view} legacy links return to inputs`, () => {
    assert.deepEqual(parseFlowRoute(`#${view}`), { view, step: 'input' });
  });
}
test('unknown links are safe and the sources route remains available', () => {
  assert.deepEqual(parseFlowRoute('#unknown/results'), { view: 'map', step: 'input' });
  assert.equal(routeHash(parseFlowRoute('#sources')), '#sources');
});
