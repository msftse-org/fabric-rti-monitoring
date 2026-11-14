/** Data contract shared by the telemetry API, the snapshot file and the three mock apps. */

export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export type SpanKind = 'server' | 'client' | 'internal' | 'producer' | 'consumer';
export type SpanStatus = 'ok' | 'error' | 'unset';

export interface Environment {
  cluster: string;
  namespace: string;
  environment: string;
  /** ISO time of the first and last record in the bundle. */
  firstSeen: string;
  lastSeen: string;
}

export interface ServiceOperation {
  /** Span name, for example `demo.checkout`. */
  name: string;
  scenario: string;
  requests: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  avgMs: number;
}

export interface ServiceSummary {
  name: string;
  version: string;
  pods: string[];
  node: string;
  /** Request counts come from server spans in the bundle window. */
  requests: number;
  errors: number;
  errorRate: number; // 0..1
  rpm: number; // requests per minute across the window
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  maxMs: number;
  logs: number;
  errorLogs: number;
  operations: ServiceOperation[];
  /** Direct downstream service/database names. */
  dependsOn: string[];
  dependedOnBy: string[];
  /** Newest span start time for this service. */
  lastSeen: string;
}

export interface ServicePoint {
  /** Start of the one-minute bucket, ISO UTC. */
  t: string;
  service: string;
  requests: number;
  errors: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  /** `service` for service-to-service calls, `database` for datastore client spans. */
  kind: 'service' | 'database';
  calls: number;
  errors: number;
  avgMs: number;
  p95: number;
}

export interface LogEntry {
  id: string;
  ts: string; // ISO UTC
  service: string;
  severity: Severity;
  body: string;
  traceId: string;
  spanId: string;
  /** Name of the span that emitted the log, joined by span id. */
  spanName: string;
  durationMs: number | null;
  pod: string;
  node: string;
  version: string;
  scenario: string;
  outcome: string;
  runId: string;
}

export interface LogBucket {
  t: string;
  severity: Severity;
  count: number;
}

export interface TraceSummary {
  traceId: string;
  start: string; // ISO UTC
  durationMs: number;
  rootService: string;
  rootName: string;
  spanCount: number;
  errorCount: number;
  logCount: number;
  services: string[];
  scenario: string;
  outcome: string;
  status: SpanStatus;
}

export interface TraceSpan {
  spanId: string;
  parentId: string;
  name: string;
  service: string;
  kind: SpanKind;
  status: SpanStatus;
  start: string; // ISO UTC
  /** Offset from the start of the trace, in milliseconds. */
  offsetMs: number;
  durationMs: number;
  depth: number;
  scenario: string;
  outcome: string;
  pod: string;
  node: string;
  version: string;
  logCount: number;
}

export interface MetricPoint {
  t: string;
  service: string;
  scenario: string;
  outcome: string;
  value: number;
}

export interface MetricSeries {
  name: string;
  unit: string;
  type: string;
  description: string;
  /** `sum` series add up per bucket (counters), `mean` series average (gauges). */
  aggregation: 'sum' | 'mean';
  points: MetricPoint[];
}

/** Coarse per-service server-span history, used to evaluate monitors over days rather than the bundle window. */
export interface TelemetryHistory {
  bucketMinutes: number;
  /** ISO time of the query lookback start and of the newest bucket. */
  from: string;
  to: string;
  /** Only buckets that contain data; a missing bucket means the workload sent nothing. */
  points: ServicePoint[];
}

export interface TelemetryBundle {
  schemaVersion: 1;
  source: 'live' | 'snapshot';
  generatedAt: string;
  windowMinutes: number;
  environment: Environment;
  services: ServiceSummary[];
  servicePoints: ServicePoint[];
  edges: DependencyEdge[];
  logs: LogEntry[];
  logBuckets: LogBucket[];
  traces: TraceSummary[];
  /** Spans for every trace in `traces`, ordered by start time. */
  spans: Record<string, TraceSpan[]>;
  metrics: MetricSeries[];
  totals: { spans: number; traces: number; logs: number; errorLogs: number; metricPoints: number };
  /** Optional so snapshots written before it existed still load. */
  history?: TelemetryHistory;
}
