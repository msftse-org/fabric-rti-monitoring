import {
  activatorSourceKql,
  CAPABILITIES,
  channelsFor,
  dateTime,
  nameOf,
  ruleQuery,
  type Capability,
  type Channel,
  type Lookup,
  monitorKql,
  type Monitor,
  type OnCallModel,
  type Page,
  type PageEvent,
  type RoutingAction,
  type RoutingCondition,
  type RoutingRule,
  type Support,
  type Team,
  type Urgency,
} from '@oncall';

export const SUPPORT_ORDER: Support[] = ['native', 'automate', 'built', 'gap'];

const capabilities = new Map(CAPABILITIES.map((item) => [item.id, item]));
export const capability = (id: string): Capability | undefined => capabilities.get(id);

export const CHANNEL_FABRIC: Record<Channel, string> = {
  push: 'Teams notification',
  chat: 'Teams chat',
  email: 'Outlook email',
  sms: 'SMS via ACS',
  voice: 'Voice call via ACS',
};

export const CHANNEL_DATADOG: Record<Channel, string> = {
  push: 'Push (On-Call app)',
  chat: 'Slack / Teams',
  email: 'Email',
  sms: 'SMS',
  voice: 'Voice call',
};

/** How each channel is delivered from Fabric: Activator natively, or the paging flow. */
export const CHANNEL_ROUTE: Record<Channel, string> = {
  push: 'Power Automate: Teams "Post adaptive card and wait for a response"',
  chat: 'Activator Teams action or the flow',
  email: 'Activator email action, or Outlook from the flow',
  sms: 'Power Automate: Azure Communication Services SMS',
  voice: 'Power Automate: Azure Communication Services call',
};

export const URGENCY_LABEL: Record<Urgency, string> = { high: 'High', low: 'Low' };

export const SIGNAL_LABEL: Record<Monitor['signal'], string> = {
  error_rate: 'Error rate',
  p95_latency: 'p95 latency',
  request_rate: 'Request rate',
  no_data: 'Heartbeat',
};

/** The KQL a rule runs: the shared queryset for seeded rules, the rule's own Activator source for built ones. */
export function ruleKql(monitor: Monitor): string {
  if (!monitor.authored) return monitorKql(monitor);
  return activatorSourceKql(monitor).replace(/; /g, ';\n').replace(/ \| /g, '\n| ');
}

/** A Teams or email action from a rule built in the app, as the engine words it. */
function ruleMessage(event: PageEvent): { channel: 'Teams' | 'email'; level: string; to: string } | null {
  const match = /^Activator (Teams message|email) \((warn|alert)\) sent to (.+)$/.exec(event.text);
  return match ? { channel: match[1] === 'email' ? 'email' : 'Teams', level: match[2], to: match[3] } : null;
}

const FIELD_KQL: Record<RoutingCondition['field'], string> = {
  env: 'Env',
  service: 'Service',
  priority: 'Priority',
  alert_status: 'AlertStatus',
  monitor_type: 'MonitorType',
};

const FIELD_LABEL: Record<RoutingCondition['field'], string> = {
  env: 'Environment',
  service: 'Service',
  priority: 'Priority',
  alert_status: 'Rule severity',
  monitor_type: 'Rule type',
};

/** The routing condition as a KQL predicate over the Activator payload. */
export function conditionKql(rule: RoutingRule): string {
  if (!rule.conditions.length) return 'true // matches every alert';
  return rule.conditions
    .map(({ field, values }) => {
      const numeric = field === 'priority';
      const literal = (value: string) => (numeric ? value : `'${value}'`);
      return values.length > 1 ? `${FIELD_KQL[field]} in (${values.map(literal).join(', ')})` : `${FIELD_KQL[field]} == ${literal(values[0])}`;
    })
    .join(' and ');
}

