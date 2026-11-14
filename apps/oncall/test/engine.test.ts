import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyActions,
  buildOnCall,
  buildSeed,
  draftToMonitor,
  emptyDraft,
  evaluateMonitors,
  lookup,
  onCallAt,
  pageIdFor,
  reflexDefinition,
  routeFor,
  ruleQuery,
  scheduleView,
  simulate,
  toDatadogPath,
  toIcs,
  toRtiPath,
  validateDraft,
} from '../src/index.ts';
import type { EscalationPolicy, History, Monitor, Schedule, Team } from '../src/index.ts';

const H = 3_600_000;
const M = 60_000;
const MONDAY = Date.parse('2026-11-02T00:00:00Z');

const schedule: Schedule = {
  id: 's',
  name: 'Primary',
  teamId: 't',
  timezone: 'UTC',
  layers: [
    { id: 'daily', name: 'Daily', rotationStart: '2026-11-02T00:00:00Z', shiftHours: 24, memberIds: ['a', 'b'] },
    { id: 'office', name: 'Office hours', rotationStart: '2026-11-02T00:00:00Z', shiftHours: 168, memberIds: ['c'], restriction: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 } },
  ],
  overrides: [{ id: 'o', userId: 'd', start: MONDAY + 26 * H, end: MONDAY + 28 * H, note: 'cover' }],
};

test('later layers win inside their restriction and overrides win over every layer', () => {
  assert.equal(onCallAt(schedule, MONDAY + 3 * H), 'a');
  assert.equal(onCallAt(schedule, MONDAY + 10 * H), 'c');
  assert.equal(onCallAt(schedule, MONDAY + 25 * H), 'b');
  assert.equal(onCallAt(schedule, MONDAY + 27 * H), 'd');
  const final = scheduleView(schedule, MONDAY, MONDAY + 30 * H).final.map((s) => [s.userId, (s.start - MONDAY) / H, (s.end - MONDAY) / H]);
  assert.deepEqual(final, [['a', 0, 9], ['c', 9, 17], ['a', 17, 24], ['b', 24, 26], ['d', 26, 28], ['b', 28, 30]]);
});

test('ICS export has one event per shift', () => {
  const view = scheduleView(schedule, MONDAY, MONDAY + 30 * H);
  const ics = toIcs(schedule, view.final, [], MONDAY);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 6);
  assert.match(ics, /DTSTART:20261102T090000Z/);
});

const monitor = (overrides: Partial<Monitor>): Monitor => ({
  id: 1,
  name: 'Errors',
  type: 'apm',
  signal: 'error_rate',
  service: 'svc',
  env: 'prod',
  teamId: 't',
  priority: 2,
  windowMinutes: 10,
  warn: 0.1,
  alert: 0.2,
  unit: 'ratio',
  query: '',
  message: '',
  ...overrides,
});

test('routing takes the first matching rule and renders a Datadog-style query', () => {
  const team = {
    routingRules: [
      { id: 'warn-only', conditions: [{ field: 'alert_status', values: ['warn'] }], actions: [] },
      { id: 'prod-p1-p2', conditions: [{ field: 'env', values: ['prod'] }, { field: 'priority', values: ['1', '2'] }], actions: [] },
      { id: 'catch-all', conditions: [], actions: [] },
    ],
  } as unknown as Team;
  const context = { env: 'prod', service: 'svc', priority: 2, monitorType: 'apm' };
  assert.equal(routeFor(team, { ...context, alertStatus: 'warn' })?.id, 'warn-only');
  assert.equal(routeFor(team, { ...context, alertStatus: 'alert' })?.id, 'prod-p1-p2');
  assert.equal(routeFor(team, { ...context, priority: 4, alertStatus: 'alert' })?.id, 'catch-all');
  assert.equal(ruleQuery(team.routingRules[1]), 'tags.env:prod priority:(1 OR 2)');
  assert.equal(ruleQuery(team.routingRules[2]), '*');
});

const bucket = (minute: number, requests: number, errors: number, service = 'svc') => ({
  t: new Date(MONDAY + minute * M).toISOString(),
  service,
  requests,
  errors,
  p95: 100,
});

