import { lookup, simulate, stepResponders, nameOf } from './escalation.ts';
import { dateTime } from './format.ts';
import { pageIdFor } from './time.ts';
import type { OnCallModel, Page, PageEvent, UserAction } from './types.ts';

/**
 * Replays what the viewer did (acknowledge, resolve, reassign, snooze, comment, declare
 * an incident, page a team) on top of the simulated model. `clock` is the demo time.
 * Triggered manual pages keep escalating up to the clock, or up to the viewer's first
 * action on them, so an open page moves through its policy while the demo runs.
 */
export function applyActions(model: OnCallModel, actions: UserAction[], clock: number): OnCallModel {
  const advancing = model.pages.filter((page) => page.source === 'manual' && page.status === 'triggered');
  if (!actions.length && (clock <= model.now || !advancing.length)) return model;
  const lk = lookup(model);
  const firstAction = new Map<number, number>();
  for (const action of actions) {
    if (action.kind !== 'manual') firstAction.set(action.pageId, Math.min(firstAction.get(action.pageId) ?? Infinity, action.at));
  }
  const horizon = (pageId: number, from: number) => Math.max(from, Math.min(clock, firstAction.get(pageId) ?? Infinity));
  const pages = new Map(model.pages.map((page) => [page.id, { ...page, events: [...page.events], responderIds: [...page.responderIds] }]));
  const push = (page: Page, event: PageEvent) => page.events.push(event);

  for (const page of advancing) {
    const until = horizon(page.id, model.now);
    const team = lk.teams.get(page.teamId);
    if (until <= model.now || !team) continue;
    const policy = page.policyId ? (lk.policies.get(page.policyId) ?? null) : null;
    const sim = simulate(
      { id: page.id, triggeredAt: page.triggeredAt, urgency: page.urgency, end: null, upgradeAt: null, team, rule: null, policy, ackTimeoutMinutes: null, now: until, respond: false },
      lk,
    );
    const routed = page.events.find((event) => event.kind === 'routed');
    if (routed) sim.events.splice(1, 0, routed);
    pages.set(page.id, { ...page, ...sim });
  }

  for (const action of [...actions].sort((a, b) => a.at - b.at)) {
    if (action.kind === 'manual') {
      const team = lk.teams.get(action.teamId);
      if (!team || pages.has(action.pageId)) continue;
      const policy = lk.policies.get(team.escalationPolicyId) ?? null;
      const sim = simulate(
        { id: action.pageId, triggeredAt: action.at, urgency: action.urgency, end: null, upgradeAt: null, team, rule: null, policy, ackTimeoutMinutes: null, now: horizon(action.pageId, action.at), respond: false },
        lk,
      );
      sim.events.splice(1, 0, { at: action.at, kind: 'routed', actorId: action.by, teamId: team.id, text: `Paged manually by ${nameOf(lk, action.by)}` });
      pages.set(action.pageId, {
        id: action.pageId,
        source: 'manual',
        title: action.title,
        description: action.description,
        teamId: team.id,
        service: null,
        monitorId: null,
        alertStatus: null,
        value: null,
        triggeredAt: action.at,
        ruleId: null,
        policyId: policy?.id ?? null,
        snoozedUntil: null,
        incidentId: null,
        ...sim,
      });
      continue;
    }

    const page = pages.get(action.pageId);
    if (!page) continue;
    switch (action.kind) {
      case 'ack':
        if (page.status !== 'triggered') break;
        Object.assign(page, { status: 'acknowledged', acknowledgedAt: action.at, acknowledgedBy: action.by, currentStep: null, nextEscalationAt: null, snoozedUntil: null });
        push(page, { at: action.at, kind: 'acknowledged', actorId: action.by, text: `Acknowledged by ${nameOf(lk, action.by)}` });
        break;
      case 'resolve':
        if (page.status === 'resolved') break;
        Object.assign(page, { status: 'resolved', resolvedAt: action.at, resolvedBy: action.by, resolution: 'manual', currentStep: null, nextEscalationAt: null, snoozedUntil: null });
        push(page, { at: action.at, kind: 'resolved', actorId: action.by, reason: 'user', text: `Resolved by ${nameOf(lk, action.by)}` });
        break;
      case 'reassign': {
        if (page.status === 'resolved') break;
        const team = action.toTeamId ? lk.teams.get(action.toTeamId) : undefined;
        const policy = team ? lk.policies.get(team.escalationPolicyId) : undefined;
        const userIds = action.toUserId ? [action.toUserId] : policy ? stepResponders(policy.steps[0], action.at, page.id, 0, lk).userIds : [];
        if (team) page.teamId = team.id;
        Object.assign(page, { status: 'triggered', acknowledgedAt: null, acknowledgedBy: null, currentStep: null, nextEscalationAt: null, snoozedUntil: null });
        push(page, {
          at: action.at,
          kind: 'reassigned',
          actorId: action.by,
          teamId: team?.id,
          userIds: action.toUserId ? [action.toUserId] : undefined,
          text: `Reassigned by ${nameOf(lk, action.by)} to ${team ? team.name : nameOf(lk, action.toUserId)}${action.comment ? `: "${action.comment}"` : ''}`,
        });
        if (userIds.length) {
          push(page, { at: action.at, kind: 'notified', userIds, urgency: page.urgency, text: `Notified ${userIds.map((userId) => nameOf(lk, userId)).join(', ')}` });
          userIds.forEach((userId) => page.responderIds.includes(userId) || page.responderIds.push(userId));
        }
        break;
      }
      case 'snooze':
        if (page.status !== 'triggered') break;
        page.snoozedUntil = action.until;
        if (page.nextEscalationAt !== null) page.nextEscalationAt = Math.max(page.nextEscalationAt, action.until);
        push(page, { at: action.at, kind: 'snoozed', actorId: action.by, until: action.until, text: `Snoozed by ${nameOf(lk, action.by)} until ${dateTime(action.until)} UTC` });
        break;
      case 'comment':
        push(page, { at: action.at, kind: 'commented', actorId: action.by, text: action.text });
        break;
      case 'incident':
        page.incidentId = action.incidentId;
        push(page, { at: action.at, kind: 'incident_declared', actorId: action.by, text: `${nameOf(lk, action.by)} declared incident ${action.incidentId}: ${action.title}` });
        break;
    }
  }

  return { ...model, pages: [...pages.values()].sort((a, b) => b.triggeredAt - a.triggeredAt || b.id - a.id) };
}