export function conditionText(condition: RoutingCondition): string {
  const values = condition.field === 'alert_status' ? condition.values.map((value) => (value === 'alert' ? 'alert rule' : value === 'warn' ? 'warn rule' : value)) : condition.values;
  return `${FIELD_LABEL[condition.field]} ${values.length > 1 ? 'is one of' : 'is'} ${values.join(', ')}`;
}

export function routingActionText(action: RoutingAction, lk: Lookup): string {
  if (action.kind === 'message') return `Activator Teams message to #${action.channel}`;
  const policy = lk.policies.get(action.policyId);
  const urgency = action.urgency === 'dynamic' ? 'urgency from the firing rule (warn: low, alert: high)' : `urgency ${action.urgency}`;
  return `Run the escalation flow "${policy?.name ?? action.policyId}" with ${urgency}`;
}

export { ruleQuery };

export const flowName = (team: Team | undefined) => `Page ${team?.name ?? 'team'}`;

export function teamRule(page: Page, lk: Lookup): { rule: RoutingRule; index: number } | null {
  const team = lk.teams.get(page.teamId);
  const index = team?.routingRules.findIndex((rule) => rule.id === page.ruleId) ?? -1;
  return team && index >= 0 ? { rule: team.routingRules[index], index } : null;
}

export type ActorKind = 'activator' | 'flow' | 'user' | 'app' | 'monitor' | 'datadog';

export interface Described {
  actor: { kind: ActorKind; label: string; userId?: string };
  title: string;
  detail?: string;
  notified?: { userId: string; channels: string[] }[];
  capabilityId?: string;
}

export interface DescribeContext {
  page: Page;
  model: OnCallModel;
  lk: Lookup;
  byViewer: (kind: 'ack' | 'resolve', at: number) => boolean;
}

const user = (lk: Lookup, userId: string | undefined, label?: string) => ({ kind: 'user' as const, label: label ?? nameOf(lk, userId), userId });
const ACTIVATOR = { kind: 'activator' as const, label: 'Activator' };
const FLOW = { kind: 'flow' as const, label: 'Power Automate' };
const DATADOG = { kind: 'datadog' as const, label: 'Datadog On-Call' };

function monitorOf(page: Page, model: OnCallModel): Monitor | undefined {
  return page.monitorId === null ? undefined : model.monitors.find((item) => item.id === page.monitorId);
}

/** Name of the Activator rule that fired for a monitor page, as `activatorRules` names it. */
export function firingRuleName(monitor: Monitor, status: Page['alertStatus']): string {
  if (monitor.signal === 'no_data') return `${monitor.name} (heartbeat)`;
  return `${monitor.name} - ${status === 'warn' ? 'warn' : 'alert'}`;
}

function channelOf(event: PageEvent): string {
  return /#([\w-]+)/.exec(event.text)?.[1] ?? 'channel';
}

function minutesOf(event: PageEvent): string {
  return /(\d+) minutes?/.exec(event.text)?.[1] ?? '';
}

function capabilityFor(event: PageEvent, page: Page): string | undefined {
  switch (event.kind) {
    case 'triggered':
      return page.source === 'monitor' ? (page.alertStatus === 'no_data' ? 'no-data' : 'monitors') : 'timeline';
    case 'routed':
      return page.source === 'monitor' ? 'routing' : 'teams';
    case 'message_sent':
      return ruleMessage(event) ? 'authoring' : 'chat-route';
    case 'held':
      return 'support-hours';
    case 'notified':
      return 'channels';
    case 'skipped':
      return 'schedules';
    case 'escalated':
      return 'escalation';
    case 'repeated':
      return 'repeat';
    case 'acknowledged':
      return 'chat-actions';
    case 'ack_timeout':
      return 'ack-timeout';
    case 'urgency_changed':
      return 'urgency';
    case 'reassigned':
    case 'snoozed':
      return 'snooze-reassign';
    case 'commented':
      return 'timeline';
    case 'incident_declared':
      return 'incident';
    case 'resolved':
      return event.reason === 'monitor' ? 'auto-resolve' : event.reason === 'policy' ? 'repeat' : 'chat-actions';
  }
}

