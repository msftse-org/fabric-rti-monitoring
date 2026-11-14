import { windowBundle, type LogEntry, type MetricSeries, type ServicePoint, type TelemetryBundle, type TraceSummary } from '@telemetry';
import { MINUTE } from './time';

export interface LogRow extends LogEntry {
  ms: number;
}
export interface TraceRow extends TraceSummary {
  ms: number;
}
export interface PointRow extends ServicePoint {
  ms: number;
}

export interface WindowedData {
  /** Requested window, `since` inclusive and `until` exclusive. */
  since: number;
  until: number;
  /** First instant that can contain data; charts start here so a 1h window does not render empty space. */
  start: number;
  newest: number;
  logs: LogRow[];
  traces: TraceRow[];
  points: PointRow[];
  metrics: MetricSeries[];
}

/** Narrows the bundle to `minutes`, optionally stepped back by `shift` whole windows. */
export function buildWindow(bundle: TelemetryBundle, minutes: number, shift: number): WindowedData {
  const base = windowBundle(bundle, minutes * (shift + 1));
  const until = base.newest - shift * minutes * MINUTE;
  const since = until - minutes * MINUTE;
  const first = Date.parse(bundle.environment.firstSeen);
  const logs: LogRow[] = [];
  for (const log of base.logs) {
    const ms = Date.parse(log.ts);
    if (ms <= until) logs.push({ ...log, ms });
  }
  const traces: TraceRow[] = [];
  for (const trace of base.traces) {
    const ms = Date.parse(trace.start);
    if (ms <= until) traces.push({ ...trace, ms });
  }
  const points: PointRow[] = [];
  for (const point of base.servicePoints) {
    const ms = Date.parse(point.t);
    if (ms < until) points.push({ ...point, ms });
  }
  const metrics = base.metrics.map((series) => ({ ...series, points: series.points.filter((point) => Date.parse(point.t) < until) }));
  return {
    since,
    until,
    start: Math.max(since, Math.floor(first / MINUTE) * MINUTE),
    newest: base.newest,
    logs,
    traces,
    points,
    metrics,
  };
}
