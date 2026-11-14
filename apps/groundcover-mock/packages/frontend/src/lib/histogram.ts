import type { LogEntry, Severity } from '@telemetry';
import type { ChartSeries } from './model';
import { SEVERITY_COLOR, SEVERITY_LABEL } from './palette';
import { buildAxis, countByBucket, pickStep } from './series';

const ORDER: Severity[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

export interface Histogram {
  axis: number[];
  step: number;
  series: ChartSeries[];
}

/** Stacked per-severity log counts across [from, to]; severities with no logs are omitted. */
export function logHistogram(logs: readonly LogEntry[], from: number, to: number): Histogram {
  const step = pickStep(Math.max(to - from, 1000), 60);
  const axis = buildAxis(from, to, step);
  const counts = countByBucket(logs, (log) => Date.parse(log.ts), axis, step, (log) => log.severity);
  const series = ORDER.filter((severity) => counts.has(severity)).map((severity) => ({
    id: severity,
    label: SEVERITY_LABEL[severity],
    color: SEVERITY_COLOR[severity],
    values: counts.get(severity) ?? [],
  }));
  return { axis, step, series };
}
