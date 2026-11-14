import type { DependencyEdge, ServiceOperation, ServiceSummary, TelemetryBundle, TraceSpan } from '@telemetry';
import type { Health } from './palette';
import type { WindowedData } from './window';

export interface Monitor {
  id: string;
  name: string;
  value: string;
  threshold: string;
  status: Health;
}

export interface ServiceStat {
  name: string;
  version: string;
  node: string;
  pods: string[];
  requests: number;
  errors: number;
  errorRate: number;
  rps: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  /** Derived from indexed server spans with T = 500 ms; `null` when no spans are indexed. */
  apdex: number | null;
  logs: number;
  errorLogs: number;
  monitors: Monitor[];
  status: Health;
  dependsOn: string[];
  dependedOnBy: string[];
}

export interface EdgeStat extends DependencyEdge {
  errorRate: number;
  rps: number;
}

export const APDEX_T_MS = 500;
const HEALTH_RANK: Record<Health, number> = { ok: 0, nodata: 1, warn: 2, alert: 3 };

export const worst = (statuses: Health[]): Health => statuses.reduce<Health>((a, b) => (HEALTH_RANK[b] > HEALTH_RANK[a] ? b : a), 'ok');

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const ms = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(0)}ms`);

export function monitorsFor(name: string, s: { requests: number; errorRate: number; p95: number; apdex: number | null }): Monitor[] {
  if (s.requests === 0) {
    return ['error-rate', 'latency', 'apdex'].map((id) => ({ id, name: `${id} on ${name}`, value: '–', threshold: '', status: 'nodata' as const }));
  }
  const apdex = s.apdex ?? 1;
  return [
    {
      id: 'error-rate',
      name: `Error rate on ${name}`,
      value: pct(s.errorRate),
      threshold: 'warn ≥ 5% · alert ≥ 10%',
      status: s.errorRate >= 0.1 ? 'alert' : s.errorRate >= 0.05 ? 'warn' : 'ok',
    },
    {
      id: 'latency',
      name: `p95 latency on ${name}`,
      value: ms(s.p95),
      threshold: 'warn ≥ 500ms · alert ≥ 1s',
      status: s.p95 >= 1000 ? 'alert' : s.p95 >= 500 ? 'warn' : 'ok',
    },
    {
      id: 'apdex',
      name: `Apdex on ${name}`,
      value: apdex.toFixed(2),
      threshold: 'warn < 0.90 · alert < 0.80',
      status: apdex < 0.8 ? 'alert' : apdex < 0.9 ? 'warn' : 'ok',
    },
  ];
}

export function computeStats(bundle: TelemetryBundle, win: WindowedData): ServiceStat[] {
  const covers = win.since <= Date.parse(bundle.environment.firstSeen) && win.until >= win.newest;
  const seconds = Math.max(1, (win.until - win.start) / 1000);
  const apdexInputs = new Map<string, { n: number; satisfied: number; tolerating: number }>();
  for (const trace of win.traces) {
    for (const span of bundle.spans[trace.traceId] ?? []) {
      if (span.kind !== 'server') continue;
      const entry = apdexInputs.get(span.service) ?? { n: 0, satisfied: 0, tolerating: 0 };
      entry.n += 1;
      if (span.status !== 'error') {
        if (span.durationMs <= APDEX_T_MS) entry.satisfied += 1;
        else if (span.durationMs <= APDEX_T_MS * 4) entry.tolerating += 1;
      }
      apdexInputs.set(span.service, entry);
    }
  }

  return bundle.services.map((svc: ServiceSummary) => {
    const points = win.points.filter((point) => point.service === svc.name);
    const requests = points.reduce((sum, point) => sum + point.requests, 0);
    const errors = points.reduce((sum, point) => sum + point.errors, 0);
    const weighted = (pick: (point: (typeof points)[number]) => number) =>
      requests ? points.reduce((sum, point) => sum + pick(point) * point.requests, 0) / requests : 0;
    const exact = covers ? svc : null;
    const logs = win.logs.filter((log) => log.service === svc.name);
    const input = apdexInputs.get(svc.name);
    const apdex = input && input.n ? (input.satisfied + input.tolerating / 2) / input.n : null;
    const errorRate = requests ? errors / requests : 0;
    const p95 = exact?.p95 ?? weighted((point) => point.p95);
    const monitors = monitorsFor(svc.name, { requests, errorRate, p95, apdex });
    return {
      name: svc.name,
      version: svc.version,
      node: svc.node,
      pods: svc.pods,
      requests,
      errors,
      errorRate,
      rps: requests / seconds,
      avgMs: exact?.avgMs ?? weighted((point) => point.avgMs),
      p50: exact?.p50 ?? weighted((point) => point.p50),
      p95,
      p99: exact?.p99 ?? weighted((point) => point.p99),
      apdex,
      logs: logs.length,
      errorLogs: logs.filter((log) => log.severity === 'ERROR' || log.severity === 'FATAL').length,
      monitors,
      status: worst(monitors.map((monitor) => monitor.status)),
      dependsOn: svc.dependsOn,
      dependedOnBy: svc.dependedOnBy,
    };
  });
}

/** Service-to-service edges use the callee's server-span stats; database edges are scaled by the caller's share of the bundle. */
export function computeEdges(bundle: TelemetryBundle, stats: ServiceStat[], win: WindowedData): EdgeStat[] {
  const byName = new Map(stats.map((stat) => [stat.name, stat]));
  const seconds = Math.max(1, (win.until - win.start) / 1000);
  return bundle.edges.map((edge) => {
    const callee = byName.get(edge.to);
    if (edge.kind === 'service' && callee) {
      return { ...edge, calls: callee.requests, errors: callee.errors, avgMs: callee.avgMs, p95: callee.p95, errorRate: callee.errorRate, rps: callee.rps };
    }
    const caller = byName.get(edge.from);
    const total = bundle.services.find((svc) => svc.name === edge.from)?.requests ?? 0;
    const ratio = caller && total ? caller.requests / total : 0;
    const calls = Math.round(edge.calls * ratio);
    const errors = Math.round(edge.errors * ratio);
    return { ...edge, calls, errors, errorRate: calls ? errors / calls : 0, rps: calls / seconds };
  });
}

export function scaledOperations(bundle: TelemetryBundle, stat: ServiceStat): ServiceOperation[] {
  const summary = bundle.services.find((svc) => svc.name === stat.name);
  if (!summary) return [];
  const ratio = summary.requests ? stat.requests / summary.requests : 0;
  return summary.operations.map((op) => ({ ...op, requests: Math.round(op.requests * ratio), errors: Math.round(op.errors * ratio) }));
}

/** Datastore client spans (`demo.<db>.query`) are shown under the database they call. */
export function spanService(span: Pick<TraceSpan, 'kind' | 'name' | 'service'>): string {
  const match = /^demo\.(\w+)\.query$/.exec(span.name);
  return span.kind === 'client' && match ? match[1] : span.service;
}

/** Exclusive time of every span: its duration minus the time covered by direct children. */
export function selfTimes(spans: TraceSpan[]): Record<string, number> {
  const childTotals: Record<string, number> = {};
  for (const span of spans) if (span.parentId) childTotals[span.parentId] = (childTotals[span.parentId] ?? 0) + span.durationMs;
  const out: Record<string, number> = {};
  for (const span of spans) out[span.spanId] = Math.max(0, span.durationMs - (childTotals[span.spanId] ?? 0));
  return out;
}

export function serviceSelfTimes(spans: TraceSpan[]): Map<string, number> {
  const self = selfTimes(spans);
  const out = new Map<string, number>();
  for (const span of spans) {
    const name = spanService(span);
    out.set(name, (out.get(name) ?? 0) + self[span.spanId]);
  }
  return out;
}

export function healthOf(stat: Pick<ServiceStat, 'status'> | undefined): Health {
  return stat?.status ?? 'nodata';
}

/** Exclusive time per service inside the sub-trees rooted at `service`'s spans, over the retained traces. */
export function timeSpentBelow(bundle: TelemetryBundle, traces: { traceId: string }[], service: string): { name: string; ms: number }[] {
  const totals = new Map<string, number>();
  for (const { traceId } of traces) {
    const spans = bundle.spans[traceId];
    if (!spans) continue;
    const self = selfTimes(spans);
    const inside = new Set<string>();
    for (const span of [...spans].sort((a, b) => a.depth - b.depth)) {
      if (span.service === service || (span.parentId && inside.has(span.parentId))) inside.add(span.spanId);
    }
    for (const span of spans) {
      if (!inside.has(span.spanId)) continue;
      const name = spanService(span);
      totals.set(name, (totals.get(name) ?? 0) + self[span.spanId]);
    }
  }
  return [...totals.entries()].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms);
}
