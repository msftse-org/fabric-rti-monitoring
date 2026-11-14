import { formatCount, formatDuration, formatPercent } from '@telemetry';
import type { RankMetric, SeriesMetric, StatMetric } from './dashboards';
import type { ChartSeries, Health, View, Workload } from './model';
import { workloadColor } from './palette';
import { sum } from './series';

export function pickWorkloads(view: View, names: readonly string[]): Workload[] {
  return view.workloads.filter((workload) => names.includes(workload.name));
}

const seriesValue: Record<SeriesMetric, (point: Workload['series'][number]) => number | null> = {
  requests: (point) => point.requests,
  errors: (point) => point.errors,
  errorRate: (point) => (point.requests > 0 ? (point.errors / point.requests) * 100 : null),
  p50: (point) => (point.requests > 0 ? point.p50 : null),
  p95: (point) => (point.requests > 0 ? point.p95 : null),
  p99: (point) => (point.requests > 0 ? point.p99 : null),
};

export function workloadSeries(workloads: readonly Workload[], metric: SeriesMetric): ChartSeries[] {
  return workloads.map((workload) => ({
    id: workload.name,
    label: workload.name,
    color: workloadColor(workload.name),
    values: workload.series.map(seriesValue[metric]),
  }));
}

export const SERIES_FORMAT: Record<SeriesMetric, { value: (n: number) => string; tick: (n: number) => string }> = {
  requests: { value: formatCount, tick: formatCount },
  errors: { value: formatCount, tick: formatCount },
  errorRate: { value: (n) => `${n.toFixed(1)}%`, tick: (n) => `${n}%` },
  p50: { value: formatDuration, tick: formatDuration },
  p95: { value: formatDuration, tick: formatDuration },
  p99: { value: formatDuration, tick: formatDuration },
};

export interface StatResult {
  text: string;
  caption: string;
  tone?: Health;
}

export function workloadStat(view: View, workloads: readonly Workload[], metric: StatMetric): StatResult {
  const requests = sum(workloads.map((workload) => workload.requests));
  const errors = sum(workloads.map((workload) => workload.errors));
  switch (metric) {
    case 'rps': return { text: (requests / view.spanSeconds).toFixed(1), caption: 'summed over workloads' };
    case 'requests': return { text: formatCount(requests), caption: 'server spans' };
    case 'errors': return { text: formatCount(errors), caption: 'failed server spans' };
    case 'errorRate': {
      const rate = requests > 0 ? errors / requests : 0;
      return { text: formatPercent(rate, 1), caption: `${formatCount(errors)} of ${formatCount(requests)}`, tone: rate >= 0.1 ? 'critical' : rate >= 0.05 ? 'degraded' : 'healthy' };
    }
    case 'p95': {
      const top = [...workloads].sort((a, b) => b.p95 - a.p95)[0];
      return { text: top ? formatDuration(top.p95) : '–', caption: top ? top.name : 'no data' };
    }
    case 'logs': return { text: formatCount(sum(workloads.map((workload) => workload.logs))), caption: 'log lines in range' };
    case 'errorLogs': return { text: formatCount(sum(workloads.map((workload) => workload.errorLogs))), caption: 'ERROR lines in range' };
    case 'issues': {
      const count = sum(workloads.map((workload) => workload.issues.length));
      return { text: String(count), caption: 'derived from error rate and p95', tone: count > 0 ? 'critical' : 'healthy' };
    }
  }
}

export interface RankRow {
  name: string;
  value: number;
  text: string;
}

export function rankWorkloads(workloads: readonly Workload[], metric: RankMetric): RankRow[] {
  const value: Record<RankMetric, (workload: Workload) => number> = {
    requests: (workload) => workload.requests,
    errors: (workload) => workload.errors,
    errorRate: (workload) => workload.errorRate,
    p95: (workload) => workload.p95,
  };
  const text: Record<RankMetric, (n: number) => string> = {
    requests: formatCount,
    errors: formatCount,
    errorRate: (n) => formatPercent(n, 1),
    p95: formatDuration,
  };
  return workloads
    .map((workload) => ({ name: workload.name, value: value[metric](workload), text: text[metric](value[metric](workload)) }))
    .sort((a, b) => b.value - a.value);
}

/** Windowed `demo.requests` / `demo.request.duration` at the entry workload for one scenario. */
export function scenarioStat(view: View, scenario: string, stat: 'requests' | 'errorRate' | 'avgMs'): StatResult {
  const entries = new Set(view.workloads.filter((workload) => workload.dependedOnBy.length === 0).map((workload) => workload.name));
  const counter = view.metrics.find((series) => series.aggregation === 'sum');
  const duration = view.metrics.find((series) => series.aggregation === 'mean');
  const rows = (counter?.points ?? []).filter((point) => entries.has(point.service) && point.scenario === scenario);
  const total = sum(rows.map((point) => point.value));
  const failed = sum(rows.filter((point) => point.outcome === 'error').map((point) => point.value));
  if (stat === 'requests') return { text: formatCount(total), caption: `scenario ${scenario}` };
  if (stat === 'errorRate') {
    const rate = total > 0 ? failed / total : 0;
    return { text: formatPercent(rate, 1), caption: `${formatCount(failed)} failed`, tone: rate >= 0.1 ? 'critical' : rate >= 0.05 ? 'degraded' : 'healthy' };
  }
  const weights = new Map(rows.map((point) => [`${point.t}|${point.outcome}`, point.value]));
  let weighted = 0;
  let weight = 0;
  for (const point of duration?.points ?? []) {
    if (!entries.has(point.service) || point.scenario !== scenario) continue;
    const w = weights.get(`${point.t}|${point.outcome}`) ?? 1;
    weighted += point.value * w;
    weight += w;
  }
  return { text: weight > 0 ? formatDuration(weighted / weight) : '–', caption: 'request-weighted mean' };
}

/** Requests per hop for the checkout scenario, in call-chain order. */
export function funnel(view: View): RankRow[] {
  const entry = view.workloads.find((workload) => workload.dependedOnBy.length === 0);
  const chain: Workload[] = [];
  let current = entry;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = view.workloadByName.get(current.dependsOn.find((name) => view.workloadByName.has(name)) ?? '');
  }
  const counters = view.metrics.find((series) => series.aggregation === 'sum')?.points ?? [];
  return chain.map((workload) => {
    const total = sum(counters.filter((point) => point.service === workload.name && point.scenario === 'checkout').map((point) => point.value));
    return { name: workload.name, value: total, text: formatCount(total) };
  });
}
