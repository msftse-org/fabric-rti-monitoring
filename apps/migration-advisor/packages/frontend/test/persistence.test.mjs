import test from 'node:test';
import assert from 'node:assert/strict';
import { exportDocument, restoreDocument } from '../src/persistence.ts';
import { initialPlan } from '../src/catalog.ts';
import { defaultScenario } from '../src/model.ts';
import { defaultOtel } from '../src/otel.ts';

test('version 1 persists OTel drafts and restores old plans with defaults', () => {
  const otel = { ...defaultOtel(), mode: 'replace', auth: 'workload', queryUri: 'https://example.kusto.fabric.microsoft.com', workspaceName: 'Pilot workspace', logs: false };
  const document = exportDocument('Coralogix', initialPlan(), defaultScenario(), otel);
  assert.equal(document.version, 1);
  assert.deepEqual(restoreDocument(JSON.stringify(document)).otel, otel);
  const { otel: omitted, ...legacy } = document;
  assert.deepEqual(restoreDocument(JSON.stringify(legacy)).otel, defaultOtel());
  assert.deepEqual(restoreDocument(JSON.stringify(exportDocument('Datadog', initialPlan(), defaultScenario()))).otel, defaultOtel());
});

test('restoring an older map drops the three retired feature choices', () => {
  const document = exportDocument('Datadog', initialPlan(), defaultScenario());
  document.plan = {
    ...document.plan,
    exports: { needed: true, count: 1, priority: 'Could', target: 'KQL APIs + governed export' },
    quotas: { needed: true, count: 1, priority: 'Could', target: 'Capacity monitoring + budgets' },
    ownership: { needed: true, count: 1, priority: 'Could', target: 'Customer platform operations' },
  };
  const restored = restoreDocument(JSON.stringify(document));
  assert.equal(Object.keys(restored.plan).length, 27);
  assert.equal('exports' in restored.plan, false);
  assert.equal('quotas' in restored.plan, false);
  assert.equal('ownership' in restored.plan, false);
});

test('restore rejects malformed OTel properties without accepting secret-shaped extras', () => {
  const document = exportDocument('Datadog', initialPlan(), defaultScenario());
  for (const otel of [null, [], { ...defaultOtel(), auth: 'unknown' }, { ...defaultOtel(), logs: 'yes' }, { ...defaultOtel(), secret: 'not-allowed' }]) {
    assert.throws(() => restoreDocument(JSON.stringify({ ...document, otel })), /OTel/);
  }
});
