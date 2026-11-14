import { DAY, HOUR } from './time.ts';
import type { Channel, EscalationPolicy, Monitor, NotificationRule, OnCallSeed, Schedule, Team, User } from './types.ts';

/** Every person here is fictional. */
const PEOPLE: [id: string, name: string, title: string, timezone: string, color: string, teams: string[]][] = [
  ['u-maya', 'Maya Cohen', 'Engineering Manager, Checkout', 'Asia/Jerusalem', '#7c5cff', ['checkout', 'platform']],
  ['u-daniel', 'Daniel Brooks', 'Senior Software Engineer', 'America/New_York', '#00a3a3', ['checkout']],
  ['u-sofia', 'Sofia Rossi', 'Software Engineer', 'Europe/Rome', '#e5609a', ['checkout']],
  ['u-kenji', 'Kenji Watanabe', 'Payments Engineer', 'Asia/Tokyo', '#e07b00', ['payments']],
  ['u-hana', 'Hana Sato', 'Payments Engineer', 'Asia/Tokyo', '#3d8bfd', ['payments']],
  ['u-aisha', 'Aisha Khan', 'Payments Tech Lead', 'Europe/London', '#2f9e44', ['payments']],
  ['u-elena', 'Elena Petrova', 'Senior Payments Engineer', 'Europe/Berlin', '#c2410c', ['payments']],
  ['u-liam', 'Liam Carter', 'Payments Engineer', 'America/Chicago', '#0f766e', ['payments']],
  ['u-marcus', 'Marcus Reed', 'Staff Engineer, Payments', 'America/Los_Angeles', '#9333ea', ['payments']],
  ['u-priya', 'Priya Nair', 'Fulfillment Tech Lead', 'Asia/Kolkata', '#d9480f', ['fulfillment']],
  ['u-tom', 'Tom Fischer', 'Software Engineer', 'Europe/Berlin', '#1971c2', ['fulfillment']],
  ['u-noa', 'Noa Levi', 'Software Engineer', 'Asia/Jerusalem', '#a61e4d', ['fulfillment']],
  ['u-diego', 'Diego Morales', 'Site Reliability Engineer', 'America/Mexico_City', '#5c7cfa', ['platform']],
  ['u-grace', 'Grace Kim', 'Site Reliability Engineer', 'America/Los_Angeles', '#087f5b', ['platform']],
  ['u-omar', 'Omar Haddad', 'Platform Lead', 'Europe/Paris', '#e8590c', ['platform']],
];

const rules = (...items: [number, Channel][]): NotificationRule[] => items.map(([delayMinutes, channel]) => ({ delayMinutes, channel }));

