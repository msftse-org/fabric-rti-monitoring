import { fractionUnder, APDEX_T_MS, pointApdex, type Windowed } from './derive';
import { MINUTE, type TimeRange } from './time';

export function minuteTimes(range: TimeRange): number[] {
  const times: number[] = [];
  for (let t = range.startMs; t < range.endMs; t += MINUTE) times.push(t);
  return times;
}

export interface ServiceSeries {
  times: number[];
  requests: number[];
  errors: number[];
  successes: number[];
  avg: (number | null)[];
  p50: (number | null)[];
  p95: (number | null)[];
  p99: (number | null)[];
  apdex: (number | null)[];
  errorRate: (number | null)[];
  latencyCompliance: (number | null)[];
}

/** Per-minute series for one service, aligned to the whole-minute buckets of the selected window. */
export function serviceSeries(win: Windowed, range: TimeRange, service: string): ServiceSeries {
  const times = minuteTimes(range);
  const index = new Map(times.map((t, i) => [t, i]));
  const empty = <T,>(value: T) => times.map(() => value);
  const series: ServiceSeries = {
    times,
    requests: empty(0),
    errors: empty(0),
    successes: empty(0),
    avg: empty<number | null>(null),
    p50: empty<number | null>(null),
    p95: empty<number | null>(null),
    p99: empty<number | null>(null),
    apdex: empty<number | null>(null),
    errorRate: empty<number | null>(null),
    latencyCompliance: empty<number | null>(null),
  };
  for (const point of win.servicePoints) {
    if (point.service !== service) continue;
    const i = index.get(Date.parse(point.t));
    if (i === undefined) continue;
    series.requests[i] = point.requests;
    series.errors[i] = point.errors;
    series.successes[i] = point.requests - point.errors;
    series.avg[i] = point.avgMs;
    series.p50[i] = point.p50;
    series.p95[i] = point.p95;
    series.p99[i] = point.p99;
    series.apdex[i] = pointApdex(point);
    series.errorRate[i] = point.requests ? point.errors / point.requests : null;
    series.latencyCompliance[i] = point.requests ? fractionUnder(APDEX_T_MS, point.p50, point.p95, point.p99) : null;
  }
  return series;
}

export interface MetricLine {
  label: string;
  values: (number | null)[];
}

/** Mean of `demo.request.duration` per minute, one line per scenario of the service. */
export function durationByScenario(win: Windowed, times: number[], service: string): MetricLine[] {
  const series = win.metrics.find((metric) => metric.name === 'demo.request.duration');
  if (!series) return [];
  const index = new Map(times.map((t, i) => [t, i]));
  const sums = new Map<string, { total: number[]; count: number[] }>();
  for (const point of series.points) {
    if (point.service !== service) continue;
    const i = index.get(Date.parse(point.t));
    if (i === undefined) continue;
    const entry = sums.get(point.scenario) ?? { total: times.map(() => 0), count: times.map(() => 0) };
    entry.total[i] += point.value;
    entry.count[i] += 1;
    sums.set(point.scenario, entry);
  }
  return [...sums.entries()].map(([label, entry]) => ({
    label,
    values: entry.total.map((total, i) => (entry.count[i] ? total / entry.count[i] : null)),
  }));
}
