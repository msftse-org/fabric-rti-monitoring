/**
 * How each Datadog On-Call concept is delivered with Microsoft Fabric Real-Time
 * Intelligence. Support levels are deliberately conservative:
 *   native    - configured in Fabric (Eventhouse, Activator, Real-Time Dashboard) without custom code
 *   automate  - Activator hands off to Power Automate / Teams / Azure Communication Services
 *   built     - this app's own logic over Eventhouse tables (Fabric has no native on-call scheduler)
 *   gap       - no Fabric equivalent; a workaround is noted
 */
import type { Monitor } from './types.ts';

export type Support = 'native' | 'automate' | 'built' | 'gap';

export const SUPPORT_LABEL: Record<Support, string> = {
  native: 'Native in Fabric',
  automate: 'Activator + Power Automate',
  built: 'Built on Fabric data',
  gap: 'Gap',
};

export interface Capability {
  id: string;
  area: 'Alerting' | 'Teams and routing' | 'Escalation' | 'Schedules' | 'Responding' | 'Analytics and governance';
  datadog: { feature: string; detail: string; path: string };
  rti: { feature: string; detail: string; path: string; items: string[] };
  support: Support;
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'monitors',
    area: 'Alerting',
    datadog: { feature: 'Monitors page a team', detail: 'A monitor message that mentions @oncall-<team> creates a page for that team.', path: '/on-call/pages' },
    rti: { feature: 'Activator rules on Eventhouse KQL', detail: 'A KQL queryset runs every 5 minutes over OTELTraces; an Activator rule watches each service and fires the paging action with the owning team.', path: '/rules', items: ['Eventhouse', 'KQL queryset', 'Activator'] },
    support: 'native',
  },
  {
    id: 'authoring',
    area: 'Alerting',
    datadog: { feature: 'Create and edit monitors in the UI', detail: 'A monitor editor with a metric query, warning and alert thresholds, a preview graph and a notification message.', path: '/monitors' },
    rti: { feature: 'Activator rule designer', detail: 'This app saves real Activator sources, thresholds and native Teams/email actions through an authenticated Fabric Apps function. The historical preview and demo paging remain separate from live execution.', path: '/rules/new', items: ['Activator', 'Fabric REST API', 'This app'] },
    support: 'native',
  },
  {
    id: 'thresholds',
    area: 'Alerting',
    datadog: { feature: 'Warning and alert thresholds', detail: 'One monitor carries a warning and an alert threshold; the page urgency can follow the status.', path: '/on-call/pages' },
    rti: { feature: 'Two Activator conditions per signal', detail: 'Numeric change "Increases above" compared with per-service warn and alert threshold attributes returned by the query.', path: '/rules', items: ['Activator'] },
    support: 'native',
  },
  {
    id: 'no-data',
    area: 'Alerting',
    datadog: { feature: 'Notify on missing data', detail: 'A monitor alerts when its metric stops reporting.', path: '/on-call/pages' },
    rti: { feature: 'Activator heartbeat', detail: 'Heartbeat condition "No presence of data" for 10 minutes on the OTEL traces eventstream.', path: '/rules', items: ['Eventstream', 'Activator'] },
    support: 'native',
  },
  {
    id: 'auto-resolve',
    area: 'Alerting',
    datadog: { feature: 'Resolve on recovery', detail: 'When the monitor recovers, the page it created is resolved automatically.', path: '/on-call/pages' },
    rti: { feature: 'Recovery rule writes a resolved event', detail: 'A paired "Decreases below" condition calls the flow, which appends a resolved event to OnCallPageEvents.', path: '/pages', items: ['Activator', 'Power Automate', 'Eventhouse'] },
    support: 'automate',
  },
  {
    id: 'teams',
    area: 'Teams and routing',
    datadog: { feature: 'On-Call Teams', detail: 'Members, admins, a mention handle, schedules and a default escalation policy per team.', path: '/on-call/teams' },
    rti: { feature: 'Team roster in Eventhouse', detail: 'OnCallTeams and OnCallRoster tables, kept in sync with Microsoft Entra groups and edited in this app.', path: '/teams', items: ['Eventhouse', 'Microsoft Entra ID'] },
    support: 'built',
  },
  {
    id: 'routing',
    area: 'Teams and routing',
    datadog: { feature: 'Ordered routing rules', detail: 'Query conditions such as tags.env:prod priority:(1 OR 2), evaluated top to bottom; the first match wins.', path: '/on-call/teams/payments' },
    rti: { feature: 'Routing table in the paging flow', detail: 'The flow reads OnCallRouting and applies the first matching rule; simple filters can also live on the Activator rule.', path: '/teams/payments', items: ['Eventhouse', 'Power Automate'] },
    support: 'built',
  },
  {
    id: 'support-hours',
    area: 'Teams and routing',
    datadog: { feature: 'Support hours', detail: 'Outside the window, notifications are held until it opens.', path: '/on-call/teams/platform' },
    rti: { feature: 'Delay until the window opens', detail: 'The flow converts the time zone and waits with "Delay until" before it starts the escalation.', path: '/teams/platform', items: ['Power Automate'] },
    support: 'automate',
  },
  {
    id: 'urgency',
    area: 'Teams and routing',
    datadog: { feature: 'High, low and dynamic urgency', detail: 'Dynamic urgency maps WARN to low and ALERT to high.', path: '/on-call/teams/checkout' },
    rti: { feature: 'Urgency from the firing rule', detail: 'The warn rule pages low, the alert rule pages high; the flow picks contact methods by urgency.', path: '/rules', items: ['Activator', 'Power Automate'] },
    support: 'built',
  },
  {
    id: 'chat-route',
    area: 'Teams and routing',
    datadog: { feature: 'Route to a chat channel', detail: 'A routing rule can post to Slack or Microsoft Teams instead of, or as well as, paging.', path: '/on-call/teams/payments' },
    rti: { feature: 'Activator Teams message', detail: 'The Teams action posts to a channel or group chat directly from the rule.', path: '/rules', items: ['Activator', 'Microsoft Teams'] },
    support: 'native',
  },
  {
    id: 'escalation',
    area: 'Escalation',
    datadog: { feature: 'Escalation policies', detail: 'Ordered steps that page users, teams or schedules and escalate after N minutes without an acknowledgment (up to 10 steps).', path: '/on-call/escalation-policies' },
    rti: { feature: 'Paging flow with wait-for-response', detail: 'Each step posts an adaptive card with "Post adaptive card and wait for a response" and a timeout; on timeout the flow moves to the next step.', path: '/escalations', items: ['Power Automate', 'Microsoft Teams'] },
    support: 'automate',
  },
  {
    id: 'assignment',
    area: 'Escalation',
    datadog: { feature: 'Notify all or round robin', detail: 'A step can notify every target or rotate between them.', path: '/on-call/escalation-policies/ep-payments' },
    rti: { feature: 'Step assignment in the flow', detail: 'Apply-to-each for notify all; the page number modulo the target count for round robin.', path: '/escalations/ep-payments', items: ['Power Automate'] },
    support: 'automate',
  },
  {
    id: 'repeat',
    area: 'Escalation',
    datadog: { feature: 'Repeat and auto-resolve', detail: 'Repeat the whole policy up to N times, then optionally resolve the page.', path: '/on-call/escalation-policies/ep-checkout' },
    rti: { feature: 'Loop with a counter', detail: 'A Do until loop repeats the steps and writes a resolved event when the passes run out.', path: '/escalations/ep-checkout', items: ['Power Automate', 'Eventhouse'] },
    support: 'automate',
  },
  {
    id: 'ack-timeout',
    area: 'Escalation',
    datadog: { feature: 'Acknowledgment timeout', detail: 'An acknowledged page returns to triggered if it is not resolved in time.', path: '/on-call/teams/checkout' },
    rti: { feature: 'Timer after the acknowledgment', detail: 'The flow waits after the acknowledgment and re-enters the escalation loop if no resolved event arrived.', path: '/escalations/ep-checkout', items: ['Power Automate'] },
    support: 'automate',
  },
  {
    id: 'schedules',
    area: 'Schedules',
    datadog: { feature: 'Schedules with layers', detail: 'Rotations with shift length, handoff time and restrictions; later layers take precedence in the final schedule.', path: '/on-call/schedules' },
    rti: { feature: 'Shift table generated by this app', detail: 'Fabric has no on-call scheduler. This app resolves layers into OnCallShifts so KQL, Activator and flows can ask who is on call.', path: '/schedules', items: ['Eventhouse', 'This app'] },
    support: 'built',
  },
  {
    id: 'overrides',
    area: 'Schedules',
    datadog: { feature: 'Overrides', detail: 'Temporary cover that wins over every layer, requested in the UI or from chat.', path: '/on-call/schedules/sched-payments-fts' },
    rti: { feature: 'Override rows', detail: 'Overrides are rows with a higher precedence in OnCallShifts.', path: '/schedules/sched-payments-fts', items: ['Eventhouse', 'This app'] },
    support: 'built',
  },
  {
    id: 'calendar',
    area: 'Schedules',
    datadog: { feature: 'Export shifts to a calendar', detail: 'Subscribe to a schedule or to your own shifts.', path: '/on-call/schedules' },
    rti: { feature: 'ICS export', detail: 'Download an .ics file of the final schedule from this app.', path: '/schedules', items: ['This app'] },
    support: 'built',
  },
  {
    id: 'handover',
    area: 'Schedules',
    datadog: { feature: 'Handover automations', detail: 'Post a message, update a channel topic or a user group when the shift changes.', path: '/on-call/schedules' },
    rti: { feature: 'Scheduled handover flow', detail: 'A recurrence flow queries OnCallShifts and posts the new on-call to the team channel.', path: '/schedules', items: ['Power Automate', 'Microsoft Teams'] },
    support: 'automate',
  },
  {
    id: 'channels',
    area: 'Responding',
    datadog: { feature: 'Push, SMS, voice and email', detail: 'Per-urgency notification rules with delays for each contact method.', path: '/on-call/settings' },
    rti: { feature: 'Teams and email, SMS and voice through ACS', detail: 'Activator sends email and Teams natively; the flow adds SMS and voice calls through Azure Communication Services.', path: '/settings', items: ['Activator', 'Power Automate', 'Azure Communication Services'] },
    support: 'automate',
  },
  {
    id: 'chat-actions',
    area: 'Responding',
    datadog: { feature: 'Acknowledge from chat', detail: 'Slack and Teams notifications carry Acknowledge, Escalate and Resolve buttons.', path: '/on-call/pages' },
    rti: { feature: 'Adaptive card buttons', detail: 'The card response is written back to OnCallPageEvents and stops the escalation.', path: '/pages', items: ['Microsoft Teams', 'Power Automate', 'Eventhouse'] },
    support: 'automate',
  },
  {
    id: 'snooze-reassign',
    area: 'Responding',
    datadog: { feature: 'Snooze and reassign', detail: 'Pause the escalation, or hand the page to another person or team with a comment.', path: '/on-call/pages' },
    rti: { feature: 'Page actions in this app', detail: 'Actions append events to OnCallPageEvents; the flow honours them on its next step.', path: '/pages', items: ['This app', 'Eventhouse'] },
    support: 'built',
  },
  {
    id: 'timeline',
    area: 'Responding',
    datadog: { feature: 'Page timeline', detail: 'Every trigger, notification, escalation and acknowledgment, with comments.', path: '/on-call/pages' },
    rti: { feature: 'Append-only event table', detail: 'OnCallPageEvents is the audit trail; KQL rebuilds any page timeline.', path: '/pages', items: ['Eventhouse'] },
    support: 'built',
  },
  {
    id: 'incident',
    area: 'Responding',
    datadog: { feature: 'Declare an incident', detail: 'Promote a page to Datadog Incident Management.', path: '/on-call/pages' },
    rti: { feature: 'Hand off to an ITSM tool', detail: 'Fabric has no incident management; a flow can open a ServiceNow or Azure DevOps item and link it to the page.', path: '/pages', items: ['Power Automate'] },
    support: 'gap',
  },
  {
    id: 'mobile',
    area: 'Responding',
    datadog: { feature: 'On-Call mobile app', detail: 'Critical push alerts that can bypass Do Not Disturb.', path: '/on-call/settings' },
    rti: { feature: 'Teams mobile notifications', detail: 'There is no dedicated on-call app; use Teams notifications or an ACS voice call for critical pages.', path: '/settings', items: ['Microsoft Teams'] },
    support: 'gap',
  },
  {
    id: 'analytics',
    area: 'Analytics and governance',
    datadog: { feature: 'On-Call analytics', detail: 'Page volume, time to acknowledge and resolve, and responder load.', path: '/on-call/analytics' },
    rti: { feature: 'KQL over page events', detail: 'MTTA, MTTR and off-hours load are KQL over OnCallPageEvents, pinned to a Real-Time Dashboard.', path: '/analytics', items: ['Eventhouse', 'Real-Time Dashboard'] },
    support: 'native',
  },
  {
    id: 'access',
    area: 'Analytics and governance',
    datadog: { feature: 'Granular access', detail: 'Viewer, Overrider and Editor permissions on teams, schedules and policies.', path: '/on-call/teams' },
    rti: { feature: 'Workspace roles and app roles', detail: 'Fabric workspace roles protect the data; this app maps admins and members to edit rights.', path: '/teams', items: ['Fabric workspace roles', 'This app'] },
    support: 'built',
  },
  {
    id: 'cross-org',
    area: 'Analytics and governance',
    datadog: { feature: 'Cross-organisation paging', detail: 'Page a team that lives in another Datadog organisation.', path: '/on-call/teams' },
    rti: { feature: 'Not available', detail: 'Activator acts within one tenant; cross-tenant paging needs a custom connector.', path: '/compare', items: [] },
    support: 'gap',
  },
];