/** A free page number for a manual page created at `at`. */
export function nextManualPageId(model: OnCallModel, actions: UserAction[], at: number): number {
  const taken = new Set([...model.pages.map((page) => page.id), ...actions.map((action) => action.pageId)]);
  let id = pageIdFor(at, 15);
  while (taken.has(id)) id += 1;
  return id;
}

/** Demo time: the model instant plus the real time elapsed since the page loaded. */
export function createClock(modelNow: number, started = Date.now()): () => number {
  return () => modelNow + (Date.now() - started);
}

export interface ActionStore {
  get: () => UserAction[];
  subscribe: (listener: () => void) => () => void;
  add: (action: UserAction) => void;
  clear: () => void;
}

/** Keeps the viewer's actions in localStorage so they survive a reload; falls back to memory. */
export function createActionStore(key: string): ActionStore {
  const storage = (() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  })();
  let actions: UserAction[] = (() => {
    try {
      const parsed = JSON.parse(storage?.getItem(key) ?? '[]');
      return Array.isArray(parsed) ? (parsed as UserAction[]) : [];
    } catch {
      return [];
    }
  })();
  const listeners = new Set<() => void>();
  const commit = (next: UserAction[]) => {
    actions = next;
    try {
      storage?.setItem(key, JSON.stringify(actions));
    } catch {
      // Storage can be full or blocked in embedded contexts.
    }
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => actions,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add: (action) => commit([...actions, action]),
    clear: () => commit([]),
  };
}