test('monitors open a warn episode, upgrade it to alert, and recover', () => {
  const history: History = {
    bucketMinutes: 5,
    points: [bucket(0, 100, 5), bucket(5, 100, 5), bucket(10, 100, 15), bucket(15, 100, 25), bucket(20, 100, 25), bucket(25, 100, 2), bucket(30, 100, 2)],
  };
  const { episodes, status } = evaluateMonitors([monitor({})], history, MONDAY + 60 * M);
  assert.equal(episodes.length, 1);
  const [episode] = episodes;
  assert.equal(episode.status, 'warn');
  assert.equal(episode.start, MONDAY + 15 * M);
  assert.equal(episode.upgradedAt, MONDAY + 20 * M);
  assert.equal(episode.end, MONDAY + 35 * M);
  assert.equal(episode.peak, 0.25);
  assert.equal(status[0].state, 'ok');
});

test('a heartbeat monitor alerts on a data gap and recovers when data returns', () => {
  const history: History = { bucketMinutes: 5, points: [bucket(0, 50, 0), bucket(5, 50, 0), bucket(60, 50, 0)] };
  const heartbeat = monitor({ id: 2, type: 'heartbeat', signal: 'no_data', service: null, warn: null, alert: 10, unit: 'minutes' });
  const { episodes } = evaluateMonitors([heartbeat], history, MONDAY + 70 * M);
  assert.deepEqual(episodes.map((e) => [e.status, (e.start - MONDAY) / M, (e.end! - MONDAY) / M]), [['no_data', 20, 60]]);
  const silent = evaluateMonitors([heartbeat], { bucketMinutes: 5, points: [bucket(0, 50, 0)] }, MONDAY + 30 * M);
  assert.equal(silent.status[0].state, 'no_data');
  assert.equal(silent.episodes[0].end, null);
});

test('an unanswered page walks every step, repeats, then resolves when the policy is exhausted', () => {
  const seed = buildSeed(MONDAY);
  const lk = lookup(seed);
  const team = seed.teams[0];
  const policy: EscalationPolicy = {
    id: 'p',
    name: 'Two steps',
    teamId: team.id,
    steps: [
      { id: 's1', escalateAfterMinutes: 5, targets: [{ kind: 'user', id: 'u-daniel' }], assignment: 'notify-all' },
      { id: 's2', escalateAfterMinutes: 10, targets: [{ kind: 'user', id: 'u-sofia' }], assignment: 'notify-all' },
    ],
    repeat: 1,
    resolveAfterExhausted: true,
  };
  const page = simulate(
    { id: 1, triggeredAt: MONDAY, urgency: 'high', end: null, upgradeAt: null, team, rule: null, policy, ackTimeoutMinutes: null, now: MONDAY + 2 * H, respond: false },
    lk,
  );
  assert.deepEqual(
    page.events.filter((e) => e.kind === 'notified').map((e) => [(e.at - MONDAY) / M, e.userIds]),
    [[0, ['u-daniel']], [5, ['u-sofia']], [15, ['u-daniel']], [20, ['u-sofia']]],
  );
  assert.equal(page.status, 'resolved');
  assert.equal(page.resolution, 'policy_exhausted');
  assert.equal(page.resolvedAt, MONDAY + 30 * M);

  const midway = simulate(
    { id: 1, triggeredAt: MONDAY, urgency: 'high', end: null, upgradeAt: null, team, rule: null, policy, ackTimeoutMinutes: null, now: MONDAY + 7 * M, respond: false },
    lk,
  );
  assert.equal(midway.status, 'triggered');
  assert.equal(midway.currentStep, 1);
  assert.equal(midway.nextEscalationAt, MONDAY + 15 * M);
});

test('support hours hold notifications until the window opens', () => {
  const seed = buildSeed(MONDAY);
  const lk = lookup(seed);
  const team = seed.teams[0];
  const rule = { id: 'r', conditions: [], supportHours: { timezone: 'UTC', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 }, actions: [] };
  const policy: EscalationPolicy = { id: 'p', name: 'One step', teamId: team.id, steps: [{ id: 's1', escalateAfterMinutes: 5, targets: [{ kind: 'user', id: 'u-daniel' }], assignment: 'notify-all' }], repeat: 0, resolveAfterExhausted: false };
  const page = simulate({ id: 1, triggeredAt: MONDAY + 2 * H, urgency: 'high', end: null, upgradeAt: null, team, rule, policy, ackTimeoutMinutes: null, now: MONDAY + 12 * H, respond: false }, lk);
  assert.ok(page.events.some((e) => e.kind === 'held'));
  assert.equal(page.events.find((e) => e.kind === 'notified')?.at, MONDAY + 9 * H);
});

