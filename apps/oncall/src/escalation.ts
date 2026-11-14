import { heldUntil } from './routing.ts';
import { onCallAt } from './schedule.ts';
import { MINUTE, unit, zoned } from './time.ts';
import type { Channel, EscalationPolicy, EscalationStep, OnCallSeed, Page, PageEvent, RoutingRule, Schedule, Team, Urgency, User } from './types.ts';

export interface Lookup {
  users: Map<string, User>;
  teams: Map<string, Team>;
  schedules: Map<string, Schedule>;
  policies: Map<string, EscalationPolicy>;
}

export function lookup(seed: OnCallSeed): Lookup {
  return {
    users: new Map(seed.users.map((item) => [item.id, item])),
    teams: new Map(seed.teams.map((item) => [item.id, item])),
    schedules: new Map(seed.schedules.map((item) => [item.id, item])),
    policies: new Map(seed.policies.map((item) => [item.id, item])),
  };
}

/** A person's name; `null` actors are the platform itself, which each UI labels in its own vocabulary. */
export const nameOf = (lk: Lookup, userId: string | null | undefined) => (userId ? lk.users.get(userId)?.name ?? userId : 'System');

export function channelsFor(user: User | undefined, urgency: Urgency): Channel[] {
  return [...new Set((user?.preferences[urgency] ?? []).map((rule) => rule.channel))];
}

/** Resolves a step's targets at `t`; schedules with nobody on call are reported so the timeline can say so. */
export function stepResponders(step: EscalationStep, t: number, pageId: number, cycle: number, lk: Lookup): { userIds: string[]; skipped: string[] } {
  const candidates: string[] = [];
  const skipped: string[] = [];
  for (const target of step.targets) {
    if (target.kind === 'user') candidates.push(target.id);
    else if (target.kind === 'team') candidates.push(...(lk.teams.get(target.id)?.memberIds ?? []));
    else {
      const schedule = lk.schedules.get(target.id);
      const userId = schedule ? onCallAt(schedule, t) : null;
      if (userId) candidates.push(userId);
      else skipped.push(target.id);
    }
  }
  const unique = [...new Set(candidates)];
  if (step.assignment === 'round-robin' && unique.length) return { userIds: [unique[(pageId + cycle) % unique.length]], skipped };
  return { userIds: unique, skipped };
}

/** Minutes until a responder acknowledges, or null when they miss it. Deterministic per page, person and pass. */
function responseMinutes(pageId: number, user: User | undefined, cycle: number, step: number, urgency: Urgency, t: number): number | null {
  if (!user) return null;
  const key = `${pageId}:${user.id}:${cycle}:${step}`;
  const night = (() => {
    const { hour } = zoned(t, user.timezone);
    return hour < 7 || hour >= 23;
  })();
  const chance = urgency === 'high' ? (night ? 0.55 : 0.72) : 0.45;
  if (unit(`${key}:answers`) >= chance) return null;
  const spread = unit(`${key}:delay`);
  return urgency === 'high' ? 1 + spread * 4 + (night ? 3 : 0) : 4 + spread * 26;
}

export interface SimulationInput {
  id: number;
  triggeredAt: number;
  urgency: Urgency;
  /** When the triggering monitor recovered, if it has. */
  end: number | null;
  /** A warn episode crossing the alert threshold under dynamic urgency. */
  upgradeAt: number | null;
  team: Team;
  rule: RoutingRule | null;
  policy: EscalationPolicy | null;
  ackTimeoutMinutes: number | null;
  now: number;
  /** Simulated responders acknowledge on their own; off for pages the viewer creates. */
  respond?: boolean;
}

type SimPage = Pick<
  Page,
  | 'status'
  | 'urgency'
  | 'acknowledgedAt'
  | 'acknowledgedBy'
  | 'resolvedAt'
  | 'resolvedBy'
  | 'resolution'
  | 'responderIds'
  | 'currentStep'
  | 'nextEscalationAt'
  | 'heldUntil'
  | 'events'
>;

interface Cursor {
  t: number;
  step: number;
  cycle: number;
}

/**
 * Walks a page through its escalation policy the way Datadog On-Call does: notify the
 * step's targets, wait for an acknowledgment, escalate, repeat, and optionally resolve
 * once every pass is exhausted. Everything after `now` is left out.
 */
