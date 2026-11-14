import type { LogEntry, MetricSeries, ServiceOperation, ServicePoint, TelemetryBundle, TraceSummary } from '@telemetry';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
}

export type Health = 'healthy' | 'degraded' | 'critical';
export type IssueSeverity = 'S1' | 'S2' | 'S3';

export interface MinutePoint {
  t: number;
  requests: number;
  errors: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface Issue {
  id: string;
  workload: string;
  title: string;
  detail: string;
  severity: IssueSeverity;
  kind: 'errors' | 'latency';
  /** Epoch ms of the first breaching minute inside the selected window. */
  since: number;
}

export interface Workload {
  name: string;
  version: string;
  pods: string[];
  node: string;
  kind: string;
  requests: number;
  errors: number;
  errorRate: number;
  rps: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  /** True when percentiles are request-weighted means of 1-minute percentiles. */
  percentilesApprox: boolean;
  logs: number;
  errorLogs: number;
  health: Health;
  issues: Issue[];
  series: MinutePoint[];
  dependsOn: string[];
  dependedOnBy: string[];
  operations: ServiceOperation[];
}

export interface View {
  bundle: TelemetryBundle;
  minutes: number;
  since: number;
  newest: number;
  spanSeconds: number;
  fullCoverage: boolean;
  minuteAxis: number[];
  logs: LogEntry[];
  traces: TraceSummary[];
  servicePoints: ServicePoint[];
  metrics: MetricSeries[];
  workloads: Workload[];
  workloadByName: Map<string, Workload>;
  issues: Issue[];
  totals: { requests: number; errors: number; errorRate: number; rps: number; p95: number };
}