function notifiedList(event: PageEvent, lk: Lookup, urgency: Urgency, labels: Record<Channel, string>) {
  return (event.userIds ?? []).map((userId) => ({ userId, channels: channelsFor(lk.users.get(userId), event.urgency ?? urgency).map((channel) => labels[channel]) }));
}

/** An event in Fabric vocabulary: Activator, Power Automate, Eventhouse, Teams. */
export function describeFabric(event: PageEvent, ctx: DescribeContext): Described {
  const { page, model, lk } = ctx;
  const team = lk.teams.get(event.teamId ?? page.teamId);
  const policy = page.policyId ? lk.policies.get(page.policyId) : undefined;
  const monitor = monitorOf(page, model);
  const capabilityId = capabilityFor(event, page);
  const base = (described: Omit<Described, 'capabilityId'>): Described => ({ ...described, capabilityId });
  switch (event.kind) {
    case 'triggered':
      if (monitor) {
        return base({
          actor: ACTIVATOR,
          title: `Rule "${firingRuleName(monitor, page.alertStatus)}" fired`,
          detail: `Custom action started the "${flowName(team)}" flow with urgency ${event.urgency ?? page.urgency}.`,
        });
      }
      return base({ actor: { kind: 'app', label: 'This app' }, title: 'Page created in this app', detail: `Row written to OnCallPages; the "${flowName(team)}" flow started.` });
    case 'routed': {
      if (event.actorId) return base({ actor: user(lk, event.actorId), title: `Paged ${team?.name ?? 'the team'} manually`, detail: 'Manual pages skip routing and start the team escalation flow.' });
      const found = teamRule(page, lk);
      return base({
        actor: FLOW,
        title: found ? `Routing rule ${found.index + 1} matched in OnCallRouting` : 'Routing rule matched',
        detail: found ? `where ${conditionKql(found.rule)}` : event.text,
      });
    }
    case 'message_sent': {
      const sent = ruleMessage(event);
      if (sent) {
        return base({
          actor: ACTIVATOR,
          title: sent.channel === 'Teams' ? `Teams message sent to ${sent.to}` : `Email sent to ${sent.to}`,
          detail: `The ${sent.level} rule's ${sent.channel === 'Teams' ? 'Teams' : 'Email'} action, set in the rule builder.`,
        });
      }
      return base({ actor: ACTIVATOR, title: `Teams message posted to #${channelOf(event)}` });
    }
    case 'held':
      return base({ actor: FLOW, title: 'Outside support hours: "Delay until" the window opens', detail: page.heldUntil ? `Resumes ${dateTime(page.heldUntil)} UTC.` : undefined });
    case 'notified': {
      const step = event.stepIndex !== undefined ? `Step ${event.stepIndex + 1}${event.cycle ? `, pass ${event.cycle + 1}` : ''}` : 'Reassignment';
      return base({
        actor: FLOW,
        title: `${step}: adaptive card sent, waiting for a response`,
        notified: notifiedList(event, lk, page.urgency, CHANNEL_FABRIC),
      });
    }
    case 'skipped':
      return base({ actor: FLOW, title: `Nobody on call in ${lk.schedules.get(event.scheduleId ?? '')?.name ?? 'the schedule'}; target skipped`, detail: 'The who-is-on-call query over OnCallShifts returned no row.' });
    case 'escalated': {
      const previous = policy && event.stepIndex !== undefined ? policy.steps[event.stepIndex - 1] : undefined;
      return base({ actor: FLOW, title: `No response within ${previous?.escalateAfterMinutes ?? minutesOf(event)} min; moved to step ${(event.stepIndex ?? 0) + 1}`, detail: 'The adaptive card wait timed out.' });
    }
    case 'repeated':
      return base({ actor: FLOW, title: `Every step timed out; "Do until" loop starts pass ${(event.cycle ?? 0) + 1} of ${(policy?.repeat ?? 0) + 1}` });
    case 'acknowledged':
      return ctx.byViewer('ack', event.at)
        ? base({ actor: user(lk, event.actorId), title: 'Acknowledged in this app', detail: 'Event appended to OnCallPageEvents; the flow stops escalating.' })
        : base({ actor: user(lk, event.actorId), title: 'Acknowledged from the Teams adaptive card', detail: 'Card response written to OnCallPageEvents; escalation stopped.' });
    case 'ack_timeout':
      return base({ actor: FLOW, title: `Not resolved ${minutesOf(event)} min after acknowledgment; the flow re-entered the escalation loop` });
    case 'urgency_changed':
      return base({ actor: ACTIVATOR, title: 'Alert rule fired after the warn rule; urgency raised to High' });
    case 'reassigned':
      return base({ actor: user(lk, event.actorId), title: event.text.replace(/^Reassigned by [^:]+? to /, 'Reassigned to '), detail: 'Appended to OnCallPageEvents; the flow restarts with the new owner.' });
    case 'snoozed': {
      const until = page.snoozedUntil;
      return base({ actor: user(lk, event.actorId), title: until ? `Snoozed until ${dateTime(until)} UTC` : 'Snoozed', detail: 'The flow delays its next step until then.' });
    }
    case 'commented':
      return base({ actor: user(lk, event.actorId), title: 'Comment', detail: event.text });
    case 'incident_declared':
      return base({ actor: user(lk, event.actorId), title: `Incident ${page.incidentId ?? ''} handed off to ITSM`, detail: `${event.text.replace(/^.+? declared incident /, '')}. Fabric has no incident management; a Power Automate flow opens the ServiceNow or Azure DevOps item.` });
    case 'resolved':
      if (event.reason === 'monitor') return base({ actor: ACTIVATOR, title: 'Recovery rule fired: value decreased below the threshold', detail: 'The "Resolve page" flow wrote a resolved event to OnCallPageEvents.' });
      if (event.reason === 'policy') return base({ actor: FLOW, title: '"Do until" loop exhausted; page resolved automatically', detail: 'Every step and repeat ran without an acknowledgment.' });
      return ctx.byViewer('resolve', event.at)
        ? base({ actor: user(lk, event.actorId), title: 'Resolved in this app' })
        : base({ actor: user(lk, event.actorId), title: 'Resolved from the Teams adaptive card' });
  }
}

