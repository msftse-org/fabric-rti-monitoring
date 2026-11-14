import { ERROR_SHADES } from './palette';
import { buildAxis, bucketOf, pickStep, quantile } from './series';
import type { ChartSeries } from './model';

export interface TimedRow {
  time: number;
  durationMs: number;
  failed: boolean;
  group: string;
}

export interface TraceCharts {
  axis: number[];
  step: number;
  requests: ChartSeries[];
  errors: ChartSeries[];
  latency: ChartSeries[];
}

/** Buckets rows into the three mini charts shown above the Traces table. */
export function buildTraceCharts(rows: readonly TimedRow[], from: number, to: number): TraceCharts {
  const step = pickStep(Math.max(to - from, 1000), 40);
  const axis = buildAxis(from, to, step);
  const requests = new Array<number>(axis.length).fill(0);
  const failures = new Map<string, number[]>();
  const durations: number[][] = axis.map(() => []);
  for (const row of rows) {
    const index = bucketOf(row.time, axis[0], step, axis.length);
    requests[index] += 1;
    durations[index].push(row.durationMs);
    if (row.failed) {
      let counts = failures.get(row.group);
      if (!counts) {
        counts = new Array<number>(axis.length).fill(0);
        failures.set(row.group, counts);
      }
      counts[index] += 1;
    }
  }
  const sorted = durations.map((values) => values.sort((a, b) => a - b));
  const percentile = (q: number) => sorted.map((values) => (values.length ? quantile(values, q) : null));
  return {
    axis,
    step,
    requests: [{ id: 'all', label: 'All requests', color: '#2b8cf7', values: requests }],
    errors: [...failures.entries()].map(([group, values], index) => ({ id: group, label: group, color: ERROR_SHADES[index % ERROR_SHADES.length], values })),
    latency: [
      { id: 'p50', label: 'P50', color: '#12306b', values: percentile(0.5) },
      { id: 'p95', label: 'P95', color: '#f0a30a', values: percentile(0.95) },
    ],
  };
}