const SERVICE = "tostring(ResourceAttributes['service.name'])";

/** The scheduled KQL that feeds the Activator rule for a monitor. Runs as-is against the demo Eventhouse. */
export function monitorKql(monitor: Monitor): string {
  if (monitor.signal === 'no_data' && monitor.service) {
    return `// Activator heartbeat on the OTEL traces eventstream; this query shows the same signal.
OTELTraces
| where StartTime > ago(1h)
| where ${SERVICE} == '${monitor.service}'
| summarize LastSpan = max(StartTime) by Service = ${SERVICE}
| extend SilentMinutes = datetime_diff('minute', now(), LastSpan)
| extend NoData = SilentMinutes >= ${monitor.alert}`;
  }
  if (monitor.signal === 'no_data') {
    return `// Activator heartbeat on the OTEL traces eventstream; this query shows the same signal.
OTELTraces
| where StartTime > ago(1h)
| summarize LastSpan = max(StartTime) by Cluster = tostring(ResourceAttributes['k8s.cluster.name'])
| extend SilentMinutes = datetime_diff('minute', now(), LastSpan)
| extend NoData = SilentMinutes >= ${monitor.alert}`;
  }
  const value =
    monitor.signal === 'error_rate'
      ? 'Value = round(todouble(Errors) / Requests, 4)'
      : monitor.signal === 'request_rate'
        ? `Value = round(todouble(Requests) / ${monitor.windowMinutes}, 1)`
        : 'Value = round(P95, 1)';
  return `OTELTraces
| where StartTime > ago(${monitor.windowMinutes}m) and SpanKind == 'SPAN_KIND_SERVER'
| extend Service = ${SERVICE}, DurationMs = datetime_diff('microsecond', EndTime, StartTime) / 1000.0
| where Service == '${monitor.service}'
| summarize Requests = count(), Errors = countif(SpanStatus == 'STATUS_CODE_ERROR'), P95 = percentile(DurationMs, 95) by Service
| extend ${value}, WarnThreshold = ${monitor.warn ?? 'real(null)'}, AlertThreshold = ${monitor.alert}`;
}