export function simulate(input: SimulationInput, lk: Lookup): SimPage {
  const { id, triggeredAt, team, rule, policy, now } = input;
  const end = input.end;
  const stopAt = Math.min(end ?? Infinity, now);
  const events: PageEvent[] = [];
  const responders = new Set<string>();
  let urgency = input.urgency;
  let ack: { at: number; by: string; step: number; cycle: number } | null = null;
  let resolved: { at: number; by: string | null; how: NonNullable<Page['resolution']> } | null = null;
  let waiting: { step: number; next: number } | null = null;

  events.push({ at: triggeredAt, kind: 'triggered', teamId: team.id, urgency, text: `Page triggered for team ${team.name}` });
  if (rule) {
    events.push({ at: triggeredAt, kind: 'routed', teamId: team.id, urgency, text: `Routed by ${team.name} rule ${rule.id}` });
    for (const action of rule.actions) {
      if (action.kind === 'message') events.push({ at: triggeredAt, kind: 'message_sent', teamId: team.id, text: `Posted to #${action.channel}` });
    }
  }

  const hold = rule ? heldUntil(rule, triggeredAt) : null;
  if (hold !== null) events.push({ at: triggeredAt, kind: 'held', text: 'Outside support hours: notifications held until the next window' });
  const start = hold ?? triggeredAt;

  const run = (from: Cursor): void => {
    if (!policy) return;
    let cursor = from;
    while (cursor.t < stopAt) {
      const step = policy.steps[cursor.step];
      const { userIds, skipped } = stepResponders(step, cursor.t, id, cursor.cycle, lk);
      for (const scheduleId of skipped) {
        events.push({ at: cursor.t, kind: 'skipped', scheduleId, stepIndex: cursor.step, cycle: cursor.cycle, text: 'Nobody on call in schedule; target skipped' });
      }
      if (userIds.length) {
        events.push({ at: cursor.t, kind: 'notified', userIds, stepIndex: cursor.step, cycle: cursor.cycle, urgency, text: `Notified ${userIds.map((userId) => nameOf(lk, userId)).join(', ')}` });
        userIds.forEach((userId) => responders.add(userId));
      }
      const deadline = cursor.t + step.escalateAfterMinutes * MINUTE;
      let best: { at: number; by: string } | null = null;
      for (const userId of input.respond === false ? [] : userIds) {
        const minutes = responseMinutes(id, lk.users.get(userId), cursor.cycle, cursor.step, urgency, cursor.t);
        if (minutes === null) continue;
        const at = Math.round((cursor.t + minutes * MINUTE) / 1000) * 1000;
        if (!best || at < best.at) best = { at, by: userId };
      }
      if (best && best.at < Math.min(deadline, stopAt)) {
        ack = { ...best, step: cursor.step, cycle: cursor.cycle };
        events.push({ at: best.at, kind: 'acknowledged', actorId: best.by, stepIndex: cursor.step, text: `Acknowledged by ${nameOf(lk, best.by)}` });
        return;
      }
      if (deadline >= stopAt) {
        if (end === null || end > now) waiting = { step: cursor.step, next: deadline };
        return;
      }
      let next = cursor.step + 1;
      let cycle = cursor.cycle;
      if (next >= policy.steps.length) {
        if (cycle >= policy.repeat) {
          if (policy.resolveAfterExhausted) {
            resolved = { at: deadline, by: null, how: 'policy_exhausted' };
            events.push({ at: deadline, kind: 'resolved', reason: 'policy', text: 'Resolved automatically after every escalation step and repeat ran without an acknowledgment' });
          }
          return;
        }
        cycle += 1;
        next = 0;
        events.push({ at: deadline, kind: 'repeated', cycle, text: `Nobody acknowledged; repeating the policy (pass ${cycle + 1} of ${policy.repeat + 1})` });
      } else {
        events.push({ at: deadline, kind: 'escalated', stepIndex: next, cycle, text: `Nobody acknowledged within ${step.escalateAfterMinutes} minutes; escalated to step ${next + 1}` });
      }
      cursor = { t: deadline, step: next, cycle };
    }
  };

  run({ t: start, step: 0, cycle: 0 });

  if (input.upgradeAt !== null && urgency === 'low' && input.upgradeAt <= stopAt) {
    urgency = 'high';
    events.push({ at: input.upgradeAt, kind: 'urgency_changed', urgency, text: 'Monitor moved from WARN to ALERT; urgency raised to HIGH' });
  }

  const acked = ack as { at: number; by: string; step: number; cycle: number } | null;
  if (acked && !resolved) {
    const roll = unit(`${id}:manual-resolve`);
    const manualAt = acked.at + Math.round(6 + roll * 50) * MINUTE;
    const timeoutAt = input.ackTimeoutMinutes ? acked.at + input.ackTimeoutMinutes * MINUTE : Infinity;
    if (roll < 0.5 && manualAt < Math.min(stopAt, timeoutAt)) {
      resolved = { at: manualAt, by: acked.by, how: 'manual' };
      events.push({ at: manualAt, kind: 'resolved', actorId: acked.by, reason: 'user', text: `Resolved by ${nameOf(lk, acked.by)}` });
    } else if (timeoutAt < stopAt && policy) {
      events.push({ at: timeoutAt, kind: 'ack_timeout', text: `Not resolved ${input.ackTimeoutMinutes} minutes after acknowledgment; page re-triggered` });
      ack = null;
      const step = Math.min(acked.step + 1, policy.steps.length - 1);
      run({ t: timeoutAt, step, cycle: acked.cycle });
    }
  }

  if (!resolved && end !== null && end <= now) {
    resolved = { at: end, by: null, how: 'monitor_recovered' };
    events.push({ at: end, kind: 'resolved', reason: 'monitor', text: 'Monitor recovered; page resolved automatically' });
  }

  const finalAck = ack as { at: number; by: string } | null;
  const done = resolved as { at: number; by: string | null; how: NonNullable<Page['resolution']> } | null;
  const open = waiting as { step: number; next: number } | null;
  const visible = events.filter((event) => event.at <= now).sort((a, b) => a.at - b.at);
  return {
    status: done ? 'resolved' : finalAck ? 'acknowledged' : 'triggered',
    urgency,
    acknowledgedAt: finalAck?.at ?? null,
    acknowledgedBy: finalAck?.by ?? null,
    resolvedAt: done?.at ?? null,
    resolvedBy: done?.by ?? null,
    resolution: done?.how ?? null,
    responderIds: [...responders],
    currentStep: !done && !finalAck && open ? open.step : null,
    nextEscalationAt: !done && !finalAck && open ? open.next : null,
    heldUntil: hold,
    events: visible,
  };
}
