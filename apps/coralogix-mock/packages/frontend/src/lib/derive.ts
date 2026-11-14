import type { DependencyEdge, ServicePoint, ServiceSummary, TelemetryBundle, windowBundle } from '@telemetry';
import { MINUTE } from './time';

export type Windowed = ReturnType<typeof windowBundle>;
export type Health = 'Critical' | 'Warning' | 'Healthy';

/** Apdex tolerating threshold. A request is satisfied under T, tolerating under 4T, frustrated above or on error. */
export const APDEX_T_MS = 500;
export const SLO_AVAILABILITY_TARGET = 0.99;
export const SLO_LATENCY_TARGET = 0.95;
const CRITICAL_ERROR_RATE = 0.05;
const WARNING_ERROR_RATE = 0.01;
const CRITICAL_P95_MS = 1000;

export interface SloResult {
  id: 'availability' | 'latency';
  name: string;
  description: string;
  target: number;
  compliance: number;
  /** 1 means untouched, 0 fully consumed, negative means overspent. */
  budgetRemaining: number;
  burnRate: number;
  breached: boolean;
}

export interface ServiceStats {
  name: string;
  summary: ServiceSummary;
  requests: number;
  errors: number;
  errorRate: number;
  rps: number;
  rpm: number;
  errorsPerSec: number;
  outgoingCallsPerSec: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  apdex: number;
  slos: SloResult[];
  sloOk: number;
  sloBreached: number;
  health: Health;
  incidents: number;
  active: boolean;
  lastSeenMs: number;
  logs: number;
  errorLogs: number;
}

export interface EdgeStats extends DependencyEdge {
  errorRate: number;
}

export interface DatabaseStats {
  name: string;
  callers: string[];
  calls: number;
  errors: number;
  errorRate: number;
  avgMs: number;
  p95: number;
  health: Health;
}

export interface Derived {
  services: ServiceStats[];
  byName: Map<string, ServiceStats>;
  edges: EdgeStats[];
  databases: DatabaseStats[];
  elapsedSeconds: number;
}