/** The same event in Datadog On-Call vocabulary, for the side-by-side view. */
export function describeDatadog(event: PageEvent, ctx: DescribeContext): Described {
  const { page, model, lk } = ctx;
  const team = lk.teams.get(event.teamId ?? page.teamId);
  const policy = page.policyId ? lk.policies.get(page.policyId) : undefined;
  const monitor = monitorOf(page, model);
  const status = page.alertStatus === 'warn' ? 'WARN' : page.alertStatus === 'no_data' ? 'NO DATA' : 'ALERT';
  switch (event.kind) {
    case 'triggered':
      if (monitor) return { actor: { kind: 'monitor', label: `Monitor ${monitor.id}` }, title: `Monitor "${monitor.name}" triggered ${status}`, detail: `@${team?.handle ?? 'team'} in the monitor message created a page.` };
      return { actor: DATADOG, title: 'Page created in Datadog On-Call', detail: `Paging @${team?.handle ?? 'team'}.` };
    case 'routed': {
      if (event.actorId) return { actor: user(lk, event.actorId), title: `Paged @${team?.handle ?? 'team'} manually` };
      const found = teamRule(page, lk);
      return { actor: DATADOG, title: found ? `Routing rule ${found.index + 1} matched` : 'Routing rule matched', detail: found ? ruleQuery(found.rule) : event.text };
    }
    case 'message_sent': {
      const sent = ruleMessage(event);
      if (sent) {
        return {
          actor: { kind: 'monitor', label: monitor ? `Monitor ${monitor.id}` : 'Monitor' },
          title: `${sent.level === 'warn' ? 'WARN' : 'ALERT'} notification sent to ${sent.to} by ${sent.channel === 'Teams' ? 'Microsoft Teams' : 'email'}`,
          detail: 'An @-mention in the monitor message.',
        };
      }
      return { actor: DATADOG, title: `Posted to #${channelOf(event)}` };
    }
    case 'held':
      return { actor: DATADOG, title: 'Outside support hours; notifications held', detail: page.heldUntil ? `Until ${dateTime(page.heldUntil)} UTC.` : undefined };
    case 'notified': {
      const step = event.stepIndex !== undefined ? `Escalation step ${event.stepIndex + 1}${event.cycle ? `, repeat ${event.cycle}` : ''}` : 'Reassigned';
      return { actor: DATADOG, title: `${step}: paged responders`, notified: notifiedList(event, lk, page.urgency, CHANNEL_DATADOG) };
    }
    case 'skipped':
      return { actor: DATADOG, title: `Schedule ${lk.schedules.get(event.scheduleId ?? '')?.name ?? ''} has nobody on call; skipped` };
    case 'escalated': {
      const previous = policy && event.stepIndex !== undefined ? policy.steps[event.stepIndex - 1] : undefined;
      return { actor: DATADOG, title: `Not acknowledged in ${previous?.escalateAfterMinutes ?? minutesOf(event)} min; escalated to step ${(event.stepIndex ?? 0) + 1}` };
    }
    case 'repeated':
      return { actor: DATADOG, title: `Escalation policy repeated (pass ${(event.cycle ?? 0) + 1} of ${(policy?.repeat ?? 0) + 1})` };
    case 'acknowledged':
      return ctx.byViewer('ack', event.at)
        ? { actor: user(lk, event.actorId), title: 'Acknowledged in the web app' }
        : { actor: user(lk, event.actorId), title: 'Acknowledged from the Datadog On-Call mobile app' };
    case 'ack_timeout':
      return { actor: DATADOG, title: `Acknowledgment timeout (${minutesOf(event)} min); page returned to triggered` };
    case 'urgency_changed':
      return { actor: { kind: 'monitor', label: monitor ? `Monitor ${monitor.id}` : 'Monitor' }, title: 'Monitor moved from WARN to ALERT; dynamic urgency raised to high' };
    case 'reassigned':
      return { actor: user(lk, event.actorId), title: event.text.replace(/^Reassigned by [^:]+? to /, 'Reassigned to ') };
    case 'snoozed':
      return { actor: user(lk, event.actorId), title: page.snoozedUntil ? `Snoozed until ${dateTime(page.snoozedUntil)} UTC` : 'Snoozed' };
    case 'commented':
      return { actor: user(lk, event.actorId), title: 'Comment', detail: event.text };
    case 'incident_declared':
      return { actor: user(lk, event.actorId), title: `Incident ${page.incidentId ?? ''} declared in Datadog Incident Management` };
    case 'resolved':
      if (event.reason === 'monitor') return { actor: { kind: 'monitor', label: monitor ? `Monitor ${monitor.id}` : 'Monitor' }, title: 'Monitor recovered; page resolved automatically' };
      if (event.reason === 'policy') return { actor: DATADOG, title: 'Escalation policy exhausted; page auto-resolved' };
      return ctx.byViewer('resolve', event.at)
        ? { actor: user(lk, event.actorId), title: 'Resolved in the web app' }
        : { actor: user(lk, event.actorId), title: 'Resolved from the Datadog On-Call mobile app' };
  }
}

export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pageTimelineKql = (pageId: number) => `OnCallPageEvents
| where PageId == ${pageId}
| order by Timestamp asc`;

export const utc = (ms: number) => `${dateTime(ms)} UTC`;
