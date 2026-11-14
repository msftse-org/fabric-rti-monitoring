import { DAY, zoned } from './time.ts';
import type { OnCallModel, Page } from './types.ts';

export interface Breakdown {
  key: string;
  pages: number;
  high: number;
  low: number;
  mttaMs: number | null;
  mttrMs: number | null;
}

export interface ResponderLoad {
  userId: string;
  notifications: number;
  offHours: number;
  acknowledgments: number;
}

export interface Analytics {
  from: number;
  to: number;
  pages: number;
  high: number;
  low: number;
  acknowledged: number;
  /** Median minutes-to-acknowledge and minutes-to-resolve, in milliseconds. */
  mttaMs: number | null;
  mttrMs: number | null;
  ackWithin5Pct: number | null;
  escalatedPct: number | null;
  resolvedBy: { monitor: number; user: number; policy: number };
  byDay: { day: number; high: number; low: number }[];
  byTeam: Breakdown[];
  byService: Breakdown[];
  byMonitor: { monitorId: number; pages: number }[];
  responders: ResponderLoad[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const mtta = (pages: Page[]) => median(pages.filter((page) => page.acknowledgedAt !== null).map((page) => page.acknowledgedAt! - page.triggeredAt));
const mttr = (pages: Page[]) => median(pages.filter((page) => page.resolvedAt !== null).map((page) => page.resolvedAt! - page.triggeredAt));

function breakdown(pages: Page[], keyOf: (page: Page) => string | null): Breakdown[] {
  const groups = new Map<string, Page[]>();
  for (const page of pages) {
    const key = keyOf(page);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      pages: items.length,
      high: items.filter((page) => page.urgency === 'high').length,
      low: items.filter((page) => page.urgency === 'low').length,
      mttaMs: mtta(items),
      mttrMs: mttr(items),
    }))
    .sort((a, b) => b.pages - a.pages || a.key.localeCompare(b.key));
}

/** MTTA, MTTR, volume and responder load for pages triggered in `[from, to)`. */
export function computeAnalytics(model: OnCallModel, from = model.now - 7 * DAY, to = model.now): Analytics {
  const pages = model.pages.filter((page) => page.triggeredAt >= from && page.triggeredAt < to);
  const users = new Map(model.users.map((user) => [user.id, user]));
  const acked = pages.filter((page) => page.acknowledgedAt !== null);
  const days = new Map<number, { day: number; high: number; low: number }>();
  for (let day = Math.floor(from / DAY) * DAY; day < to; day += DAY) days.set(day, { day, high: 0, low: 0 });
  for (const page of pages) {
    const bucket = days.get(Math.floor(page.triggeredAt / DAY) * DAY);
    if (bucket) bucket[page.urgency] += 1;
  }
  const load = new Map<string, ResponderLoad>();
  const entry = (userId: string) => {
    let value = load.get(userId);
    if (!value) {
      value = { userId, notifications: 0, offHours: 0, acknowledgments: 0 };
      load.set(userId, value);
    }
    return value;
  };
  for (const page of pages) {
    for (const event of page.events) {
      if (event.kind === 'notified') {
        for (const userId of event.userIds ?? []) {
          const item = entry(userId);
          item.notifications += 1;
          const user = users.get(userId);
          const hour = user ? zoned(event.at, user.timezone).hour : 12;
          if (hour < 8 || hour >= 20) item.offHours += 1;
        }
      }
      if (event.kind === 'acknowledged' && event.actorId) entry(event.actorId).acknowledgments += 1;
    }
  }
  const monitors = new Map<number, number>();
  for (const page of pages) if (page.monitorId !== null) monitors.set(page.monitorId, (monitors.get(page.monitorId) ?? 0) + 1);
  const share = (count: number) => (pages.length ? count / pages.length : null);
  return {
    from,
    to,
    pages: pages.length,
    high: pages.filter((page) => page.urgency === 'high').length,
    low: pages.filter((page) => page.urgency === 'low').length,
    acknowledged: acked.length,
    mttaMs: mtta(pages),
    mttrMs: mttr(pages),
    ackWithin5Pct: acked.length ? acked.filter((page) => page.acknowledgedAt! - page.triggeredAt <= 5 * 60_000).length / acked.length : null,
    escalatedPct: share(pages.filter((page) => page.events.some((event) => event.kind === 'escalated' || event.kind === 'repeated')).length),
    resolvedBy: {
      monitor: pages.filter((page) => page.resolution === 'monitor_recovered').length,
      user: pages.filter((page) => page.resolution === 'manual').length,
      policy: pages.filter((page) => page.resolution === 'policy_exhausted').length,
    },
    byDay: [...days.values()],
    byTeam: breakdown(pages, (page) => page.teamId),
    byService: breakdown(pages, (page) => page.service),
    byMonitor: [...monitors.entries()].map(([monitorId, count]) => ({ monitorId, pages: count })).sort((a, b) => b.pages - a.pages),
    responders: [...load.values()].sort((a, b) => b.notifications - a.notifications),
  };
}