export interface ActivatorRule {
  name: string;
  source: string;
  object: string;
  property: string;
  condition: string;
  occurrence: string;
  actions: string[];
}

/** The actions an authored rule takes at one threshold, in Activator terms. */
function authoredActions(monitor: Monitor, teamName: string, level: 'warn' | 'alert'): string[] {
  const actions = monitor.authored!.actions;
  const out: string[] = [];
  if (actions.page) {
    const urgency = actions.page.urgency === 'routing' ? (level === 'warn' ? 'from routing, warn' : 'from routing') : actions.page.urgency;
    out.push(`Custom action: Power Automate flow "Page ${teamName}" (urgency ${urgency})`);
  }
  if (actions.teams?.recipients.length) out.push(`Teams message to ${actions.teams.recipients.join(', ')}`);
  if (actions.email?.to.length) out.push(`Email to ${actions.email.to.join(', ')}`);
  return out;
}

/** The Activator rules that stand in for one Datadog monitor, or that a rule built in this app becomes. */
export function activatorRules(monitor: Monitor, teamName: string, channel: string): ActivatorRule[] {
  const authored = Boolean(monitor.authored);
  if (monitor.signal === 'no_data') {
    return [
      {
        name: `${monitor.name} (heartbeat)`,
        source: authored ? `KQL query ${monitor.name}, scheduled every 5 minutes` : 'Eventstream otel-traces',
        object: monitor.service ? 'Service' : 'Cluster',
        property: authored ? 'Requests' : 'StartTime',
        condition: `Heartbeat: No presence of data for ${monitor.alert} minutes`,
        occurrence: 'Every time the condition is met',
        actions: authored ? authoredActions(monitor, teamName, 'alert') : [`Custom action: Power Automate flow "Page ${teamName}" (urgency from routing)`, `Teams message to #${channel}`],
      },
    ];
  }
  const source = authored ? `KQL query ${monitor.name}, scheduled every 5 minutes` : 'KQL queryset oncall-monitors, scheduled every 5 minutes';
  const below = monitor.comparison === 'below';
  const change = below ? 'Decreases below' : 'Increases above';
  const threshold = (level: 'warn' | 'alert', value: number) => (authored ? formatThreshold(monitor, value) : level === 'warn' ? '@WarnThreshold' : '@AlertThreshold');
  const rules: ActivatorRule[] = [
    {
      name: `${monitor.name} - alert`,
      source,
      object: 'Service',
      property: 'Value',
      condition: `Numeric change: ${change} ${threshold('alert', monitor.alert)}`,
      occurrence: 'Every time the condition is met',
      actions: authored ? authoredActions(monitor, teamName, 'alert') : [`Custom action: Power Automate flow "Page ${teamName}" (urgency high)`],
    },
  ];
  if (monitor.warn !== null) {
    rules.push({
      name: `${monitor.name} - warn`,
      source,
      object: 'Service',
      property: 'Value',
      condition: `Numeric change: ${change} ${threshold('warn', monitor.warn)}`,
      occurrence: 'Every time the condition is met',
      actions: authored ? authoredActions(monitor, teamName, 'warn') : [`Custom action: Power Automate flow "Page ${teamName}" (urgency low)`],
    });
  }
  if (authored && !monitor.authored!.actions.page) return rules;
  const recovery = monitor.warn ?? monitor.alert;
  rules.push({
    name: `${monitor.name} - recovery`,
    source,
    object: 'Service',
    property: 'Value',
    condition: `Numeric change: ${below ? 'Increases above' : 'Decreases below'} ${authored ? formatThreshold(monitor, recovery) : `@${monitor.warn !== null ? 'WarnThreshold' : 'AlertThreshold'}`}`,
    occurrence: 'Every time the condition is met',
    actions: ['Custom action: Power Automate flow "Resolve page"'],
  });
  return rules;
}