test('page numbers depend only on the trigger time and slot', () => {
  assert.equal(pageIdFor(MONDAY + 2 * M, 3), pageIdFor(MONDAY + 4 * M, 3));
  assert.notEqual(pageIdFor(MONDAY, 3), pageIdFor(MONDAY + 5 * M, 3));
});

test('cross-app links map each Datadog On-Call route to its RTI counterpart and back', () => {
  const pairs = [
    ['/on-call', '/'],
    ['/on-call/pages/1534414', '/pages/1534414'],
    ['/on-call/escalation-policies/ep-payments', '/escalations/ep-payments'],
    ['/monitors/314200', '/rules/314200'],
  ];
  for (const [datadog, rti] of pairs) {
    assert.equal(toRtiPath(datadog), rti);
    assert.equal(toDatadogPath(rti), datadog);
  }
  assert.equal(toDatadogPath('/compare'), '/on-call');
});

test('the model is identical for the same input and always has an escalating and an acknowledged page', () => {
  const points = Array.from({ length: 48 }, (_, index) => bucket(index * 5, 200, index % 12 === 6 ? 60 : 4, 'checkout'));
  const input = { generatedAt: new Date(MONDAY + 4 * H + 7 * M).toISOString(), history: { bucketMinutes: 5, points } };
  const first = buildOnCall(input);
  assert.deepEqual(buildOnCall(input), first);
  assert.ok(first.pages.some((page) => page.source === 'monitor'));
  const manual = first.pages.filter((page) => page.source === 'manual');
  assert.deepEqual(manual.map((page) => page.status).sort(), ['acknowledged', 'triggered']);
  const acknowledged = manual.find((page) => page.status === 'acknowledged')!;
  assert.ok(acknowledged.events.every((event) => event.kind !== 'escalated' || event.at < acknowledged.acknowledgedAt!));
});

test('viewer actions acknowledge, reassign and resolve on top of the model', () => {
  const model = buildOnCall({ generatedAt: new Date(MONDAY + 4 * H + 7 * M).toISOString(), history: { bucketMinutes: 5, points: [] } });
  const page = model.pages.find((item) => item.status === 'triggered')!;
  const at = model.now + M;
  const acked = applyActions(model, [{ kind: 'ack', pageId: page.id, at, by: 'u-maya' }], at);
  assert.equal(acked.pages.find((item) => item.id === page.id)?.acknowledgedBy, 'u-maya');
  const moved = applyActions(model, [{ kind: 'reassign', pageId: page.id, at, by: 'u-maya', toTeamId: 'payments', comment: 'Card flow' }], at);
  const reassigned = moved.pages.find((item) => item.id === page.id)!;
  assert.equal(reassigned.teamId, 'payments');
  assert.equal(reassigned.status, 'triggered');
  const resolved = applyActions(model, [{ kind: 'resolve', pageId: page.id, at, by: 'u-maya' }], at);
  assert.equal(resolved.pages.find((item) => item.id === page.id)?.resolution, 'manual');
  assert.equal(model.pages.find((item) => item.id === page.id)?.status, 'triggered');
});

test('an open manual page keeps escalating with the demo clock until the viewer acts on it', () => {
  const model = buildOnCall({ generatedAt: new Date(MONDAY + 4 * H + 7 * M).toISOString(), history: { bucketMinutes: 5, points: [] } });
  const page = model.pages.find((item) => item.status === 'triggered' && item.source === 'manual')!;
  const escalations = (pages: typeof model.pages) => pages.find((item) => item.id === page.id)!.events.filter((event) => event.kind === 'escalated').length;
  assert.equal(applyActions(model, [], model.now), model);
  const later = applyActions(model, [], model.now + 40 * M);
  assert.ok(escalations(later.pages) > escalations(model.pages));
  assert.ok(later.pages.find((item) => item.id === page.id)!.nextEscalationAt! > model.now + 40 * M);
  const ackAt = model.now + M;
  const acked = applyActions(model, [{ kind: 'ack', pageId: page.id, at: ackAt, by: 'u-maya' }], model.now + 40 * M).pages.find((item) => item.id === page.id)!;
  assert.equal(acked.status, 'acknowledged');
  assert.ok(acked.events.every((event) => event.kind !== 'escalated' || event.at <= ackAt));
});

