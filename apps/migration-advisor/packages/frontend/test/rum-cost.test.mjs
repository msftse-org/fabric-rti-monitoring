import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAutomatic, validateAutomaticScenario } from '../src/automaticTarget.ts';
import { defaultScenario } from '../src/model.ts';
import { initialPlan } from '../src/catalog.ts';
import { exportDocument, restoreDocument } from '../src/persistence.ts';

const amount = (stack, id) => stack.lines.find(line => line.id === id)?.amount;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('RUM stays out of both comparisons until enabled for the selected vendor', () => {
  const scenario = defaultScenario();
  const baseline = calculateAutomatic(scenario, 'Datadog');
  Object.assign(scenario, { rumMonthlyGB: '500', cxRumMonthlyGB: '500', cxRumMonthlyCost: '100' });
  assert.deepEqual(calculateAutomatic(scenario, 'Datadog').target, baseline.target);
  assert.ok(!baseline.target.lines.some(line => line.id.startsWith('rum-')));

  scenario.rum = true;
  assert.ok(calculateAutomatic(scenario, 'Datadog').target.total > baseline.target.total);
  assert.ok(!calculateAutomatic(scenario, 'Coralogix').target.lines.some(line => line.id.startsWith('rum-')));
  scenario.rum = false;
  scenario.cxRum = true;
  assert.ok(!calculateAutomatic(scenario, 'Datadog').target.lines.some(line => line.id.startsWith('rum-')));
});

test('Datadog sessions produce an explicitly editable volume estimate and incremental costs', () => {
  const scenario = defaultScenario();
  const baseline = calculateAutomatic(scenario);
  Object.assign(scenario, { rum: true, rumSessions: '100000', rumKBPerSession: '20' });
  const result = calculateAutomatic(scenario);
  assert.equal(result.automatic.rum.monthlyGB, 2);
  assert.match(result.automatic.rum.volumeBasis, /estimate/i);
  close(amount(result.datadog, 'rum'), 15);
  close(amount(result.target, 'rum-appinsights'), 4.6);
  close(amount(result.target, 'rum-eventhubs'), 21.9);
  close(amount(result.target, 'rum-storage'), .0046);
  close(amount(result.target, 'rum-fabric'), 0);
  close(result.target.total - baseline.target.total, 4.6 + 21.9 + .0046);
  close(result.savings, result.datadog.total - result.target.total);
  assert.match(result.target.lines.find(line => line.id === 'rum-appinsights').formula, /no.*free/i);
  assert.match(result.target.lines.find(line => line.id === 'rum-eventhubs').formula, /0\.028.*million.*batch/i);
  assert.ok(result.automatic.assumptions.some(item => /no.*export charge.*AppPageViews/i.test(item)));
  assert.ok(result.automatic.assumptions.some(item => /export JSON.*differ/i.test(item)));
  assert.ok(result.automatic.limitations.some(item => /ingress event/i.test(item)));
});

test('measured source volume takes precedence and sizing charges only the added Fabric capacity', () => {
  const scenario = defaultScenario();
  const baseline = calculateAutomatic(scenario);
  Object.assign(scenario, { rum: true, rumSessions: '100000', rumMonthlyGB: '10000', rumKBPerSession: '99' });
  const result = calculateAutomatic(scenario);
  assert.equal(result.automatic.rum.monthlyGB, 10000);
  assert.match(result.automatic.rum.volumeBasis, /source volume/i);
  assert.equal(result.automatic.capacitySKU, 'F8');
  assert.equal(result.automatic.rum.requiredThroughputUnits, 4);
  close(amount(result.target, 'fabric'), amount(baseline.target, 'fabric'));
  close(amount(result.target, 'rum-fabric'), (8 - 2) * .18 * 720);
  close(amount(result.target, 'rum-appinsights'), 23000);
  close(amount(result.target, 'rum-eventhubs'), 4 * .03 * 730);
  close(amount(result.target, 'rum-storage'), 23);
  close(result.target.total, result.target.lines.reduce((sum, line) => sum + line.amount, 0));
  assert.equal(result.automatic.collectorReplicas, baseline.automatic.collectorReplicas);

  scenario.rumSharedEventHub = true;
  const shared = calculateAutomatic(scenario);
  assert.equal(shared.automatic.rum.incrementalThroughputUnits, 3);
  close(amount(shared.target, 'rum-eventhubs'), 3 * .03 * 730);
  close(result.target.total - shared.target.total, .03 * 730);
  close(shared.automatic.lowerMonthly, shared.target.total - amount(shared.target, 'fabric') - amount(shared.target, 'rum-fabric') + 259.2);
});