/** Thresholds as Activator shows them: raw numbers in the query's unit. */
function formatThreshold(monitor: Monitor, value: number): string {
  if (monitor.unit === 'ratio') return `${value} (${+(value * 100).toFixed(2)}%)`;
  if (monitor.unit === 'ms') return `${value} ms`;
  if (monitor.unit === 'rpm') return `${value} req/min`;
  return `${value} min`;
}

/** Eventhouse tables that hold the on-call state when this design runs in production. */
export const ONCALL_TABLES_KQL = `.create-merge table OnCallTeams (TeamId: string, Name: string, Handle: string, EscalationPolicyId: string, ChatChannel: string)
.create-merge table OnCallRoster (UserId: string, Name: string, Email: string, TimeZone: string, Teams: dynamic, Preferences: dynamic)
.create-merge table OnCallShifts (ScheduleId: string, Layer: string, UserId: string, StartTime: datetime, EndTime: datetime, Precedence: int)
.create-merge table OnCallRouting (TeamId: string, RuleOrder: int, Conditions: dynamic, SupportHours: dynamic, Actions: dynamic)
.create-merge table OnCallPages (PageId: long, Title: string, TeamId: string, Service: string, Urgency: string, MonitorId: long, TriggeredAt: datetime)
.create-merge table OnCallPageEvents (PageId: long, Timestamp: datetime, Kind: string, Actor: string, Users: dynamic, Step: int, Detail: string)`;

