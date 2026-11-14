import { buildBundle, buildHistory } from './bundle.mjs';
import { query } from './kusto.mjs';

const MAX_MINUTES = 360;
// On-call monitors are evaluated over days of coarse buckets, not the minute-level bundle window.
const HISTORY_DAYS = 7;
const HISTORY_BUCKET_MINUTES = 5;

const ATTRS = {
  service: "tostring(ResourceAttributes['service.name'])",
  version: "tostring(ResourceAttributes['service.version'])",
  pod: "tostring(ResourceAttributes['k8s.pod.name'])",
  node: "tostring(ResourceAttributes['k8s.node.name'])",
};

export function clampMinutes(value, fallback = 60) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 5), MAX_MINUTES);
}

/** Per-service server-span health in 5-minute buckets over several days, for the on-call monitors. */
export async function fetchHistory({ target, historyDays = HISTORY_DAYS }) {
  const rows = await query(
    `OTELTraces
| where StartTime > ago(${historyDays}d) and SpanKind == 'SPAN_KIND_SERVER'
| extend service=${ATTRS.service}, durationMs=datetime_diff('microsecond', EndTime, StartTime) / 1000.0
| where isnotempty(service)
| summarize requests=count(), errors=countif(SpanStatus == 'STATUS_CODE_ERROR'), avgMs=avg(durationMs),
    p50=percentile(durationMs, 50), p95=percentile(durationMs, 95), p99=percentile(durationMs, 99)
    by t=bin(StartTime, ${HISTORY_BUCKET_MINUTES}m), service
| take 50000`,
    target,
  );
  return buildHistory(rows, {
    bucketMinutes: HISTORY_BUCKET_MINUTES,
    from: new Date(Date.now() - historyDays * 86_400_000).toISOString(),
  });
}

/** `history` may be passed in (a value or a promise) so a polled server can reuse a cached copy. */
export async function fetchBundle({ minutes = 60, target, source = 'live', limits, history, historyDays = HISTORY_DAYS }) {
  const window = clampMinutes(minutes);
  const spans = `OTELTraces
| where StartTime > ago(${window}m)
| project traceId=TraceID, spanId=SpanID, parentId=ParentID, name=SpanName, status=SpanStatus, spanKind=SpanKind,
    startTime=StartTime, durationMs=datetime_diff('microsecond', EndTime, StartTime) / 1000.0,
    service=${ATTRS.service}, version=${ATTRS.version}, pod=${ATTRS.pod}, node=${ATTRS.node},
    cluster=tostring(ResourceAttributes['k8s.cluster.name']), namespace=tostring(ResourceAttributes['k8s.namespace.name']),
    environment=tostring(ResourceAttributes['deployment.environment.name']),
    scenario=tostring(TraceAttributes['demo.scenario']), outcome=tostring(TraceAttributes['outcome'])
| take 80000`;
  const logs = `OTELLogs
| where Timestamp > ago(${window}m)
| project ts=Timestamp, traceId=TraceID, spanId=SpanID, severity=SeverityText, body=Body,
    service=${ATTRS.service}, version=${ATTRS.version}, pod=${ATTRS.pod}, node=${ATTRS.node},
    scenario=tostring(LogsAttributes['demo.scenario']), outcome=tostring(LogsAttributes['outcome']),
    runId=tostring(LogsAttributes['demo.run_id'])
| take 100000`;
  const metrics = `OTELMetrics
| where Timestamp > ago(${window}m)
| summarize sumValue=sum(MetricValue), avgValue=avg(MetricValue), description=any(MetricDescription)
    by t=bin(Timestamp, 1m), name=MetricName, unit=MetricUnit, type=MetricType, service=${ATTRS.service},
    scenario=tostring(MetricAttributes['demo.scenario']), outcome=tostring(MetricAttributes['outcome'])
| take 100000`;
  const [spanRows, logRows, metricRows, historyValue] = await Promise.all([
    query(spans, target),
    query(logs, target),
    query(metrics, target),
    history ?? fetchHistory({ target, historyDays }),
  ]);
  const generatedAt = new Date().toISOString();
  return buildBundle({
    spans: spanRows,
    logs: logRows,
    metrics: metricRows,
    history: historyValue,
    windowMinutes: window,
    generatedAt,
    source,
    limits,
  });
}