test('a below rule fires when the request rate drops, counting silent buckets as zero while others report', () => {
  const points = [0, 5, 10, 15, 20, 25, 30].flatMap((minute) => [bucket(minute, 50, 0, 'other'), ...(minute >= 15 && minute < 25 ? [] : [bucket(minute, 100, 0)])]);
  const rate = monitor({ signal: 'request_rate', comparison: 'below', windowMinutes: 10, warn: 12, alert: 8, unit: 'rpm' });
  const { episodes } = evaluateMonitors([rate], { bucketMinutes: 5, points }, MONDAY + 35 * M);
  assert.deepEqual(episodes.map((e) => [e.status, (e.start - MONDAY) / M, (e.end! - MONDAY) / M, e.upgradedAt && (e.upgradedAt - MONDAY) / M, e.peak]), [['warn', 20, 35, 25, 0]]);
});

test('rules built in the app page through routing, send their messages, and skip when stopped', () => {
  const points = Array.from({ length: 48 }, (_, index) => bucket(index * 5, 200, index % 12 === 6 ? 60 : 4, 'checkout'));
  const now = MONDAY + 4 * H + 7 * M;
  const draft = { ...emptyDraft('checkout', 'maya.cohen@contoso-demo.example'), name: 'Checkout errors', alert: 15 };
  const paging = draftToMonitor(draft, 900_001, 'u-maya', now);
  const twin = draftToMonitor({ ...draft, name: 'Checkout errors twin' }, 900_002, 'u-maya', now);
  const notify = draftToMonitor({ ...draft, name: 'Checkout errors email', actions: { page: null, teams: null, email: { to: ['sre@example.com'] } } }, 900_003, 'u-maya', now);
  const stopped = draftToMonitor({ ...draft, name: 'Stopped' }, 900_004, 'u-maya', now, undefined, false);
  const model = buildOnCall({ generatedAt: new Date(now).toISOString(), history: { bucketMinutes: 5, points } }, { rules: [paging, twin, notify, stopped] });

  assert.deepEqual(model.monitors.slice(-4).map((rule) => rule.id), [900_001, 900_002, 900_003, 900_004]);
  assert.ok(!model.monitorStatus.some((status) => status.monitorId === 900_004));
  assert.ok(!model.episodes.some((episode) => episode.monitorId === 900_004));
  assert.ok(model.episodes.some((episode) => episode.monitorId === 900_003));
  assert.ok(!model.pages.some((page) => page.monitorId === 900_003 || page.monitorId === 900_004));

  const pages = model.pages.filter((page) => page.monitorId === 900_001 || page.monitorId === 900_002);
  assert.ok(pages.length >= 2);
  assert.equal(new Set(pages.map((page) => page.id)).size, pages.length);
  assert.ok(pages.every((page) => page.id % 16 >= 10 && page.id % 16 <= 13));
  const page = pages.find((item) => item.monitorId === 900_001)!;
  assert.deepEqual(page.events.slice(0, 2).map((event) => event.kind), ['triggered', 'routed']);
  const teams = page.events.find((event) => event.kind === 'message_sent' && event.channels?.includes('chat'))!;
  assert.match(teams.text, /Teams message \(alert\) sent to Maya Cohen/);
  assert.deepEqual(teams.userIds, ['u-maya']);
});