test('RUM assumptions disclose provisioned defaults and peak-sizing responsibilities', () => {
  for (const [vendor, input] of [
    ['Datadog', { rum: true, rumSessions: '100000', rumMonthlyGB: '10000' }],
    ['Coralogix', { cxRum: true, cxRumMonthlyGB: '10000', cxRumMonthlyCost: '1' }],
  ]) {
    const scenario = Object.assign(defaultScenario(), input);
    const result = calculateAutomatic(scenario, vendor);
    assert.equal(result.automatic.rum.requiredThroughputUnits, 4);
    const disclosure = result.automatic.assumptions.find(item => /2 partitions/i.test(item));
    assert.ok(disclosure, 'RUM provisioning disclosure is missing');
    assert.match(disclosure, /1 provisioned TU.*2 partitions/i);
    assert.match(disclosure, /TU estimates do not configure infrastructure/i);
    assert.match(disclosure, /TU and partition counts.*peak load before deployment/i);
    assert.match(disclosure, /Standard-tier partition counts cannot be changed after hub creation/i);
    const exported = exportDocument(vendor, initialPlan(), scenario);
    assert.ok(exported.calculation.automatic.assumptions.includes(disclosure));
  }
  assert.ok(!calculateAutomatic(defaultScenario()).automatic.assumptions.some(item => /2 partitions/i.test(item)));
});

test('40 required Standard TUs remain priced, including the shared-TU credit', () => {
  for (const vendor of ['Datadog', 'Coralogix']) {
    for (const shared of [false, true]) {
      const scenario = Object.assign(defaultScenario(), vendor === 'Datadog'
        ? { rum: true, rumMonthlyGB: '105120' }
        : { cxRum: true, cxRumMonthlyGB: '105120', cxContract: '1000' });
      scenario.rumSharedEventHub = shared;
      const result = calculateAutomatic(scenario, vendor);
      assert.equal(result.automatic.rum.requiredThroughputUnits, 40);
      assert.equal(result.automatic.rum.eventHubsLimitExceeded, false);
      assert.equal(result.automatic.rum.incrementalThroughputUnits, shared ? 39 : 40);
      assert.equal(result.target.complete, true);
      close(amount(result.target, 'rum-eventhubs'), (shared ? 39 : 40) * .03 * 730);
      assert.notEqual(result.savings, null);
      assert.notEqual(result.automatic.lowerMonthly, null);
      assert.notEqual(result.automatic.upperMonthly, null);
    }
  }
});

test('41 required Standard TUs are incomplete even when one already-paid shared TU is credited', () => {
  for (const vendor of ['Datadog', 'Coralogix']) {
    for (const shared of [false, true]) {
      const scenario = Object.assign(defaultScenario(), vendor === 'Datadog'
        ? { rum: true, rumMonthlyGB: '105120.0001' }
        : { cxRum: true, cxRumMonthlyGB: '105120.0001', cxContract: '1000' });
      scenario.rumSharedEventHub = shared;
      const result = calculateAutomatic(scenario, vendor);
      const hubLine = result.target.lines.find(line => line.id === 'rum-eventhubs');
      assert.equal(result.automatic.rum.requiredThroughputUnits, 41);
      assert.equal(result.automatic.rum.eventHubsLimitExceeded, true);
      assert.equal(result.automatic.rum.incrementalThroughputUnits, shared ? 40 : 41);
      assert.notEqual(result.automatic.capacityUnits, null, 'Fabric sizing is in range');
      assert.equal(hubLine.rate, null);
      assert.equal(hubLine.amount, null);
      assert.equal(result.target.complete, false);
      assert.equal(result.savings, null);
      assert.equal(result.automatic.lowerMonthly, null);
      assert.equal(result.automatic.upperMonthly, null);
      const explanation = result.automatic.limitations.find(item => /40.TU/i.test(item));
      assert.match(explanation, /41.*40.TU.*Standard.*namespace/i);
      assert.match(explanation, /multiple namespaces or another tier.*separate sizing and pricing/i);
      assert.match(hubLine.formula, /multiple namespaces or another tier/i);
      const exported = exportDocument(vendor, initialPlan(), scenario);
      assert.equal(exported.calculation.target.complete, false);
      assert.equal(exported.comparisonResult.complete, false);
      assert.equal(exported.comparisonResult.target, null);
      assert.equal(exported.comparisonResult.difference, null);
      assert.deepEqual(exported.comparisonResult.targetRange, { lowerMonthly: null, upperMonthly: null });
      assert.ok(exported.calculation.automatic.limitations.includes(explanation));
      assert.equal(restoreDocument(JSON.stringify(exported)).scenario.rumSharedEventHub, shared);
    }
  }
});

