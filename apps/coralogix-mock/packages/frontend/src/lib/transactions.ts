import type { Windowed } from './derive';

export interface TransactionRow {
  scenario: string;
  requests: number;
  errors: number;
  errorRate: number;
  avgMs: number;
}

/** Per-scenario request counts and mean duration of one service, from the `demo.requests` and `demo.request.duration` metrics. */
export function transactionsFor(win: Windowed, service: string): TransactionRow[] {
  const requests = win.metrics.find((metric) => metric.name === 'demo.requests');
  const durations = win.metrics.find((metric) => metric.name === 'demo.request.duration');
  if (!requests) return [];

  const durationAt = new Map<string, number>();
  for (const point of durations?.points ?? []) {
    if (point.service === service) durationAt.set(`${point.t}|${point.scenario}|${point.outcome}`, point.value);
  }

  const rows = new Map<string, { requests: number; errors: number; weightedMs: number; weight: number }>();
  for (const point of requests.points) {
    if (point.service !== service) continue;
    const row = rows.get(point.scenario) ?? { requests: 0, errors: 0, weightedMs: 0, weight: 0 };
    row.requests += point.value;
    if (point.outcome === 'error') row.errors += point.value;
    const duration = durationAt.get(`${point.t}|${point.scenario}|${point.outcome}`);
    if (duration !== undefined) {
      row.weightedMs += duration * point.value;
      row.weight += point.value;
    }
    rows.set(point.scenario, row);
  }

  return [...rows.entries()].map(([scenario, row]) => ({
    scenario,
    requests: row.requests,
    errors: row.errors,
    errorRate: row.requests ? row.errors / row.requests : 0,
    avgMs: row.weight ? row.weightedMs / row.weight : 0,
  }));
}
