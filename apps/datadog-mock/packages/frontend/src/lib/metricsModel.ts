import { parseQuery, matchQuery, type MetricSeries } from '@telemetry';
import { bucketOf, type TimeGrid } from './time';

export type Aggregator = 'avg' | 'sum' | 'min' | 'max';

export interface MetricQuery {
  id: string;
  metric: string;
  from: string;
  agg: Aggregator;
  by: string[];
}

export const METRIC_TAGS = ['service', 'scenario', 'outcome', 'pod'] as const;
export const AGGREGATORS: Aggregator[] = ['avg', 'sum', 'min', 'max'];

export interface EvaluatedSeries {
  key: string;
  label: string;
  values: (number | null)[];
  avg: number;
  min: number;
  max: number;
  sum: number;
  last: number;
}

export interface EvaluatedQuery {
  query: MetricQuery;
  unit: string;
  description: string;
  series: EvaluatedSeries[];
  error: string | null;
}

const aggregate = (agg: Aggregator, values: number[]): number => {
  switch (agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return values.reduce((a, b) => a + b, 0) / values.length;
  }
};

export function evaluateQuery(query: MetricQuery, metrics: MetricSeries[], grid: TimeGrid, podByService: Record<string, string>): EvaluatedQuery {
  const metric = metrics.find((candidate) => candidate.name === query.metric);
  if (!metric) {
    return { query, unit: '', description: '', series: [], error: query.metric ? `Unknown metric "${query.metric}"` : 'Choose a metric' };
  }
  const filter = parseQuery(query.from);
  const groups = new Map<string, number[][]>();
  for (const point of metric.points) {
    const tags: Record<string, string> = { service: point.service, scenario: point.scenario, outcome: point.outcome, pod: podByService[point.service] ?? '' };
    if (!matchQuery(filter, (key) => tags[key.toLowerCase()], '')) continue;
    const bucket = bucketOf(grid, Date.parse(point.t));
    if (bucket < 0 || bucket >= grid.count) continue;
    const label = query.by.length ? query.by.map((tag) => `${tag}:${tags[tag]}`).join(',') : '*';
    const rows = groups.get(label) ?? Array.from({ length: grid.count }, () => [] as number[]);
    rows[bucket].push(point.value);
    groups.set(label, rows);
  }
  const series: EvaluatedSeries[] = [...groups.entries()]
    .map(([label, buckets]) => {
      const values = buckets.map((bucket) => (bucket.length ? aggregate(query.agg, bucket) : null));
      const present = values.filter((value): value is number => value !== null);
      const sum = present.reduce((a, b) => a + b, 0);
      return {
        key: label,
        label,
        values,
        avg: present.length ? sum / present.length : 0,
        min: present.length ? Math.min(...present) : 0,
        max: present.length ? Math.max(...present) : 0,
        sum,
        last: present.length ? present[present.length - 1] : 0,
      };
    })
    .sort((a, b) => b.avg - a.avg);
  return { query, unit: metric.unit, description: metric.description, series, error: null };
}

export function unitLabel(unit: string): string {
  return unit === '{request}' ? 'requests' : unit;
}
