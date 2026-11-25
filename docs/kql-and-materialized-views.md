# KQL and materialized views

Eventhouse gives the three telemetry signals one query surface. The sample adds
an incremental serving layer so the overview does not repeatedly aggregate all
raw records. The executable contract is [fabric/schema.kql](../fabric/schema.kql).

## Raw tables and summaries

| Raw table | Detail | Materialized view | Stored summary |
| --- | --- | --- | --- |
| `OTELLogs` | Timestamp, severity, body, trace/span IDs, resource and log attributes. | `Logs1m` | Log count and error count by minute, service, and environment. |
| `OTELTraces` | Parent/child span IDs, start/end time, status, attributes. | `Requests1m` | Root request count, error count, duration sum, and a t-digest sketch by minute, service, and environment. |
| `OTELMetrics` | Metric name/type/unit/value and bounded dimensions. | `Metrics1m` | Sample count, sum, minimum, and maximum by minute, service, environment, and metric identity. |
| `OTELTraces` | Failed spans and their `exception` events. | `Issues1h` | Events, first/last seen, and one example trace per hour, issue fingerprint, service, environment, and version. See [issues](issues-and-alerts.md). |
| `OTELTraces` | Server spans. | `Releases1m` | Requests, errors, and a t-digest by minute, service, environment, and version. See [release health](release-health.md). |

The views accept the synthetic contract and are created before the producer
runs. They have one source table and one final `summarize`; time filtering happens
when querying. No request, user, trace, or span identifier is a rollup dimension;
`Issues1h` keeps one trace ID per row only as an aggregate example, and its
fingerprint has one value per distinct failure, not per request.

Raw data has a **7-day** retention policy and a **1-day** hot-cache policy.
Materialized views use the Eventhouse's default retention with **1 day** hot;
the sample does not override their retention. Cache and retention are different
policies: leaving hot cache does not delete data. Aggregate history does not
preserve every raw record needed to reconstruct a trace.

## Serving functions

| Function | Used for |
| --- | --- |
| `LogsOverview(lookback)` | Log and error counts over time. |
| `RequestsOverview(lookback)` | Root request count, errors, mean duration, and approximate P50/P95 latency. |
| `MetricDurationOverview(lookback)` | Duration gauge sample count, mean, minimum, and maximum. |

Further function folders build on the same tables:

| Folder | Functions | Guide |
| --- | --- | --- |
| Issues | `NormalizeErrorMessage`, `ErrorEvents`, `Issues`, `IssueStatus`, `IssueAlerts` | [Issues and alerts](issues-and-alerts.md) |
| Releases | `ReleaseHealth`, `ReleaseComparison` | [Release health](release-health.md) |
| Agents | `AgentSpans`, `AgentRuns`, `AgentOverview`, `AgentModels`, `AgentTools`, `AgentRun` | [AI agent tracing](ai-agents.md) |
| Toolbox | `ServiceHealth`, `TopIssues`, `IssueDetail`, `TraceDetail`, `RecentErrors`, `TelemetryVolume`, `TelemetryCoverage` | Below |

The **toolbox** functions are shaped like investigation tasks so that an AI agent
connected through an Eventhouse MCP server can call one function by name rather
than compose KQL over raw tables; the
[investigation skill](../.github/skills/otel-eventhouse-investigation/SKILL.md)
lists which to call for which question. `TelemetryVolume(lookback)` reports rows
and estimated uncompressed bytes per hour, signal, service, and environment, the
main driver of ingestion on the capacity. `TelemetryCoverage()` reports the oldest
and newest stored row per raw table, which shows the retention actually in effect
without a management command.

The Grafana dashboards pass `30d` and apply Grafana's selected time range. Each
function queries the **view name**, which combines its materialized part with
the unmaterialized delta. This keeps the result current relative to data already
ingested. `materialized_view()` can trade freshness for speed; it is not used by
the baseline dashboards. The three Fabric Real-Time Dashboards use the same
functions with bounded raw-table queries for per-service, log, and trace detail.

```kusto
RequestsOverview(1h)
| project WindowStart, Service, RequestCount, ErrorCount, AverageMs, P95Ms
| order by WindowStart asc
```

## Read the numbers correctly

- Each synthetic request emits **four spans**, but `Requests1m` counts only the
  `demo.request` root span. Summing all spans would quadruple the request count.
- Error counts derive from span status or log severity. Error rate is errors
  divided by the corresponding request count, with a zero-denominator guard.
- P50/P95 values are approximate estimates from the stored t-digest. Do not
  average minute-level P95 values to obtain an hourly P95. Merge the underlying
  sketches when designing a different time grain.
- A duration gauge is a sample. `ValueSum / SampleCount` is its mean; summing
  gauge values is not a request rate. The separate request counter is emitted
  with delta temporality. A future cumulative counter needs reset-aware delta
  handling before any rate calculation.
- The ingestion pipeline does not promise exactly-once delivery. Repeated job
  runs add requests; retransmitted records can increase counts.
- A stopped manual producer produces a gap. Missing data is not proof of zero
  errors or a healthy workload, and the dashboard does not fill gaps with zero.

## Inspect health and detail

```kusto
.show materialized-views
```

Check enabled state, health, materialization progress, and recent results before
attributing a slow or empty dashboard to the visualization layer. Then compare a
raw-table time range with the corresponding view. Allow for both ingestion delay
and materialization progress; a view can be healthy while its source has no data.

[fabric/queries.kql](../fabric/queries.kql) includes first-signal checks and bounded
detail queries. Grafana uses a trace-ID field to select the related spans. Detailed
investigation only works while the raw rows remain within retention.

## Evolve a view deliberately

The bootstrap can apply the versioned database definition to an existing database
with `--update-schema`. Review it first: schema, retention, cache, and function
changes affect existing data and queries. The documented
`.create-or-alter materialized-view` command has constraints on definition changes;
it is not a general migration engine.

Initial views do not backfill older rows by default. For a populated database,
plan and test backfill separately, budget its compute cost, and confirm the raw
retention window still contains the history needed. A 30-day view cannot be rebuilt
from only seven days of retained raw data. Add a new version of a view and switch
consumers when a definition change cannot be applied safely in place.

References: [materialized-view concepts](https://learn.microsoft.com/en-us/kusto/management/materialized-views/materialized-view-overview?view=microsoft-fabric),
[create-or-alter command](https://learn.microsoft.com/en-us/kusto/management/materialized-views/materialized-view-create-or-alter?view=microsoft-fabric),
and [t-digest aggregation](https://learn.microsoft.com/en-us/kusto/query/tdigest-aggregation-function?view=microsoft-fabric).