function makeUser([id, name, title, timezone, color, teamIds]: (typeof PEOPLE)[number], index: number): User {
  const [first, last] = name.split(' ');
  const voiceFirst = index % 4 === 1;
  return {
    id,
    name,
    initials: `${first[0]}${last[0]}`,
    email: `${first}.${last}@contoso-demo.example`.toLowerCase(),
    phone: `+1 555 01${String(10 + index).padStart(2, '0')}`,
    title,
    timezone,
    color,
    teamIds,
    preferences: {
      high: voiceFirst ? rules([0, 'push'], [0, 'voice'], [5, 'sms']) : rules([0, 'push'], [0, 'sms'], [3, 'voice']),
      low: index % 3 === 0 ? rules([0, 'email']) : rules([0, 'email'], [15, 'push']),
    },
  };
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// A Monday, so weekly rotations hand off at the start of the working week.
const ROTATION_EPOCH = '2026-10-05T09:00:00.000Z';

function teams(): Team[] {
  return [
    {
      id: 'checkout',
      name: 'Checkout Experience',
      handle: 'oncall-checkout-experience',
      description: 'Owns the public gateway and the checkout flow.',
      color: '#7c5cff',
      memberIds: ['u-maya', 'u-daniel', 'u-sofia'],
      adminIds: ['u-maya'],
      services: ['gateway', 'checkout'],
      scheduleIds: ['sched-checkout-primary', 'sched-checkout-secondary'],
      escalationPolicyId: 'ep-checkout',
      chatChannel: 'checkout-alerts',
      routingRules: [
        {
          id: 'rr-checkout-1',
          conditions: [
            { field: 'env', values: ['prod'] },
            { field: 'priority', values: ['1', '2'] },
          ],
          actions: [{ kind: 'escalation', policyId: 'ep-checkout', urgency: 'dynamic', ackTimeoutMinutes: 30 }],
        },
        { id: 'rr-checkout-2', conditions: [], actions: [{ kind: 'message', channel: 'checkout-alerts' }] },
      ],
    },
    {
      id: 'payments',
      name: 'Payments',
      handle: 'oncall-payments',
      description: 'Owns payment authorisation and the payments database.',
      color: '#e07b00',
      memberIds: ['u-aisha', 'u-kenji', 'u-hana', 'u-elena', 'u-liam', 'u-marcus'],
      adminIds: ['u-aisha'],
      services: ['payment'],
      scheduleIds: ['sched-payments-fts'],
      escalationPolicyId: 'ep-payments',
      chatChannel: 'payments-oncall',
      routingRules: [
        {
          id: 'rr-payments-1',
          conditions: [
            { field: 'env', values: ['prod'] },
            { field: 'alert_status', values: ['alert'] },
          ],
          actions: [{ kind: 'escalation', policyId: 'ep-payments', urgency: 'high' }],
        },
        {
          id: 'rr-payments-2',
          conditions: [{ field: 'alert_status', values: ['warn'] }],
          supportHours: { timezone: 'Europe/London', days: WEEKDAYS, startHour: 8, endHour: 18 },
          actions: [
            { kind: 'escalation', policyId: 'ep-payments', urgency: 'low' },
            { kind: 'message', channel: 'payments-oncall' },
          ],
        },
      ],
    },
    {
      id: 'fulfillment',
      name: 'Fulfillment',
      handle: 'oncall-fulfillment',
      description: 'Owns inventory, shipping and customer notifications.',
      color: '#1971c2',
      memberIds: ['u-priya', 'u-tom', 'u-noa'],
      adminIds: ['u-priya'],
      services: ['inventory', 'shipping', 'notifications'],
      scheduleIds: ['sched-fulfillment'],
      escalationPolicyId: 'ep-fulfillment',
      chatChannel: 'fulfillment-alerts',
      routingRules: [
        {
          id: 'rr-fulfillment-1',
          conditions: [{ field: 'priority', values: ['1', '2'] }],
          actions: [{ kind: 'escalation', policyId: 'ep-fulfillment', urgency: 'dynamic' }],
        },
        {
          id: 'rr-fulfillment-2',
          conditions: [],
          supportHours: { timezone: 'Europe/Berlin', days: WEEKDAYS, startHour: 9, endHour: 17 },
          actions: [{ kind: 'escalation', policyId: 'ep-fulfillment', urgency: 'low' }],
        },
      ],
    },
    {
      id: 'platform',
      name: 'Platform SRE',
      handle: 'oncall-platform-sre',
      description: 'Owns the AKS cluster, the OpenTelemetry pipeline and the Eventhouse.',
      color: '#087f5b',
      memberIds: ['u-omar', 'u-diego', 'u-grace', 'u-maya'],
      adminIds: ['u-omar'],
      services: [],
      scheduleIds: ['sched-platform'],
      escalationPolicyId: 'ep-platform',
      chatChannel: 'platform-sre',
      routingRules: [
        {
          id: 'rr-platform-1',
          conditions: [{ field: 'monitor_type', values: ['heartbeat'] }],
          // The demo cluster is stopped every night, so a missing-data page waits for working hours.
          supportHours: { timezone: 'Europe/Paris', days: ALL_DAYS, startHour: 8, endHour: 20 },
          actions: [
            { kind: 'escalation', policyId: 'ep-platform', urgency: 'low' },
            { kind: 'message', channel: 'platform-sre' },
          ],
        },
        {
          id: 'rr-platform-2',
          conditions: [{ field: 'env', values: ['prod'] }],
          actions: [{ kind: 'escalation', policyId: 'ep-platform', urgency: 'dynamic' }],
        },
      ],
    },
  ];
}

function schedules(now: number): Schedule[] {
  const day = Math.floor(now / DAY) * DAY;
  return [
    {
      id: 'sched-checkout-primary',
      name: 'Checkout Primary',
      teamId: 'checkout',
      timezone: 'Europe/Rome',
      layers: [{ id: 'l-checkout-weekly', name: 'Weekly rotation', rotationStart: ROTATION_EPOCH, shiftHours: 168, memberIds: ['u-daniel', 'u-sofia', 'u-maya'] }],
      overrides: [{ id: 'ov-checkout-1', userId: 'u-maya', start: day + DAY + 18 * HOUR, end: day + 2 * DAY + 6 * HOUR, note: 'Covering for a public holiday' }],
    },
    {
      id: 'sched-checkout-secondary',
      name: 'Checkout Secondary',
      teamId: 'checkout',
      timezone: 'Europe/Rome',
      layers: [{ id: 'l-checkout-secondary', name: 'Weekly rotation', rotationStart: ROTATION_EPOCH, shiftHours: 168, memberIds: ['u-sofia', 'u-maya', 'u-daniel'] }],
      overrides: [],
    },
    {
      id: 'sched-payments-fts',
      name: 'Payments Follow-the-Sun',
      teamId: 'payments',
      timezone: 'UTC',
      layers: [
        { id: 'l-pay-jp', name: 'JP Business Hours', rotationStart: '2026-10-05T00:00:00.000Z', shiftHours: 24, memberIds: ['u-kenji', 'u-hana'], restriction: { days: ALL_DAYS, startHour: 0, endHour: 8 } },
        { id: 'l-pay-eu', name: 'EU Business Hours', rotationStart: '2026-10-05T00:00:00.000Z', shiftHours: 24, memberIds: ['u-aisha', 'u-elena'], restriction: { days: ALL_DAYS, startHour: 8, endHour: 16 } },
        { id: 'l-pay-us', name: 'US Business Hours', rotationStart: '2026-10-05T00:00:00.000Z', shiftHours: 24, memberIds: ['u-liam', 'u-marcus'], restriction: { days: ALL_DAYS, startHour: 16, endHour: 24 } },
      ],
      overrides: [{ id: 'ov-payments-1', userId: 'u-elena', start: day + 2 * DAY + 8 * HOUR, end: day + 2 * DAY + 16 * HOUR, note: 'Swap with Aisha' }],
    },
    {
      id: 'sched-fulfillment',
      name: 'Fulfillment Primary',
      teamId: 'fulfillment',
      timezone: 'Europe/Berlin',
      layers: [
        { id: 'l-ful-daily', name: 'Daily rotation', rotationStart: '2026-10-05T07:00:00.000Z', shiftHours: 24, memberIds: ['u-priya', 'u-tom', 'u-noa'] },
        { id: 'l-ful-weekend', name: 'Weekend coverage', rotationStart: ROTATION_EPOCH, shiftHours: 168, memberIds: ['u-tom', 'u-noa'], restriction: { days: [0, 6], startHour: 0, endHour: 24 } },
      ],
      overrides: [],
    },
    {
      id: 'sched-platform',
      name: 'Platform SRE Primary',
      teamId: 'platform',
      timezone: 'UTC',
      layers: [{ id: 'l-platform-12h', name: '12 hour shifts', rotationStart: '2026-10-05T08:00:00.000Z', shiftHours: 12, memberIds: ['u-omar', 'u-grace', 'u-diego'] }],
      overrides: [],
    },
  ];
}

function policies(): EscalationPolicy[] {
  return [
    {
      id: 'ep-checkout',
      name: 'Checkout Experience - Default Escalation Policy',
      teamId: 'checkout',
      repeat: 2,
      resolveAfterExhausted: true,
      steps: [
        { id: 's1', escalateAfterMinutes: 5, assignment: 'notify-all', targets: [{ kind: 'schedule', id: 'sched-checkout-primary' }] },
        { id: 's2', escalateAfterMinutes: 10, assignment: 'notify-all', targets: [{ kind: 'schedule', id: 'sched-checkout-secondary' }] },
        { id: 's3', escalateAfterMinutes: 15, assignment: 'notify-all', targets: [{ kind: 'team', id: 'checkout' }] },
      ],
    },
    {
      id: 'ep-payments',
      name: 'Payments - Default Escalation Policy',
      teamId: 'payments',
      repeat: 3,
      resolveAfterExhausted: true,
      steps: [
        { id: 's1', escalateAfterMinutes: 5, assignment: 'notify-all', targets: [{ kind: 'schedule', id: 'sched-payments-fts' }] },
        { id: 's2', escalateAfterMinutes: 10, assignment: 'round-robin', targets: [{ kind: 'user', id: 'u-aisha' }, { kind: 'user', id: 'u-marcus' }] },
        { id: 's3', escalateAfterMinutes: 10, assignment: 'notify-all', targets: [{ kind: 'team', id: 'payments' }] },
      ],
    },
    {
      id: 'ep-fulfillment',
      name: 'Fulfillment - Default Escalation Policy',
      teamId: 'fulfillment',
      repeat: 1,
      resolveAfterExhausted: false,
      steps: [
        { id: 's1', escalateAfterMinutes: 10, assignment: 'notify-all', targets: [{ kind: 'schedule', id: 'sched-fulfillment' }] },
        { id: 's2', escalateAfterMinutes: 15, assignment: 'notify-all', targets: [{ kind: 'team', id: 'fulfillment' }] },
      ],
    },
    {
      id: 'ep-platform',
      name: 'Platform SRE - Default Escalation Policy',
      teamId: 'platform',
      repeat: 2,
      resolveAfterExhausted: true,
      steps: [
        { id: 's1', escalateAfterMinutes: 5, assignment: 'notify-all', targets: [{ kind: 'schedule', id: 'sched-platform' }] },
        { id: 's2', escalateAfterMinutes: 5, assignment: 'round-robin', targets: [{ kind: 'team', id: 'platform' }] },
        { id: 's3', escalateAfterMinutes: 10, assignment: 'notify-all', targets: [{ kind: 'user', id: 'u-omar' }, { kind: 'user', id: 'u-maya' }] },
      ],
    },
  ];
}

const TEAM_OF: Record<string, string> = { gateway: 'checkout', checkout: 'checkout', payment: 'payments', inventory: 'fulfillment', shipping: 'fulfillment', notifications: 'fulfillment' };
const HANDLE: Record<string, string> = { checkout: 'oncall-checkout-experience', payments: 'oncall-payments', fulfillment: 'oncall-fulfillment', platform: 'oncall-platform-sre' };

// Thresholds sit just above each service's typical 10-minute error rate and p95 in the demo
// workload, which injects errors and latency on purpose, so roughly half the pages upgrade to ALERT.
const ERROR_RATE: [service: string, warn: number, alert: number][] = [
  ['gateway', 0.09, 0.095],
  ['checkout', 0.16, 0.168],
  ['payment', 0.135, 0.142],
  ['inventory', 0.145, 0.15],
  ['shipping', 0.04, 0.044],
  ['notifications', 0.025, 0.03],
];
const LATENCY: [service: string, warn: number, alert: number][] = [
  ['gateway', 600, 620],
  ['checkout', 660, 668],
  ['payment', 560, 585],
];

function monitors(): Monitor[] {
  const list: Monitor[] = [];
  ERROR_RATE.forEach(([service, warn, alert], index) => {
    const team = TEAM_OF[service];
    list.push({
      id: 314_200 + index,
      name: `High error rate on ${service}`,
      type: 'apm',
      signal: 'error_rate',
      service,
      env: 'prod',
      teamId: team,
      priority: 2,
      windowMinutes: 10,
      warn,
      alert,
      unit: 'ratio',
      query: `sum(last_10m):sum:trace.server.request.errors{env:prod,service:${service}}.as_count() / sum:trace.server.request.hits{env:prod,service:${service}}.as_count() > ${alert}`,
      message: `{{#is_alert}}Error rate on ${service} is {{value}}.{{/is_alert}} {{#is_warning}}Error rate on ${service} is rising.{{/is_warning}} @${HANDLE[team]}`,
    });
  });
  LATENCY.forEach(([service, warn, alert], index) => {
    const team = TEAM_OF[service];
    list.push({
      id: 314_300 + index,
      name: `High p95 latency on ${service}`,
      type: 'apm',
      signal: 'p95_latency',
      service,
      env: 'prod',
      teamId: team,
      priority: 3,
      windowMinutes: 10,
      warn,
      alert,
      unit: 'ms',
      query: `percentile(last_10m):p95:trace.server.request{env:prod,service:${service}} > ${alert / 1000}`,
      message: `p95 latency on ${service} is {{value}} s. @${HANDLE[team]}`,
    });
  });
  list.push({
    id: 314_400,
    name: 'No telemetry from AKS cluster dev-aks-frti',
    type: 'heartbeat',
    signal: 'no_data',
    service: null,
    env: 'prod',
    teamId: 'platform',
    priority: 2,
    windowMinutes: 10,
    warn: null,
    alert: 10,
    unit: 'minutes',
    query: 'sum(last_10m):sum:trace.server.request.hits{env:prod,kube_cluster_name:dev-aks-frti}.as_count() < 1 (notify on no data after 10m)',
    message: `No spans received from the otel-demo namespace for 10 minutes. @${HANDLE.platform}`,
  });
  return list;
}

/** Overrides are placed relative to `now` so they always show up next to the current shift. */
export function buildSeed(now: number): OnCallSeed {
  return {
    users: PEOPLE.map(makeUser),
    teams: teams(),
    schedules: schedules(now),
    policies: policies(),
    monitors: monitors(),
    currentUserId: 'u-maya',
  };
}
