import { applyActions } from './actions.ts';
import { lookup, simulate, type Lookup } from './escalation.ts';
import { evaluateMonitors, type History } from './monitors.ts';
import { contextFor, routeFor } from './routing.ts';
import { buildSeed } from './seed.ts';
import { HOUR, MINUTE, pageIdFor } from './time.ts';
import type { AlertEpisode, Monitor, OnCallModel, Page, PageEvent, Urgency, UserAction } from './types.ts';

export { pageIdFor };

/** The subset of a telemetry bundle the engine reads. */
export interface OnCallInput {
  generatedAt: string;
  history?: { bucketMinutes: number; points: History['points'] };
  servicePoints?: History['points'];
}

/** Older snapshots carry no history, so fold the one-minute service points into five-minute buckets. */
export function historyOf(input: OnCallInput): History {
  if (input.history?.points.length) return { bucketMinutes: input.history.bucketMinutes, points: input.history.points };
  const buckets = new Map<string, History['points'][number]>();
  for (const point of input.servicePoints ?? []) {
    const start = new Date(Math.floor(Date.parse(point.t) / (5 * MINUTE)) * 5 * MINUTE).toISOString();
    const key = `${start}|${point.service}`;
    const item = buckets.get(key) ?? { t: start, service: point.service, requests: 0, errors: 0, p95: 0 };
    item.p95 = (item.p95 * item.requests + point.p95 * point.requests) / Math.max(1, item.requests + point.requests);
    item.requests += point.requests;
    item.errors += point.errors;
    buckets.set(key, item);
  }
  return { bucketMinutes: 5, points: [...buckets.values()].sort((a, b) => a.t.localeCompare(b.t)) };
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMonitorValue(monitor: Monitor, value: number | null): string {
  if (value === null) return 'no data';
  if (monitor.unit === 'ratio') return percent(value);
  if (monitor.unit === 'ms') return `${Math.round(value)} ms`;
  if (monitor.unit === 'rpm') return `${value >= 100 ? Math.round(value) : value.toFixed(1)} req/min`;
  return `${Math.round(value)} min`;
}

const SIGNAL_NAME: Record<Exclude<Monitor['signal'], 'no_data'>, string> = {
  error_rate: 'Error rate',
  p95_latency: 'p95 latency',
  request_rate: 'Request rate',
};

export function describe(monitor: Monitor, episode: AlertEpisode): string {
  if (monitor.signal === 'no_data') {
    return `No spans arrived from ${monitor.service ?? 'the otel-demo namespace'} for ${monitor.alert} minutes.`;
  }
  const threshold = episode.status === 'warn' ? monitor.warn ?? monitor.alert : monitor.alert;
  const verb = monitor.comparison === 'below' ? 'dropped to' : 'reached';
  return `${SIGNAL_NAME[monitor.signal]} on ${monitor.service} ${verb} ${formatMonitorValue(monitor, episode.peak)} over the last ${monitor.windowMinutes} minutes (threshold ${formatMonitorValue(monitor, threshold)}).`;
}

/** Display names for message recipients: roster people by name, anyone else by address. */
function recipientNames(addresses: string[], lk: Lookup): { text: string; userIds: string[] } {
  const users = [...lk.users.values()];
  const userIds: string[] = [];
  const names = addresses.map((address) => {
    const user = users.find((candidate) => candidate.email.toLowerCase() === address.toLowerCase());
    if (user) userIds.push(user.id);
    return user?.name ?? address;
  });
  return { text: names.join(', '), userIds };
}

/** The Teams and email messages an authored rule sends when it fires, and again if a warn episode reaches the alert threshold. */
export function ruleMessages(monitor: Monitor, episode: AlertEpisode, teamId: string, lk: Lookup): PageEvent[] {
  const actions = monitor.authored?.actions;
  if (!actions) return [];
  const firings: [number, string][] = [[episode.start, episode.status]];
  if (episode.upgradedAt !== null) firings.push([episode.upgradedAt, 'alert']);
  const events: PageEvent[] = [];
  for (const [at, level] of firings) {
    if (actions.teams?.recipients.length) {
      const { text, userIds } = recipientNames(actions.teams.recipients, lk);
      events.push({ at, kind: 'message_sent', teamId, channels: ['chat'], userIds, text: `Activator Teams message (${level}) sent to ${text}` });
    }
    if (actions.email?.to.length) {
      const { text, userIds } = recipientNames(actions.email.to, lk);
      events.push({ at, kind: 'message_sent', teamId, channels: ['email'], userIds, text: `Activator email (${level}) sent to ${text}` });
    }
  }
  return events;
}

function pageFromEpisode(episode: AlertEpisode, monitor: Monitor, id: number, now: number, lk: Lookup): Page | null {
  const paging = monitor.authored ? monitor.authored.actions.page : { urgency: 'routing' as const };
  if (!paging) return null;
  const team = lk.teams.get(monitor.teamId);
  if (!team) return null;
  const rule = routeFor(team, contextFor(monitor, episode.status));
  if (!rule) return null;
  const fixed = paging.urgency === 'routing' ? null : paging.urgency;
  // A rule that asks for a page always reaches people: when the matching route only posts a message, use the team's first policy.
  const escalation =
    rule.actions.find((action) => action.kind === 'escalation') ??
    (fixed ? team.routingRules.flatMap((candidate) => candidate.actions).find((action) => action.kind === 'escalation') : undefined);
  const policy = escalation ? lk.policies.get(escalation.policyId) ?? null : null;
  const dynamic = !fixed && escalation?.urgency === 'dynamic';
  const urgency: Urgency = fixed ?? (!escalation ? 'low' : dynamic ? (episode.status === 'warn' ? 'low' : 'high') : (escalation.urgency as Urgency));
  const sim = simulate(
    {
      id,
      triggeredAt: episode.start,
      urgency,
      end: episode.end,
      upgradeAt: dynamic ? episode.upgradedAt : null,
      team,
      rule,
      policy,
      ackTimeoutMinutes: escalation?.ackTimeoutMinutes ?? null,
      now,
    },
    lk,
  );
  const messages = ruleMessages(monitor, episode, team.id, lk).filter((event) => event.at <= now);
  if (messages.length) {
    // Activator sends its messages as the rule fires, so they follow the trigger and routing entries that share its timestamp.
    const opening = sim.events.findIndex((event) => event.at > episode.start || !['triggered', 'routed', 'message_sent'].includes(event.kind));
    const at = opening === -1 ? sim.events.length : opening;
    sim.events = [...sim.events.slice(0, at), ...messages.filter((event) => event.at === episode.start), ...sim.events.slice(at)];
    const later = messages.filter((event) => event.at !== episode.start);
    if (later.length) sim.events = [...sim.events, ...later].sort((a, b) => a.at - b.at);
  }
  return {
    id,
    source: 'monitor',
    title: monitor.name,
    description: monitor.authored && monitor.message ? `${describe(monitor, episode)} ${monitor.message}` : describe(monitor, episode),
    teamId: team.id,
    service: monitor.service,
    monitorId: monitor.id,
    alertStatus: episode.status,
    value: episode.peak,
    triggeredAt: episode.start,
    ruleId: rule.id,
    policyId: policy?.id ?? null,
    snoozedUntil: null,
    incidentId: null,
    ...sim,
  };
}

/**
 * Two people-raised pages, so the demo always has one page escalating and one being worked,
 * even when every monitor is healthy. They sit on fixed grids (15 minutes for the escalating
 * page, an hour for the acknowledged one), so a page keeps its number and timeline while live
 * data refreshes, and a fresh one replaces it on the next grid line.
 */
function manualPages(model: OnCallModel): OnCallModel {
  const escalating = Math.floor(model.now / (15 * MINUTE)) * 15 * MINUTE - 4 * MINUTE;
  const worked = Math.floor(model.now / HOUR) * HOUR - 26 * MINUTE;
  const seeded: [UserAction, UserAction] = [
    {
      kind: 'manual',
      pageId: pageIdFor(escalating, 14),
      at: escalating,
      by: 'u-omar',
      teamId: 'checkout',
      urgency: 'high',
      title: 'Customers report checkout spinning after "Place order"',
      description: 'Support has 14 tickets in 20 minutes about orders hanging on the confirmation step. No monitor has fired yet; please check gateway and checkout traces.',
    },
    {
      kind: 'manual',
      pageId: pageIdFor(worked, 14),
      at: worked,
      by: 'u-priya',
      teamId: 'payments',
      urgency: 'low',
      title: 'Card declines from one acquirer look higher than usual',
      description: 'Fulfillment sees more orders parked as "payment pending". Can payments confirm whether the acquirer retry policy changed?',
    },
  ];
  const [escalatingPage, workedPage] = seeded;
  const withPages = applyActions(applyActions(model, [escalatingPage], model.now), [workedPage], worked + 4 * MINUTE);
  const responder = withPages.pages.find((page) => page.id === workedPage.pageId)?.responderIds[0];
  if (!responder) return withPages;
  return applyActions(
    withPages,
    [
      { kind: 'ack', pageId: workedPage.pageId, at: worked + 4 * MINUTE, by: responder },
      { kind: 'comment', pageId: workedPage.pageId, at: worked + 9 * MINUTE, by: responder, text: 'Looking at payment spans with status ERROR, grouping by acquirer.' },
    ],
    model.now,
  );
}

/** Seeded monitors own page slots 0 to 9 and people-raised pages 14 and 15, so rules built in the app take 10 to 13. */
const AUTHORED_FIRST_SLOT = 10;
const AUTHORED_LAST_SLOT = 13;

export interface BuildOptions {
  now?: number;
  /** Rules created in the app's rule builder. Stopped rules are listed but not evaluated. */
  rules?: Monitor[];
}

export function buildOnCall(input: OnCallInput, options: BuildOptions = {}): OnCallModel {
  const now = options.now ?? Date.parse(input.generatedAt);
  const seed = buildSeed(now);
  const authored = (options.rules ?? []).filter((rule) => rule.authored);
  const lk = lookup(seed);
  const history = historyOf(input);
  const running = [...seed.monitors, ...authored.filter((rule) => rule.authored?.enabled && !rule.authored.fabric)];
  const { status, episodes } = evaluateMonitors(running, history, now);
  const slots = new Map(seed.monitors.map((monitor, index) => [monitor.id, index]));
  const monitors = new Map(running.map((monitor) => [monitor.id, monitor]));
  const taken = new Set<number>();
  const pageId = (episode: AlertEpisode, monitor: Monitor): number => {
    if (!monitor.authored) return pageIdFor(episode.start, slots.get(monitor.id) ?? 0);
    let slot = AUTHORED_FIRST_SLOT;
    let id = pageIdFor(episode.start, slot);
    while (taken.has(id)) {
      if (slot < AUTHORED_LAST_SLOT) {
        slot += 1;
        id += 1;
      } else {
        slot = AUTHORED_FIRST_SLOT;
        id += 16 - (AUTHORED_LAST_SLOT - AUTHORED_FIRST_SLOT);
      }
    }
    taken.add(id);
    return id;
  };
  const pages = episodes
    .map((episode) => {
      const monitor = monitors.get(episode.monitorId)!;
      return monitor.authored && !monitor.authored.actions.page ? null : pageFromEpisode(episode, monitor, pageId(episode, monitor), now, lk);
    })
    .filter((page): page is Page => page !== null)
    .sort((a, b) => b.triggeredAt - a.triggeredAt || b.id - a.id);
  const times = history.points.map((point) => Date.parse(point.t));
  return manualPages({
    ...seed,
    monitors: [...seed.monitors, ...authored],
    now,
    bucketMinutes: history.bucketMinutes,
    dataFrom: times.length ? Math.min(...times) : now,
    dataTo: times.length ? Math.max(...times) + history.bucketMinutes * MINUTE : now,
    monitorStatus: status,
    episodes,
    pages,
  });
}