export const WHO_IS_ON_CALL_KQL = `OnCallShifts
| where now() between (StartTime .. EndTime)
| summarize arg_max(Precedence, UserId) by ScheduleId
| join kind=leftouter OnCallRoster on UserId
| project ScheduleId, UserId, Name, Email`;

export const ANALYTICS_KQL = `OnCallPageEvents
| summarize Triggered = minif(Timestamp, Kind == 'triggered'),
            Acknowledged = minif(Timestamp, Kind == 'acknowledged'),
            Resolved = minif(Timestamp, Kind == 'resolved') by PageId
| join kind=inner OnCallPages on PageId
| extend TimeToAck = Acknowledged - Triggered, TimeToResolve = Resolved - Triggered
| summarize Pages = count(), High = countif(Urgency == 'high'),
            MTTA = percentile(TimeToAck, 50), MTTR = percentile(TimeToResolve, 50) by TeamId`;

/** The paging flow, step by step, as it would be built in Power Automate. */
export const PAGING_FLOW: { title: string; detail: string }[] = [
  { title: 'When an Activator rule fires', detail: 'Custom action trigger with PageId, TeamId, Service, Urgency and Value.' },
  { title: 'Write the triggered event', detail: 'Azure Data Explorer connector: ingest into OnCallPages and OnCallPageEvents.' },
  { title: 'Apply the routing rules', detail: 'Read OnCallRouting for the team; the first matching rule decides the policy, urgency and channel.' },
  { title: 'Respect support hours', detail: 'Outside the window, "Delay until" the window opens.' },
  { title: 'For each escalation step', detail: 'Resolve the step targets with the who-is-on-call query, then notify by urgency.' },
  { title: 'Wait for a response', detail: 'Teams "Post adaptive card and wait for a response" with the step timeout; SMS and voice through Azure Communication Services.' },
  { title: 'Record the outcome', detail: 'Acknowledge, resolve or escalate, appended to OnCallPageEvents; repeat the policy when every step times out.' },
];
