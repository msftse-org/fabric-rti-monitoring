import test from 'node:test';
import assert from 'node:assert/strict';
import { features, featuresForVendor, filterFeatures, initialPlan, planCounts, validPlan } from '../src/catalog.ts';
import { exportDocument, restoreDocument } from '../src/persistence.ts';
import { defaultScenario } from '../src/model.ts';

test('all 27 categories have explicit dated official vendor evidence', () => {
  assert.equal(features.length, 27);
  for (const feature of features) for (const vendor of ['Datadog', 'Coralogix']) {
    const capability = feature.capabilities[vendor];
    assert.ok(capability.name && capability.description && capability.migration);
    assert.ok(['Native', 'Integration', 'Limited scope', 'Separate offering', 'Not verified'].includes(capability.support));
    assert.ok(capability.evidence.length);
    for (const source of capability.evidence) {
      assert.equal(source.reviewed, '2026-11-21');
      assert.match(source.url, /^https:\/\/(docs\.datadoghq\.com|coralogix\.com|snowbit\.io)\//);
    }
    if (vendor === 'Datadog') assert.equal(capability.support, 'Native');
  }
  assert.equal(featuresForVendor('Datadog').length, 27);
  assert.equal(featuresForVendor('Coralogix').length, 26);
  const cx = id => features.find(f => f.id === id).capabilities.Coralogix;
  assert.equal(cx('notebooks').support, 'Not verified');
  assert.match(cx('notebooks').description, /Not verified in reviewed documentation/);
  assert.equal(cx('oncall').support, 'Integration');
  assert.equal(cx('synthetics').support, 'Integration');
  assert.equal(cx('db').support, 'Limited scope');
  assert.equal(cx('posture').support, 'Separate offering');
  assert.equal(cx('security').support, 'Separate offering');
  for (const id of ['profiling', 'replay', 'slo', 'incidents']) assert.equal(cx(id).support, 'Native');
});

test('active counts, searches and dispositions exclude only unverified categories', () => {
  const plan = initialPlan();
  plan.notebooks.needed = true;
  assert.equal(planCounts(plan, 'Datadog').selected, 7);
  assert.equal(planCounts(plan, 'Coralogix').selected, 6);
  assert.equal(planCounts(plan, 'Coralogix').Redesign, 0);
  assert.equal(filterFeatures('Coralogix', 'notebook', 'All', 'All', false, plan).length, 0);
  assert.equal(filterFeatures('Datadog', 'notebook', 'Explore', 'Redesign', true, plan).length, 1);
  assert.deepEqual(filterFeatures('Coralogix', 'client-span', 'Applications', 'Redesign', false, plan).map(f => f.id), ['db']);
  assert.equal(filterFeatures('Coralogix', 'RUM Measure', 'All', 'All', false, plan).length, 0);
  assert.equal(filterFeatures('Coralogix', 'Checkly', 'Experience', 'Specialist', false, plan)[0].id, 'synthetics');
});

test('export mappings are active-vendor only while strict union plan survives restore', () => {
  const plan = initialPlan();
  plan.notebooks = { ...plan.notebooks, needed: true, count: 3, priority: 'Should' };
  const document = exportDocument('Coralogix', plan, defaultScenario());
  assert.equal(document.mappings.length, 26);
  assert.ok(!document.mappings.some(f => f.id === 'notebooks'));
  assert.equal(document.mappings.find(f => f.id === 'db').name, 'Database client-span insights');
  assert.equal(document.mappings.find(f => f.id === 'db').capability.support, 'Limited scope');
  assert.equal(validPlan(document.plan), true);
  const restored = restoreDocument(JSON.stringify(document));
  assert.deepEqual(restored.plan.notebooks, plan.notebooks);
  assert.equal(exportDocument('Datadog', restored.plan, restored.scenario).mappings.length, 27);
});
