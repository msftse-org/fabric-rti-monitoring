import assert from 'node:assert/strict';
import test from 'node:test';
import { declareIncident, updateIncident } from '../src/lib/incidentModel.ts';

test('declares a page-linked incident with a declaration event and initial commander', () => {
  const incident = declareIncident({
    id: 'INC-401',
    pageId: 401,
    title: 'SEV-2 Checkout errors',
    summary: 'Elevated errors during checkout',
    severity: 'SEV-2',
    commanderId: 'responder-a',
    declaredBy: 'responder-a',
    at: 1_000,
  });

  assert.equal(incident.status, 'triggered');
  assert.equal(incident.pageId, 401);
  assert.equal(incident.assignedTo, 'responder-a');
  assert.deepEqual(incident.events.map((event) => event.kind), ['declared']);
});

test('acknowledges, reassigns, resolves, and preserves incident history', () => {
  const declared = declareIncident({
    id: 'INC-402',
    pageId: 402,
    title: 'SEV-3 API latency',
    summary: '',
    severity: 'SEV-3',
    commanderId: 'responder-a',
    declaredBy: 'responder-a',
    at: 1_000,
  });
  const acknowledged = updateIncident(declared, { kind: 'acknowledge', by: 'responder-b', at: 2_000 });
  const assigned = updateIncident(acknowledged, { kind: 'assign', to: 'responder-c', by: 'responder-b', at: 3_000 });
  const resolved = updateIncident(assigned, { kind: 'resolve', by: 'responder-c', at: 4_000 });

  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(acknowledged.assignedTo, 'responder-b');
  assert.equal(assigned.assignedTo, 'responder-c');
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(resolved.events.map((event) => event.kind), ['declared', 'acknowledged', 'assigned', 'resolved']);
  assert.equal(updateIncident(resolved, { kind: 'acknowledge', by: 'responder-a', at: 5_000 }), resolved);
});