test('zero RUM volume retains the dedicated Event Hubs minimum or credits an existing shared TU', () => {
  const scenario = defaultScenario();
  const baseline = calculateAutomatic(scenario);
  Object.assign(scenario, { rum: true, rumSessions: '0' });
  const dedicated = calculateAutomatic(scenario);
  assert.equal(dedicated.automatic.rum.monthlyGB, 0);
  assert.equal(dedicated.automatic.rum.requiredThroughputUnits, 1);
  assert.equal(dedicated.automatic.rum.incrementalThroughputUnits, 1);
  close(amount(dedicated.target, 'rum-eventhubs'), .03 * 730);
  close(dedicated.target.total, baseline.target.total + .03 * 730);
  close(dedicated.automatic.lowerMonthly, baseline.automatic.lowerMonthly + .03 * 730);
  close(dedicated.automatic.upperMonthly, baseline.automatic.upperMonthly + .03 * 730);
  assert.ok(dedicated.target.lines.filter(line => line.id.startsWith('rum-') && line.id !== 'rum-eventhubs').every(line => line.amount === 0));
  assert.match(dedicated.target.lines.find(line => line.id === 'rum-eventhubs').formula, /minimum 1/i);
  assert.match(dedicated.automatic.assumptions.join('\n'), /rum\.bicep.*dedicated/i);

  scenario.rumSharedEventHub = true;
  const shared = calculateAutomatic(scenario);
  assert.equal(shared.automatic.rum.requiredThroughputUnits, 1);
  assert.equal(shared.automatic.rum.incrementalThroughputUnits, 0);
  close(amount(shared.target, 'rum-eventhubs'), 0);
  close(shared.target.total, baseline.target.total);
  assert.match(shared.automatic.assumptions.join('\n'), /alternative.*existing.*SAS/i);
  assert.match(shared.automatic.assumptions.join('\n'), /not provisioned/i);

  scenario.rum = false;
  const disabled = calculateAutomatic(scenario);
  assert.equal(disabled.automatic.rum.requiredThroughputUnits, 0);
  assert.equal(disabled.automatic.rum.incrementalThroughputUnits, 0);
  assert.ok(!disabled.target.lines.some(line => line.id.startsWith('rum-')));
  close(disabled.target.total, baseline.target.total);
});

test('missing active RUM volume is not silently free', () => {
  const scenario = defaultScenario();
  scenario.rum = true;
  scenario.rumSessions = '100';
  scenario.rumKBPerSession = '';
  assert.ok(validateAutomaticScenario(scenario, 'Datadog').rumKBPerSession);
  scenario.rumMonthlyGB = '0';
  assert.deepEqual(validateAutomaticScenario(scenario, 'Datadog'), {});
  scenario.cxRum = true;
  scenario.cxRumMonthlyGB = '';
  assert.ok(validateAutomaticScenario(scenario, 'Coralogix').cxRumMonthlyGB);
});

