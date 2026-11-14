// Turns raw Eventhouse rows into the TelemetryBundle that every mock app renders.
// Pure functions only, so the aggregation is unit-tested without network access.

const KIND = {
  SPAN_KIND_SERVER: 'server',
  SPAN_KIND_CLIENT: 'client',
  SPAN_KIND_INTERNAL: 'internal',
  SPAN_KIND_PRODUCER: 'producer',
  SPAN_KIND_CONSUMER: 'consumer',
};
const STATUS = { STATUS_CODE_OK: 'ok', STATUS_CODE_ERROR: 'error' };
const SEVERITY = { TRACE: 'DEBUG', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', WARNING: 'WARN', ERROR: 'ERROR', FATAL: 'FATAL', CRITICAL: 'FATAL' };
const DATABASE_HINT = /(postgres|mysql|sql|redis|mongo|cosmos|cassandra|dynamo)/i;

export const DEFAULT_LIMITS = { logs: 2500, errorLogs: 600, traces: 300, errorTraces: 200, slowTraces: 100 };

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : 0);
const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const minute = (ms) => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
const iso = (ms) => new Date(ms).toISOString();

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function stats(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    avgMs: round(mean(sorted)),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

function normalizeSpan(row) {
  const startMs = Date.parse(row.startTime);
  return {
    key: `${row.traceId}/${row.spanId}`,
    parentKey: row.parentId ? `${row.traceId}/${row.parentId}` : '',
    traceId: row.traceId,
    spanId: row.spanId,
    parentId: row.parentId || '',
    name: row.name,
    kind: KIND[row.spanKind] ?? 'internal',
    status: STATUS[row.status] ?? 'unset',
    startMs,
    durationMs: round(Number(row.durationMs) || 0, 3),
    service: row.service || 'unknown',
    version: row.version || '',
    pod: row.pod || '',
    node: row.node || '',
    scenario: row.scenario || '',
    outcome: row.outcome || '',
    cluster: row.cluster || '',
    namespace: row.namespace || '',
    environment: row.environment || '',
  };
}

function normalizeLog(row) {
  const raw = String(row.severity || 'INFO').toUpperCase();
  const tsMs = Date.parse(row.ts);
  return {
    ts: iso(tsMs),
    tsMs,
    service: row.service || 'unknown',
    severity: SEVERITY[raw] ?? 'INFO',
    body: row.body ?? '',
    traceId: row.traceId || '',
    spanId: row.spanId || '',
    pod: row.pod || '',
    node: row.node || '',
    version: row.version || '',
    scenario: row.scenario || '',
    outcome: row.outcome || '',
    runId: row.runId || '',
  };
}

function summarizeServices(spans, logs) {
  const byService = new Map();
  const entry = (name) => {
    if (!byService.has(name)) byService.set(name, { name, spans: [], all: [], pods: new Set(), versions: new Map(), nodes: new Set(), logs: 0, errorLogs: 0 });
    return byService.get(name);
  };
  for (const span of spans) {
    const item = entry(span.service);
    item.all.push(span);
    if (span.kind === 'server') item.spans.push(span);
    if (span.pod) item.pods.add(span.pod);
    if (span.node) item.nodes.add(span.node);
    if (span.version) item.versions.set(span.version, (item.versions.get(span.version) ?? 0) + 1);
  }
  for (const log of logs) {
    const item = entry(log.service);
    item.logs += 1;
    if (log.severity === 'ERROR' || log.severity === 'FATAL') item.errorLogs += 1;
  }
  return byService;
}

function operationsFor(spans) {
  const groups = new Map();
  for (const span of spans) {
    const key = `${span.name}\u0000${span.scenario}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(span);
  }
  return [...groups.values()]
    .map((group) => ({
      name: group[0].name,
      scenario: group[0].scenario,
      requests: group.length,
      errors: group.filter((span) => span.status === 'error').length,
      ...(({ avgMs, p50, p95, p99 }) => ({ avgMs, p50, p95, p99 }))(stats(group.map((span) => span.durationMs))),
    }))
    .sort((a, b) => b.requests - a.requests);
}

function buildEdges(spans) {
  const byKey = new Map(spans.map((span) => [span.key, span]));
  const hasChild = new Set(spans.map((span) => span.parentKey).filter(Boolean));
  const edges = new Map();
  const add = (from, to, kind, span) => {
    const key = `${from}\u0000${to}`;
    if (!edges.has(key)) edges.set(key, { from, to, kind, durations: [], errors: 0 });
    const edge = edges.get(key);
    edge.durations.push(span.durationMs);
    if (span.status === 'error') edge.errors += 1;
  };
  for (const span of spans) {
    const parent = span.parentKey ? byKey.get(span.parentKey) : undefined;
    if (parent && parent.service !== span.service) add(parent.service, span.service, 'service', span);
    if (span.kind === 'client' && !hasChild.has(span.key) && DATABASE_HINT.test(span.name)) {
      const target = span.name.split('.').find((part) => DATABASE_HINT.test(part)) ?? span.name;
      add(span.service, target, 'database', span);
    }
  }
  return [...edges.values()].map((edge) => {
    const { avgMs, p95 } = stats(edge.durations);
    return { from: edge.from, to: edge.to, kind: edge.kind, calls: edge.durations.length, errors: edge.errors, avgMs, p95 };
  }).sort((a, b) => b.calls - a.calls);
}

function buildTraces(spans, logsBySpan, limits) {
  const traces = new Map();
  for (const span of spans) {
    if (!traces.has(span.traceId)) traces.set(span.traceId, []);
    traces.get(span.traceId).push(span);
  }
  const summaries = [];
  for (const [traceId, members] of traces) {
    const root = members.filter((span) => !span.parentId).sort((a, b) => a.startMs - b.startMs)[0];
    if (!root) continue; // The root fell outside the window; the trace would be partial.
    const start = Math.min(...members.map((span) => span.startMs));
    const finish = Math.max(...members.map((span) => span.startMs + span.durationMs));
    const ordered = [...members].sort((a, b) => a.startMs - b.startMs);
    const errorCount = members.filter((span) => span.status === 'error').length;
    summaries.push({
      traceId,
      startMs: start,
      start: iso(start),
      durationMs: round(finish - start),
      rootService: root.service,
      rootName: root.name,
      spanCount: members.length,
      errorCount,
      logCount: members.reduce((sum, span) => sum + (logsBySpan.get(span.key) ?? 0), 0),
      services: [...new Set(ordered.map((span) => span.service))],
      scenario: root.scenario,
      outcome: root.outcome,
      status: root.status === 'error' || errorCount > 0 ? 'error' : root.status,
      members,
    });
  }
  summaries.sort((a, b) => b.startMs - a.startMs);
  const chosen = new Map();
  const take = (list, count) => list.slice(0, count).forEach((trace) => chosen.set(trace.traceId, trace));
  take(summaries, limits.traces);
  take(summaries.filter((trace) => trace.status === 'error'), limits.errorTraces);
  take([...summaries].sort((a, b) => b.durationMs - a.durationMs), limits.slowTraces);
  return { all: summaries, selected: [...chosen.values()].sort((a, b) => b.startMs - a.startMs) };
}

function traceSpans(trace, logsBySpan) {
  const byId = new Map(trace.members.map((span) => [span.spanId, span]));
  const depthOf = (span, seen = new Set()) => {
    if (!span.parentId || seen.has(span.spanId)) return 0;
    const parent = byId.get(span.parentId);
    return parent ? 1 + depthOf(parent, seen.add(span.spanId)) : 0;
  };
  return [...trace.members]
    .map((span) => ({ span, depth: depthOf(span) }))
    .sort((a, b) => a.span.startMs - b.span.startMs || a.depth - b.depth)
    .map(({ span, depth }) => ({
      spanId: span.spanId,
      parentId: span.parentId,
      name: span.name,
      service: span.service,
      kind: span.kind,
      status: span.status,
      start: iso(span.startMs),
      offsetMs: round(span.startMs - trace.startMs, 3),
      durationMs: span.durationMs,
      depth,
      scenario: span.scenario,
      outcome: span.outcome,
      pod: span.pod,
      node: span.node,
      version: span.version,
      logCount: logsBySpan.get(span.key) ?? 0,
    }));
}

function buildMetrics(rows) {
  const series = new Map();
  for (const row of rows) {
    if (!series.has(row.name)) {
      series.set(row.name, {
        name: row.name,
        unit: row.unit || '',
        type: row.type || '',
        description: row.description || '',
        aggregation: row.type === 'Sum' ? 'sum' : 'mean',
        points: [],
      });
    }
    const item = series.get(row.name);
    item.points.push({
      t: row.t,
      service: row.service || 'unknown',
      scenario: row.scenario || '',
      outcome: row.outcome || '',
      value: round(item.aggregation === 'sum' ? row.sumValue : row.avgValue, 3),
    });
  }
  for (const item of series.values()) item.points.sort((a, b) => a.t.localeCompare(b.t));
  return [...series.values()];
}

export function buildHistory(rows, { bucketMinutes, from }) {
  const points = rows
    .filter((row) => row.service && row.t)
    .map((row) => ({
      t: iso(Date.parse(row.t)),
      service: row.service,
      requests: Number(row.requests) || 0,
      errors: Number(row.errors) || 0,
      avgMs: round(Number(row.avgMs)),
      p50: round(Number(row.p50)),
      p95: round(Number(row.p95)),
      p99: round(Number(row.p99)),
    }))
    .sort((a, b) => a.t.localeCompare(b.t) || a.service.localeCompare(b.service));
  return { bucketMinutes, from, to: points.at(-1)?.t ?? from, points };
}

export function buildBundle({ spans: spanRows, logs: logRows, metrics: metricRows = [], history, windowMinutes, generatedAt, source = 'live', limits = {} }) {
  const cap = { ...DEFAULT_LIMITS, ...limits };
  const spans = spanRows.map(normalizeSpan);
  const allLogs = logRows.map(normalizeLog).sort((a, b) => b.tsMs - a.tsMs);
  const spanByKey = new Map(spans.map((span) => [span.key, span]));

  const logsBySpan = new Map();
  for (const log of allLogs) {
    if (!log.traceId || !log.spanId) continue;
    const key = `${log.traceId}/${log.spanId}`;
    logsBySpan.set(key, (logsBySpan.get(key) ?? 0) + 1);
  }

  const first = spans.reduce((min, span) => Math.min(min, span.startMs), Infinity);
  const last = spans.reduce((max, span) => Math.max(max, span.startMs), -Infinity);
  // The workload may have been down for part of the window, so rates use the data actually observed.
  const observedMinutes = Number.isFinite(first) ? Math.min(windowMinutes, Math.max((last - first) / 60_000, 1)) : windowMinutes;

  const grouped = summarizeServices(spans, allLogs);
  const edges = buildEdges(spans);
  const services = [...grouped.values()].map((item) => {
    const own = item.spans.length ? item.spans : item.all;
    const errors = own.filter((span) => span.status === 'error').length;
    const version = [...item.versions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return {
      name: item.name,
      version,
      pods: [...item.pods].sort(),
      node: [...item.nodes].sort()[0] ?? '',
      requests: own.length,
      errors,
      errorRate: own.length ? round(errors / own.length, 4) : 0,
      rpm: round(own.length / Math.max(observedMinutes, 1)),
      ...(({ avgMs, p50, p95, p99, maxMs }) => ({ avgMs, p50, p95, p99, maxMs }))(stats(own.map((span) => span.durationMs))),
      logs: item.logs,
      errorLogs: item.errorLogs,
      operations: operationsFor(item.all),
      dependsOn: [...new Set(edges.filter((edge) => edge.from === item.name).map((edge) => edge.to))],
      dependedOnBy: [...new Set(edges.filter((edge) => edge.to === item.name).map((edge) => edge.from))],
      lastSeen: iso(Math.max(...item.all.map((span) => span.startMs), 0)),
    };
  }).sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));

  const buckets = new Map();
  for (const span of spans) {
    const owner = grouped.get(span.service);
    if (owner.spans.length && span.kind !== 'server') continue;
    const key = `${minute(span.startMs)}\u0000${span.service}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(span);
  }
  const servicePoints = [...buckets.entries()].map(([key, members]) => {
    const [t, service] = key.split('\u0000');
    const { avgMs, p50, p95, p99 } = stats(members.map((span) => span.durationMs));
    return { t, service, requests: members.length, errors: members.filter((span) => span.status === 'error').length, avgMs, p50, p95, p99 };
  }).sort((a, b) => a.t.localeCompare(b.t) || a.service.localeCompare(b.service));

  const logBucketMap = new Map();
  for (const log of allLogs) {
    const key = `${minute(log.tsMs)}\u0000${log.severity}`;
    logBucketMap.set(key, (logBucketMap.get(key) ?? 0) + 1);
  }
  const logBuckets = [...logBucketMap.entries()].map(([key, count]) => {
    const [t, severity] = key.split('\u0000');
    return { t, severity, count };
  }).sort((a, b) => a.t.localeCompare(b.t) || a.severity.localeCompare(b.severity));

  const keep = new Map();
  allLogs.slice(0, cap.logs).forEach((log) => keep.set(log, true));
  allLogs.filter((log) => log.severity === 'ERROR' || log.severity === 'FATAL').slice(0, cap.errorLogs).forEach((log) => keep.set(log, true));
  const logs = allLogs.filter((log) => keep.has(log)).map((log, index) => {
    const span = log.traceId && log.spanId ? spanByKey.get(`${log.traceId}/${log.spanId}`) : undefined;
    return {
      id: `${log.tsMs}-${log.spanId || index}`,
      ts: log.ts,
      service: log.service,
      severity: log.severity,
      body: log.body,
      traceId: log.traceId,
      spanId: log.spanId,
      spanName: span?.name ?? '',
      durationMs: span ? span.durationMs : null,
      pod: log.pod,
      node: log.node,
      version: log.version,
      scenario: log.scenario,
      outcome: log.outcome,
      runId: log.runId,
    };
  });

  const { all: allTraces, selected } = buildTraces(spans, logsBySpan, cap);
  const traces = selected.map(({ members, startMs, ...summary }) => summary);
  const spansByTrace = Object.fromEntries(selected.map((trace) => [trace.traceId, traceSpans(trace, logsBySpan)]));

  const metrics = buildMetrics(metricRows);
  const sample = spans[0] ?? {};

  return {
    schemaVersion: 1,
    source,
    generatedAt,
    windowMinutes,
    environment: {
      cluster: sample.cluster ?? '',
      namespace: sample.namespace ?? '',
      environment: sample.environment ?? '',
      firstSeen: Number.isFinite(first) ? iso(first) : generatedAt,
      lastSeen: Number.isFinite(last) ? iso(last) : generatedAt,
    },
    services,
    servicePoints,
    edges,
    logs,
    logBuckets,
    traces,
    spans: spansByTrace,
    metrics,
    totals: {
      spans: spans.length,
      traces: allTraces.length,
      logs: allLogs.length,
      errorLogs: allLogs.filter((log) => log.severity === 'ERROR' || log.severity === 'FATAL').length,
      metricPoints: metrics.reduce((sum, item) => sum + item.points.length, 0),
    },
    ...(history ? { history } : {}),
  };
}
