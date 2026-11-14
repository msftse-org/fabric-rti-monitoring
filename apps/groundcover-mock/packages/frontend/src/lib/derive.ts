import { windowBundle, type LogEntry, type ServicePoint, type ServiceSummary, type TelemetryBundle } from '@telemetry';
import { classify, deriveIssues } from './health';
import type { MinutePoint, View, Workload } from './model';
import { sum } from './series';

const MINUTE = 60_000;

/** Pod names follow `<deployment>-<replicaset hash>-<pod hash>`, which identifies a Deployment-owned ReplicaSet. */
function kindFromPod(pod: string | undefined): string {
  return pod && /-[a-z0-9]{8,10}-[a-z0-9]{5}$/.test(pod) ? 'ReplicaSet' : 'Pod';
}

function weighted(points: readonly MinutePoint[], key: 'avgMs' | 'p50' | 'p95' | 'p99'): number {
  const requests = sum(points.map((point) => point.requests));
  return requests > 0 ? sum(points.map((point) => point[key] * point.requests)) / requests : 0;
}

function buildSeries(points: readonly ServicePoint[], axis: number[]): MinutePoint[] {
  const byTime = new Map(points.map((point) => [Date.parse(point.t), point]));
  return axis.map((t) => {
    const point = byTime.get(t);
    return point
      ? { t, requests: point.requests, errors: point.errors, avgMs: point.avgMs, p50: point.p50, p95: point.p95, p99: point.p99 }
      : { t, requests: 0, errors: 0, avgMs: 0, p50: 0, p95: 0, p99: 0 };
  });
}

function buildWorkload(
  summary: ServiceSummary,
  points: readonly ServicePoint[],
  axis: number[],
  logs: readonly LogEntry[],
  spanSeconds: number,
  fullCoverage: boolean,
  since: number,
): Workload {
  const series = buildSeries(points, axis);
  const requests = sum(series.map((point) => point.requests));
  const errors = sum(series.map((point) => point.errors));
  const errorRate = requests > 0 ? errors / requests : 0;
  const active = series.filter((point) => point.requests > 0);
  const own = logs.filter((log) => log.service === summary.name);
  const percentiles = fullCoverage
    ? { p50: summary.p50, p95: summary.p95, p99: summary.p99 }
    : { p50: weighted(active, 'p50'), p95: weighted(active, 'p95'), p99: weighted(active, 'p99') };
  const base = {
    name: summary.name,
    version: summary.version,
    pods: summary.pods,
    node: summary.node,
    kind: kindFromPod(summary.pods[0]),
    requests,
    errors,
    errorRate,
    rps: requests / spanSeconds,
    avgMs: weighted(active, 'avgMs'),
    ...percentiles,
    percentilesApprox: !fullCoverage,
    logs: own.length,
    errorLogs: own.filter((log) => log.severity === 'ERROR' || log.severity === 'FATAL').length,
    series,
    dependsOn: summary.dependsOn,
    dependedOnBy: summary.dependedOnBy,
    operations: summary.operations,
  };
  return { ...base, health: classify(errorRate, base.p95), issues: deriveIssues(base, since) };
}

/** Narrows the bundle to a time window and derives the per-workload numbers every page shares. */
export function buildView(bundle: TelemetryBundle, minutes: number): View {
  const windowed = windowBundle(bundle, minutes);
  const times = windowed.servicePoints.map((point) => Date.parse(point.t));
  const firstBucket = times.length ? Math.min(...times) : windowed.since;
  const lastBucket = times.length ? Math.max(...times) : windowed.since;
  const minuteAxis: number[] = [];
  for (let t = firstBucket; t <= lastBucket && times.length; t += MINUTE) minuteAxis.push(t);

  const firstSeen = Date.parse(bundle.environment.firstSeen);
  const fullCoverage = windowed.since <= firstSeen;
  const effectiveStart = Math.max(firstBucket, firstSeen);
  const spanSeconds = Math.max(60, (windowed.newest - effectiveStart) / 1000);

  const workloads = bundle.services.map((summary) =>
    buildWorkload(
      summary,
      windowed.servicePoints.filter((point) => point.service === summary.name),
      minuteAxis,
      windowed.logs,
      spanSeconds,
      fullCoverage,
      windowed.since,
    ),
  );
  const entries = workloads.filter((workload) => workload.dependedOnBy.length === 0);
  const requests = sum(entries.map((workload) => workload.requests));
  const errors = sum(entries.map((workload) => workload.errors));
  const issues = workloads
    .flatMap((workload) => workload.issues)
    .sort((a, b) => a.severity.localeCompare(b.severity) || a.workload.localeCompare(b.workload));

  return {
    bundle,
    minutes,
    since: windowed.since,
    newest: windowed.newest,
    spanSeconds,
    fullCoverage,
    minuteAxis,
    logs: windowed.logs,
    traces: windowed.traces,
    servicePoints: windowed.servicePoints,
    metrics: windowed.metrics,
    workloads,
    workloadByName: new Map(workloads.map((workload) => [workload.name, workload])),
    issues,
    totals: {
      requests,
      errors,
      errorRate: requests > 0 ? errors / requests : 0,
      rps: requests / spanSeconds,
      p95: Math.max(0, ...entries.map((workload) => workload.p95)),
    },
  };
}