test('persisted Fabric alerts never fabricate pages or delivery events from snapshot history', () => {
  const now = MONDAY + 4 * H;
  const points = Array.from({ length: 48 }, (_, index) => bucket(index * 5, 200, 80, 'checkout'));
  const rule = draftToMonitor({ ...emptyDraft('checkout', 'responder@contoso.com'), name: 'Live errors', alert: 5 }, 900_005, 'fabric-app', now);
  rule.authored!.fabric = { itemId: 'live-item', workspaceId: 'workspace', revision: 'v1', url: 'https://app.fabric.microsoft.com' };
  const model = buildOnCall({ generatedAt: new Date(now).toISOString(), history: { bucketMinutes: 5, points } }, { rules: [rule] });
  assert.ok(model.monitors.some((monitor) => monitor.id === rule.id));
  assert.ok(!model.monitorStatus.some((status) => status.monitorId === rule.id));
  assert.ok(!model.episodes.some((episode) => episode.monitorId === rule.id));
  assert.ok(!model.pages.some((page) => page.monitorId === rule.id));
});

test('drafts are validated before they become rules', () => {
  const teams = buildSeed(MONDAY).teams;
  const base = emptyDraft('checkout', 'maya.cohen@contoso-demo.example');
  assert.deepEqual(validateDraft({ ...base, name: 'ok' }, teams), {});
  const errors = validateDraft({ ...base, name: ' ', signal: 'request_rate', comparison: 'below', warn: 3, alert: 5, actions: { page: null, teams: { recipients: ['not-an-email'] }, email: null } }, teams);
  assert.deepEqual(Object.keys(errors).sort(), ['name', 'teams', 'warn']);
  assert.ok(validateDraft({ ...base, name: 'x', actions: { page: null, teams: null, email: null } }, teams).actions);
});

test('the Activator export has one rule per threshold and action, and every reference resolves', () => {
  const now = MONDAY;
  const target = { workspaceId: 'ws', databaseItemId: 'db' };
  const draft = { ...emptyDraft('checkout', 'maya.cohen@contoso-demo.example'), name: 'Checkout errors', warn: 10, alert: 20, actions: { page: { urgency: 'routing' as const }, teams: { recipients: ['a@example.com'] }, email: { to: ['b@example.com'] } } };
  const exported = reflexDefinition(draftToMonitor(draft, 900_001, 'u-maya', now), target, 'Checkout', { start: true, now, placeholderRecipient: 'me@example.com' });
  assert.deepEqual(exported.rules.map((rule) => `${rule.level}:${rule.action}`), ['warn:Teams', 'warn:Email', 'alert:Teams', 'alert:Email']);
  const entities = exported.entities as { uniqueIdentifier: string; type: string; payload: { parentContainer?: { targetUniqueIdentifier: string }; definition?: { instance?: unknown; settings?: { shouldRun: boolean } } } }[];
  const ids = new Set(entities.map((entity) => entity.uniqueIdentifier));
  assert.equal(ids.size, entities.length);
  const references = JSON.stringify(entities).match(/"(?:targetUniqueIdentifier|value)":"([0-9a-f-]{36})"|entityId\\",\\"type\\":\\"string\\",\\"value\\":\\"([0-9a-f-]{36})/g) ?? [];
  assert.ok(references.length > 0);
  for (const reference of references) assert.ok(ids.has(reference.match(/[0-9a-f-]{36}/)![0]), reference);
  assert.ok(entities.filter((entity) => entity.payload.definition?.instance !== undefined).every((entity) => typeof entity.payload.definition!.instance === 'string'));
  const decoded = JSON.parse(Buffer.from(exported.createBody.definition.parts[0].payload, 'base64').toString());
  assert.deepEqual(decoded, entities);
  assert.equal(reflexDefinition(draftToMonitor(draft, 900_001, 'u-maya', now), target, 'Checkout', { start: true, now, placeholderRecipient: 'me@example.com' }).createBody.definition.parts[0].payload, exported.createBody.definition.parts[0].payload);

  const pageOnly = reflexDefinition(draftToMonitor({ ...draft, actions: { page: { urgency: 'high' }, teams: null, email: null } }, 900_002, 'u-maya', now), target, 'Checkout', { start: true, now, placeholderRecipient: 'me@example.com' });
  assert.ok(pageOnly.rules.every((rule) => rule.placeholder && rule.action === 'Teams'));
  const rules = (pageOnly.entities as typeof entities).filter((entity) => entity.payload.definition?.settings);
  assert.ok(rules.every((rule) => rule.payload.definition!.settings!.shouldRun === false));
  assert.match(pageOnly.followUps[0], /Page Checkout/);
});