test('RUM storage retention assumptions distinguish the calculator from the shipped KQL and survive export', () => {
  for (const [vendor, days, expectedStorage] of [['Datadog', 15, .069], ['Coralogix', 30, .138]]) {
    const scenario = defaultScenario();
    Object.assign(scenario, vendor === 'Datadog'
      ? { rum: true, rumSessions: '1', rumMonthlyGB: '30', retention: '15' }
      : { cxRum: true, cxRumMonthlyGB: '30', cxRumMonthlyCost: '40' });
    const result = calculateAutomatic(scenario, vendor);
    const assumptions = result.automatic.assumptions.join('\n');
    assert.equal(result.automatic.retentionDays, days);
    close(amount(result.target, 'rum-storage'), expectedStorage);
    assert.match(assumptions, new RegExp(`RUM storage.*${days} days.*${vendor}`, 'i'));
    assert.match(assumptions, /fabric\/rum\.kql.*7.day/i);
    assert.match(assumptions, /like.for.like retention/i);
    const exported = exportDocument(vendor, initialPlan(), scenario);
    assert.deepEqual(exported.calculation.automatic.assumptions, result.automatic.assumptions);
  }
});

test('Coralogix RUM uses entered volume and a quote, or an all-in contract, without invented prices', () => {
  const scenario = defaultScenario();
  Object.assign(scenario, { logsGB: '0', traceGB: '0', metricGB: '0', cxRum: true, cxRumMonthlyGB: '30' });
  let result = calculateAutomatic(scenario, 'Coralogix');
  assert.equal(result.automatic.rum.monthlyGB, 30);
  assert.equal(amount(result.coralogix, 'cx-rum'), null);
  assert.equal(result.coralogix.complete, false);
  assert.equal(result.savings, null);
  close(amount(result.target, 'rum-appinsights'), 69);
  close(amount(result.target, 'rum-storage'), .138);

  scenario.cxRumMonthlyCost = '40';
  result = calculateAutomatic(scenario, 'Coralogix');
  close(amount(result.coralogix, 'cx-rum'), 40);
  close(result.coralogix.total, 40);
  close(result.savings, 40 - result.target.total);
  scenario.cxContract = '500';
  result = calculateAutomatic(scenario, 'Coralogix');
  assert.deepEqual(result.coralogix.lines.map(line => line.id), ['cx-contract']);
  close(result.coralogix.total, 500);
  scenario.cxContract = '';
  scenario.cxRumMonthlyGB = '0';
  scenario.cxRumMonthlyCost = '';
  result = calculateAutomatic(scenario, 'Coralogix');
  assert.equal(result.coralogix.complete, true);
  assert.equal(amount(result.coralogix, 'cx-rum'), 0);
  assert.equal(result.automatic.rum.requiredThroughputUnits, 1);
  close(amount(result.target, 'rum-eventhubs'), .03 * 730);
  scenario.rumSharedEventHub = true;
  result = calculateAutomatic(scenario, 'Coralogix');
  assert.equal(result.automatic.rum.incrementalThroughputUnits, 0);
  close(amount(result.target, 'rum-eventhubs'), 0);
});

test('older saved plans restore without new fields and new RUM choices survive export/import', () => {
  const legacy = exportDocument('Datadog', initialPlan(), defaultScenario());
  Object.assign(legacy.scenario, { rum: true, rumSessions: '120000' });
  for (const key of ['rumMonthlyGB', 'rumKBPerSession', 'cxRum', 'cxRumMonthlyGB', 'cxRumMonthlyCost', 'rumSharedEventHub', 'ddContract']) delete legacy.scenario[key];
  const restored = restoreDocument(JSON.stringify(legacy));
  assert.equal(restored.scenario.rum, true);
  assert.equal(restored.scenario.rumSessions, '120000');
  assert.equal(restored.scenario.rumKBPerSession, '20');
  assert.equal(restored.scenario.cxRum, false);
  assert.equal(restored.scenario.ddContract, '');
  close(calculateAutomatic(restored.scenario).automatic.rum.monthlyGB, 2.4);

  Object.assign(restored.scenario, { cxRum: true, cxRumMonthlyGB: '27', cxRumMonthlyCost: '19', rumSharedEventHub: true });
  const next = exportDocument('Coralogix', initialPlan(), restored.scenario);
  const roundTrip = restoreDocument(JSON.stringify(next));
  assert.equal(roundTrip.scenario.cxRumMonthlyGB, '27');
  assert.equal(roundTrip.scenario.cxRumMonthlyCost, '19');
  assert.equal(roundTrip.scenario.rumSharedEventHub, true);
  close(next.comparisonResult.target, next.calculation.target.total);
  assert.throws(() => restoreDocument(JSON.stringify({ ...next, scenario: { ...next.scenario, unexpected: 'no' } })), /schema/i);
});
