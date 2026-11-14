import { matchQuery, parseQuery, type MetricPoint, type MetricSeries } from '@telemetry';
import type { ChartSeries, View } from './model';
import { categoricalColor, OUTCOME_COLOR, workloadColor } from './palette';

export type Aggregation = 'sum' | 'avg' | 'min' | 'max';
export type GroupBy = 'none' | 'service' | 'scenario' | 'outcome';

export interface MetricQuery {
  metric: string;
  agg: Aggregation;
  groupBy: GroupBy;
  tokens: string[];
}

export interface MetricSeriesStats {
  min: number;
  avg: number;
  max: number;
  last: number;
}

export interface MetricResult {
  series: (ChartSeries & { stats: MetricSeriesStats })[];
  unit: string;
}

export const GROUP_LABEL: Record<GroupBy, string> = {
  none: 'Nothing',
  service: 'workload',
  scenario: 'scenario',
  outcome: 'outcome',
};

export const AGG_LABEL: Record<Aggregation, string> = { sum: 'sum', avg: 'avg', min: 'min', max: 'max' };

export function aggregationsFor(series: MetricSeries | undefined): Aggregation[] {
  return series?.aggregation === 'sum' ? ['sum', 'max'] : ['avg', 'min', 'max'];
}

export function defaultAggregation(series: MetricSeries | undefined): Aggregation {
  return series?.aggregation === 'sum' ? 'sum' : 'avg';
}

function resolve(point: MetricPoint, key: string): string | undefined {
  switch (key.toLowerCase()) {
    case 'workload':
    case 'service': return point.service;
    case 'scenario': return point.scenario;
    case 'outcome': return point.outcome;
    default: return undefined;
  }
}

const pointKey = (point: MetricPoint) => `${point.t}|${point.service}|${point.scenario}|${point.outcome}`;

interface Accumulator {
  sum: number;
  weight: number;
  count: number;
  min: number;
  max: number;
}

function groupColor(groupBy: GroupBy, key: string, index: number): string {
  if (groupBy === 'service') return workloadColor(key);
  if (groupBy === 'outcome') return OUTCOME_COLOR[key] ?? categoricalColor(index);
  return categoricalColor(index);
}

/** Aggregates one metric per minute. Averages of a gauge are weighted by the request count of the same series. */
export function runMetricQuery(view: View, query: MetricQuery): MetricResult {
  const metric = view.metrics.find((series) => series.name === query.metric);
  if (!metric) return { series: [], unit: '' };
  const parsed = parseQuery(query.tokens.join(' '));
  const weights = new Map<string, number>();
  if (metric.aggregation === 'mean') {
    const requests = view.metrics.find((series) => series.aggregation === 'sum');
    for (const point of requests?.points ?? []) weights.set(pointKey(point), point.value);
  }

  const axisIndex = new Map(view.minuteAxis.map((t, index) => [t, index]));
  const groups = new Map<string, Accumulator[]>();
  for (const point of metric.points) {
    const index = axisIndex.get(Date.parse(point.t));
    if (index === undefined) continue;
    if (!matchQuery(parsed, (key) => resolve(point, key), '')) continue;
    const key = query.groupBy === 'none' ? 'all' : point[query.groupBy];
    let buckets = groups.get(key);
    if (!buckets) {
      buckets = view.minuteAxis.map(() => ({ sum: 0, weight: 0, count: 0, min: Infinity, max: -Infinity }));
      groups.set(key, buckets);
    }
    const bucket = buckets[index];
    const weight = weights.get(pointKey(point)) ?? 1;
    bucket.sum += point.value * weight;
    bucket.weight += weight;
    bucket.count += 1;
    bucket.min = Math.min(bucket.min, point.value);
    bucket.max = Math.max(bucket.max, point.value);
  }

  const reduce = (bucket: Accumulator): number | null => {
    if (bucket.count === 0) return null;
    if (query.agg === 'min') return bucket.min;
    if (query.agg === 'max') return bucket.max;
    if (metric.aggregation === 'sum') return query.agg === 'sum' ? bucket.sum : bucket.sum / bucket.count;
    return bucket.weight > 0 ? bucket.sum / bucket.weight : 0;
  };

  const series = [...groups.entries()]
    .map(([key, buckets]) => {
      const values = buckets.map(reduce);
      const present = values.filter((value): value is number => value !== null);
      const total = present.reduce((a, b) => a + b, 0);
      return {
        key,
        values,
        total,
        stats: {
          min: present.length ? Math.min(...present) : 0,
          max: present.length ? Math.max(...present) : 0,
          avg: present.length ? total / present.length : 0,
          last: present.length ? present[present.length - 1] : 0,
        },
      };
    })
    .sort((a, b) => b.total - a.total)
    .map(({ key, values, stats }, index) => ({
      id: key,
      label: key === 'all' ? metric.name : key,
      color: groupColor(query.groupBy, key, index),
      values,
      stats,
    }));
  return { series, unit: metric.unit };
}
