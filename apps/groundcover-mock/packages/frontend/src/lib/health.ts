import { formatDuration, formatPercent } from '@telemetry';
import type { Health, Issue, MinutePoint } from './model';

/** One set of thresholds drives workload health, Issues and the Map colouring. */
export const THRESHOLDS = {
  errorWarn: 0.05,
  errorCritical: 0.1,
  p95Warn: 500,
} as const;

export function classify(errorRate: number, p95: number): Health {
  if (errorRate >= THRESHOLDS.errorCritical) return 'critical';
  if (errorRate >= THRESHOLDS.errorWarn || p95 >= THRESHOLDS.p95Warn) return 'degraded';
  return 'healthy';
}

export const HEALTH_COLOR: Record<Health, string> = {
  healthy: '#1f9d63',
  degraded: '#e59a0e',
  critical: '#d92d20',
};

export const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
};

interface IssueInput {
  name: string;
  errorRate: number;
  p95: number;
  series: MinutePoint[];
}

export function deriveIssues(workload: IssueInput, windowStart: number): Issue[] {
  const issues: Issue[] = [];
  const firstBreach = (breaches: (point: MinutePoint) => boolean) =>
    workload.series.find((point) => point.requests > 0 && breaches(point))?.t ?? workload.series[0]?.t ?? windowStart;

  if (workload.errorRate >= THRESHOLDS.errorWarn) {
    issues.push({
      id: `${workload.name}:errors`,
      workload: workload.name,
      title: 'High error rate',
      detail: `${formatPercent(workload.errorRate, 1)} of requests failed (threshold ${formatPercent(THRESHOLDS.errorWarn, 0)})`,
      severity: workload.errorRate >= THRESHOLDS.errorCritical ? 'S1' : 'S2',
      kind: 'errors',
      since: firstBreach((point) => point.errors / point.requests >= THRESHOLDS.errorWarn),
    });
  }
  if (workload.p95 >= THRESHOLDS.p95Warn) {
    issues.push({
      id: `${workload.name}:latency`,
      workload: workload.name,
      title: 'High p95 latency',
      detail: `p95 ${formatDuration(workload.p95)} (threshold ${formatDuration(THRESHOLDS.p95Warn)})`,
      severity: 'S3',
      kind: 'latency',
      since: firstBreach((point) => point.p95 >= THRESHOLDS.p95Warn),
    });
  }
  return issues;
}
