import { MINUTE } from './time.ts';
import type { AlertEpisode, AlertStatus, Monitor, MonitorPoint, MonitorState, MonitorStatus } from './types.ts';

export interface HistoryPoint {
  t: string;
  service: string;
  requests: number;
  errors: number;
  p95: number;
}

export interface History {
  bucketMinutes: number;
  points: HistoryPoint[];
}

/** Below this many requests in a window an error ratio is noise, so the monitor holds its state. */
const MIN_REQUESTS = 40;
const STATUS_POINTS_MINUTES = 24 * 60;

/** True when `value` has reached `threshold` in the rule's direction. */
export function crosses(monitor: Monitor, value: number, threshold: number): boolean {
  return monitor.comparison === 'below' ? value <= threshold : value >= threshold;
}

function stateFor(monitor: Monitor, value: number): MonitorState {
  if (crosses(monitor, value, monitor.alert)) return 'alert';
  if (monitor.warn !== null && crosses(monitor, value, monitor.warn)) return 'warn';
  return 'ok';
}

function windowValue(monitor: Monitor, window: HistoryPoint[]): number | null {
  const requests = window.reduce((sum, point) => sum + point.requests, 0);
  if (monitor.signal === 'request_rate') return requests / monitor.windowMinutes;
  if (requests < MIN_REQUESTS) return null;
  if (monitor.signal === 'error_rate') return window.reduce((sum, point) => sum + point.errors, 0) / requests;
  return window.reduce((sum, point) => sum + point.p95 * point.requests, 0) / requests;
}

/**
 * Evaluates a service monitor at the end of every bucket. A data gap longer than the window counts as recovery.
 * A request-rate rule also runs on buckets where the service sent nothing, which count as zero requests, as
 * long as other services were reporting; its first full window starts once history does.
 */
function serviceSeries(monitor: Monitor, history: History, now: number): MonitorPoint[] {
  const bucket = history.bucketMinutes * MINUTE;
  const own = history.points.filter((point) => point.service === monitor.service);
  const byTime = new Map(own.map((point) => [Date.parse(point.t), point]));
  const size = Math.max(1, Math.round(monitor.windowMinutes / history.bucketMinutes));
  const rate = monitor.signal === 'request_rate';
  const timeline = rate ? [...new Set(history.points.map((point) => Date.parse(point.t)))].sort((a, b) => a - b) : [...byTime.keys()].sort((a, b) => a - b);
  const first = timeline[0] ?? 0;
  const out: MonitorPoint[] = [];
  let state: MonitorState = 'ok';
  let previous = -Infinity;
  for (const start of timeline) {
    if (rate && start - (size - 1) * bucket < first) continue;
    if (start - previous > monitor.windowMinutes * MINUTE && state !== 'ok') {
      state = 'ok';
      out.push({ t: previous + bucket + monitor.windowMinutes * MINUTE, value: null, state });
    }
    previous = start;
    const window: HistoryPoint[] = [];
    for (let index = 0; index < size; index += 1) {
      const point = byTime.get(start - index * bucket);
      if (point) window.push(point);
    }
    const value = windowValue(monitor, window);
    if (value !== null) state = stateFor(monitor, value);
    out.push({ t: Math.min(start + bucket, now), value, state });
  }
  return out;
}

/**
 * A heartbeat monitor alerts once no bucket has arrived for `alert` minutes, and recovers when data returns.
 * With a service it watches that service only; without one it watches the whole cluster.
 */
/** Every evaluation of a monitor over the whole history, not only the last 24 hours kept in its status. */
export function monitorSeries(monitor: Monitor, history: History, now: number): MonitorPoint[] {
  return (monitor.signal === 'no_data' ? heartbeatSeries(monitor, history, now) : serviceSeries(monitor, history, now)).filter((point) => point.t <= now);
}

function heartbeatSeries(monitor: Monitor, history: History, now: number): MonitorPoint[] {
  const bucket = history.bucketMinutes * MINUTE;
  const own = monitor.service === null ? history.points : history.points.filter((point) => point.service === monitor.service);
  const starts = [...new Set(own.map((point) => Date.parse(point.t)))].sort((a, b) => a - b);
  const silence = monitor.alert * MINUTE;
  const out: MonitorPoint[] = [];
  starts.forEach((start, index) => {
    const end = Math.min(start + bucket, now);
    out.push({ t: end, value: 0, state: 'ok' });
    const next = starts[index + 1] ?? null;
    const lastEnd = start + bucket;
    const resume = next ?? Infinity;
    if (lastEnd + silence <= Math.min(resume, now)) {
      out.push({ t: lastEnd + silence, value: monitor.alert, state: 'no_data' });
      if (next !== null) out.push({ t: next, value: 0, state: 'ok' });
    }
  });
  return out;
}

function episodesFrom(monitor: Monitor, points: MonitorPoint[]): AlertEpisode[] {
  const episodes: AlertEpisode[] = [];
  let open: AlertEpisode | null = null;
  for (const point of points) {
    if (point.state === 'ok') {
      if (open) open.end = point.t;
      open = null;
      continue;
    }
    if (!open) {
      open = { monitorId: monitor.id, start: point.t, end: null, status: point.state as AlertStatus, upgradedAt: null, peak: point.value };
      episodes.push(open);
      continue;
    }
    if (open.status === 'warn' && point.state === 'alert' && open.upgradedAt === null) open.upgradedAt = point.t;
    if (point.value !== null && (open.peak === null || (monitor.comparison === 'below' ? point.value < open.peak : point.value > open.peak))) open.peak = point.value;
  }
  return episodes;
}

export function evaluateMonitors(monitors: Monitor[], history: History, now: number): { status: MonitorStatus[]; episodes: AlertEpisode[] } {
  const status: MonitorStatus[] = [];
  const episodes: AlertEpisode[] = [];
  for (const monitor of monitors) {
    const points = monitorSeries(monitor, history, now);
    episodes.push(...episodesFrom(monitor, points));
    const last = points.at(-1);
    let since = last?.t ?? now;
    for (let index = points.length - 1; index >= 0 && points[index].state === last?.state; index -= 1) since = points[index].t;
    status.push({
      monitorId: monitor.id,
      state: last?.state ?? 'ok',
      since,
      value: [...points].reverse().find((point) => point.value !== null)?.value ?? null,
      points: points.filter((point) => point.t > now - STATUS_POINTS_MINUTES * MINUTE),
    });
  }
  return { status, episodes: episodes.sort((a, b) => a.start - b.start || a.monitorId - b.monitorId) };
}