/** Share of requests faster than `thresholdMs`, read off a piecewise-linear CDF through p50, p95 and p99. */
export function fractionUnder(thresholdMs: number, p50: number, p95: number, p99: number): number {
  const knots: [number, number][] = [
    [0, 0],
    [p50, 0.5],
    [Math.max(p95, p50), 0.95],
    [Math.max(p99, p95, p50), 0.99],
    [Math.max(p99, p95, p50) * 1.25 + 1, 1],
  ];
  if (thresholdMs <= 0) return 0;
  for (let i = 1; i < knots.length; i += 1) {
    const [x0, y0] = knots[i - 1];
    const [x1, y1] = knots[i];
    if (thresholdMs <= x1) return x1 === x0 ? y1 : y0 + ((thresholdMs - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}

export function pointApdex(point: Pick<ServicePoint, 'requests' | 'errors' | 'p50' | 'p95' | 'p99'>): number {
  if (point.requests === 0) return 1;
  const satisfied = fractionUnder(APDEX_T_MS, point.p50, point.p95, point.p99);
  const tolerated = fractionUnder(APDEX_T_MS * 4, point.p50, point.p95, point.p99) - satisfied;
  const errorRate = point.errors / point.requests;
  return Math.max(0, Math.min(1, (satisfied + tolerated / 2) * (1 - errorRate)));
}

export function healthOf(errorRate: number, p95: number): Health {
  if (errorRate >= CRITICAL_ERROR_RATE || p95 >= CRITICAL_P95_MS) return 'Critical';
  if (errorRate >= WARNING_ERROR_RATE || p95 >= APDEX_T_MS) return 'Warning';
  return 'Healthy';
}

export function sloBurn(errorRate: number): number {
  return errorRate / (1 - SLO_AVAILABILITY_TARGET);
}

const HEALTH_RANK: Record<Health, number> = { Critical: 0, Warning: 1, Healthy: 2 };
export const healthRank = (health: Health) => HEALTH_RANK[health];

function weighted(points: ServicePoint[], pick: (point: ServicePoint) => number): number {
  const total = points.reduce((sum, point) => sum + point.requests, 0);
  if (total === 0) return 0;
  return points.reduce((sum, point) => sum + pick(point) * point.requests, 0) / total;
}

function buildSlos(errorRate: number, requests: number, latencyCompliance: number): SloResult[] {
  const availability = 1 - errorRate;
  const allowedErrors = requests * (1 - SLO_AVAILABILITY_TARGET);
  const consumed = allowedErrors > 0 ? (requests * errorRate) / allowedErrors : 0;
  const latencyBudget = 1 - SLO_LATENCY_TARGET;
  return [
    {
      id: 'availability',
      name: 'Availability',
      description: `${(SLO_AVAILABILITY_TARGET * 100).toFixed(0)}% of requests succeed`,
      target: SLO_AVAILABILITY_TARGET,
      compliance: availability,
      budgetRemaining: 1 - consumed,
      burnRate: sloBurn(errorRate),
      breached: availability < SLO_AVAILABILITY_TARGET,
    },
    {
      id: 'latency',
      name: 'Latency',
      description: `${(SLO_LATENCY_TARGET * 100).toFixed(0)}% of requests finish under ${APDEX_T_MS}ms`,
      target: SLO_LATENCY_TARGET,
      compliance: latencyCompliance,
      budgetRemaining: 1 - (1 - latencyCompliance) / latencyBudget,
      burnRate: (1 - latencyCompliance) / latencyBudget,
      breached: latencyCompliance < SLO_LATENCY_TARGET,
    },
  ];
}

export function derive(bundle: TelemetryBundle, win: Windowed, firstSeenMs: number): Derived {
  const elapsedSeconds = Math.max(MINUTE, win.newest - Math.max(win.since, firstSeenMs)) / 1000;

  const logCounts = new Map<string, { logs: number; errors: number }>();
  for (const log of win.logs) {
    const entry = logCounts.get(log.service) ?? { logs: 0, errors: 0 };
    entry.logs += 1;
    if (log.severity === 'ERROR' || log.severity === 'FATAL') entry.errors += 1;
    logCounts.set(log.service, entry);
  }

  const pointsByService = new Map<string, ServicePoint[]>();
  for (const point of win.servicePoints) {
    const list = pointsByService.get(point.service);
    if (list) list.push(point);
    else pointsByService.set(point.service, [point]);
  }

  const ratio = new Map<string, number>();
  const stats = bundle.services.map<ServiceStats>((summary) => {
    const points = pointsByService.get(summary.name) ?? [];
    const requests = points.reduce((sum, point) => sum + point.requests, 0);
    const errors = points.reduce((sum, point) => sum + point.errors, 0);
    const errorRate = requests ? errors / requests : 0;
    const p50 = weighted(points, (point) => point.p50);
    const p95 = weighted(points, (point) => point.p95);
    const p99 = weighted(points, (point) => point.p99);
    const latencyCompliance = requests ? weighted(points, (point) => fractionUnder(APDEX_T_MS, point.p50, point.p95, point.p99)) : 1;
    const slos = buildSlos(errorRate, requests, latencyCompliance);
    const sloBreached = slos.filter((slo) => slo.breached).length;
    const counts = logCounts.get(summary.name) ?? { logs: 0, errors: 0 };
    ratio.set(summary.name, summary.requests ? requests / summary.requests : 0);
    const lastSeenMs = Date.parse(summary.lastSeen);
    return {
      name: summary.name,
      summary,
      requests,
      errors,
      errorRate,
      rps: requests / elapsedSeconds,
      rpm: (requests / elapsedSeconds) * 60,
      errorsPerSec: errors / elapsedSeconds,
      outgoingCallsPerSec: 0,
      avgMs: weighted(points, (point) => point.avgMs),
      p50,
      p95,
      p99,
      apdex: requests ? weighted(points, pointApdex) : 1,
      slos,
      sloOk: slos.length - sloBreached,
      sloBreached,
      health: healthOf(errorRate, p95),
      incidents: sloBreached,
      active: lastSeenMs >= win.since,
      lastSeenMs,
      logs: counts.logs,
      errorLogs: counts.errors,
    };
  });

  const edges = bundle.edges.map<EdgeStats>((edge) => {
    const scale = ratio.get(edge.kind === 'database' ? edge.from : edge.to) ?? 1;
    const calls = Math.round(edge.calls * scale);
    const errors = Math.round(edge.errors * scale);
    return { ...edge, calls, errors, errorRate: calls ? errors / calls : 0 };
  });

  for (const service of stats) {
    service.outgoingCallsPerSec = edges.filter((edge) => edge.from === service.name).reduce((sum, edge) => sum + edge.calls, 0) / elapsedSeconds;
  }

  const databases = [...new Set(edges.filter((edge) => edge.kind === 'database').map((edge) => edge.to))].map<DatabaseStats>((name) => {
    const own = edges.filter((edge) => edge.kind === 'database' && edge.to === name);
    const calls = own.reduce((sum, edge) => sum + edge.calls, 0);
    const errors = own.reduce((sum, edge) => sum + edge.errors, 0);
    const errorRate = calls ? errors / calls : 0;
    const avgMs = calls ? own.reduce((sum, edge) => sum + edge.avgMs * edge.calls, 0) / calls : 0;
    const p95 = Math.max(0, ...own.map((edge) => edge.p95));
    return { name, callers: own.map((edge) => edge.from), calls, errors, errorRate, avgMs, p95, health: healthOf(errorRate, p95) };
  });

  return { services: stats, byName: new Map(stats.map((service) => [service.name, service])), edges, databases, elapsedSeconds };
}
