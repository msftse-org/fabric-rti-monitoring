---
name: otel-eventhouse-investigation
description: Investigate the OpenTelemetry logs, traces, and metrics that this sample stores in a Microsoft Fabric Eventhouse. Use when asked about service health, error rates, latency, error issues and regressions, release health, AI agent runs and token usage, slow or failing traces, log and trace correlation, service dependencies, telemetry volume, or whether telemetry is arriving from the AKS otel-demo services or the synthetic Container Apps job.
---

# Investigate OpenTelemetry data in the Fabric Eventhouse

This skill teaches the schema and a proven investigation workflow. It does not
run queries by itself: pair it with one of the query tools below. Skills say
what to do; MCP servers do it.

## Connect to the data

Use the first tool that is available in the session:

1. **Eventhouse remote MCP server**: call `getSchema`, then `executeQuery`
   with `kqlQuery` and a small `maxRecords` (10 to 25).
2. **Fabric RTI MCP server** (local): call `kusto_query` with the Eventhouse
   query URI and the database `observability`.
3. **Azure Managed Grafana MCP server**: call `amgmcp_kusto_get_metadata`, then
   `amgmcp_kusto_query` against the `fabric-eventhouse` data source. That data
   source identifies the database by its KQL database item ID, not its name.
4. **No MCP server**: send `POST <query-uri>/v1/rest/query` with a token from
   `az account get-access-token --resource https://kusto.kusto.windows.net`,
   as `apps/telemetry/kusto.mjs` does. Never print or store the token.

If no tool is configured, point the user to `docs/consume.md` and ask for the
MCP server URL or query URI. Do not guess workspace, item, or cluster IDs.

## Data model

Defined in `fabric/schema.kql`. All names are case sensitive.

| Object | Kind | Use it for |
| --- | --- | --- |
| `OTELTraces` | Table | Spans: `TraceID`, `SpanID`, `ParentID`, `SpanName`, `SpanStatus`, `SpanKind`, `StartTime`, `EndTime`, `ResourceAttributes`, `TraceAttributes`, `Events`, `SpanStatusMessage` |
| `OTELLogs` | Table | Log records: `Timestamp`, `TraceID`, `SpanID`, `SeverityText`, `SeverityNumber`, `Body`, `ResourceAttributes`, `LogsAttributes` |
| `OTELMetrics` | Table | Samples: `Timestamp`, `MetricName`, `MetricType`, `MetricUnit`, `MetricValue`, `ResourceAttributes`, `MetricAttributes` |
| `Requests1m`, `Logs1m`, `Metrics1m` | Materialized views | One-minute summaries by `Service` and `Environment` |
| `RequestsOverview(lookback)` | Function | Root request count, errors, average, approximate P50 and P95 |
| `LogsOverview(lookback)` | Function | Log and error counts per minute |
| `MetricDurationOverview(lookback)` | Function | `demo.request.duration` gauge statistics |
| `Issues1h`, `Releases1m` | Materialized views | Hourly issue counts by fingerprint; per-minute server-span counts by version |
| `IssueState` | Table | Append-only triage state (open, resolved, muted). Read it through `IssueStatus()`; never write it |

### Toolbox: start here

These functions answer the common questions in one call. Prefer them to
hand-written KQL, and fall back to the recipes below for anything they do not
cover.

| Question | Call |
| --- | --- |
| Which services are unhealthy right now? | `ServiceHealth(15m)` |
| What is breaking, grouped into distinct issues? | `TopIssues(24h, 10)` or `Issues(24h)` |
| Show recent occurrences of one issue | `IssueDetail("<fingerprint>", 24h)` |
| Which issues are new, regressed, or unmuted? | `IssueAlerts(1h)` |
| Is the latest release worse than the previous one? | `ReleaseComparison(24h)`, then `ReleaseHealth(24h)` |
| Explain one failing request | `TraceDetail("<trace id>")`: every span with offsets, status, exception, and log counts |
| The newest failures for one service | `RecentErrors("payment", 1h)` (empty string for all) |
| How are the AI agents doing? | `AgentOverview(1h)`, `AgentRuns(1h)`, `AgentModels(1h)`, `AgentTools(1h)` |
| Walk through one agent run | `AgentRun("<trace id>")` |
| What drives ingestion volume, and how much is stored? | `TelemetryVolume(24h)`, `TelemetryCoverage()` |

An issue's `Title` is its exception type and a message with IDs and numbers
replaced by placeholders such as `<uuid>` and `<n>`; quote it as is. Report the
`Fingerprint` so a person can resolve or mute it with `scripts/issue-state.py`.

Conventions:

- Service: `tostring(ResourceAttributes["service.name"])`. Environment:
  `tostring(ResourceAttributes["deployment.environment.name"])` (`aks` for the
  AKS workload). AKS records also carry `k8s.*` resource attributes.
- Failed span: `SpanStatus == "STATUS_CODE_ERROR"`. Error log:
  `SeverityNumber >= 17`.
- Root request spans are named `demo.request` and come from `gateway`. Child
  spans are named `demo.<service>`; payment also emits `demo.postgres.query`.
- The AKS call chain is gateway, checkout, inventory, payment, shipping,
  notifications. Logs carry the `TraceID` and `SpanID` of their span.
- `TraceAttributes["demo.run_id"]`, `["demo.scenario"]`, and `["outcome"]`
  describe the synthetic scenario.
- `RequestsOverview` counts root spans only, so it reports gateway traffic.
  Use the raw tables for per-service health. Its percentiles are approximate.

## Workflow

1. **Freshness**: confirm all three signals arrived recently (recipe 1).
2. **Overview**: `ServiceHealth(15m)`, or request volume, errors, and latency
   (recipe 2).
3. **Hotspots**: `TopIssues(1h, 10)` groups failures into issues; recipe 3
   lists failing span names.
4. **Dependencies**: caller and callee error rates locate where failures start
   (recipe 4).
5. **Trace drill-down**: pick a slow or failed `TraceID` (recipe 5 or an
   issue's `ExampleTraceID`), then `TraceDetail(traceId)`, or its waterfall
   (recipe 6) and its logs (recipe 7).
6. **Report**: state the time window, the numbers, and two or three example
   `TraceID` values. Point to the Grafana or Fabric Traces dashboard for the
   visual waterfall.

## Recipes

Each recipe was run against a deployment of this sample. Keep the time filter.

```kusto
// 1. Freshness of each signal
union
    (OTELLogs | where Timestamp > ago(15m) | summarize Rows=count(), Latest=max(Timestamp) | extend Signal="logs"),
    (OTELTraces | where StartTime > ago(15m) | summarize Rows=count(), Latest=max(StartTime) | extend Signal="traces"),
    (OTELMetrics | where Timestamp > ago(15m) | summarize Rows=count(), Latest=max(Timestamp) | extend Signal="metrics")
| project Signal, Rows, Latest
```

```kusto
// 2. Root request overview
RequestsOverview(15m)
| summarize Requests=sum(RequestCount), Errors=sum(ErrorCount), WorstP95Ms=max(P95Ms) by Service
```

```kusto
// 3. Error hotspots by service and span
OTELTraces
| where StartTime > ago(15m) and SpanStatus == "STATUS_CODE_ERROR"
| summarize Errors=count() by Service=tostring(ResourceAttributes["service.name"]), SpanName
| top 10 by Errors
```

```kusto
// 4. Service dependencies with error counts
let spans = OTELTraces
    | where StartTime > ago(15m)
    | project TraceID, SpanID, ParentID, Service=tostring(ResourceAttributes["service.name"]), Failed=SpanStatus == "STATUS_CODE_ERROR";
spans
| join kind=inner (spans | project TraceID, ParentID=SpanID, Caller=Service) on TraceID, ParentID
| where Caller != Service
| summarize Calls=count(), Errors=countif(Failed) by Caller, Callee=Service
| order by Calls desc
```

```kusto
// 5. Slowest root requests
OTELTraces
| where StartTime > ago(15m) and isempty(ParentID)
| extend DurationMs=(EndTime-StartTime)/1ms
| top 5 by DurationMs
| project TraceID, DurationMs, SpanStatus
```

```kusto
// 6. Waterfall for one trace
let trace_id = "REPLACE_WITH_TRACE_ID";
OTELTraces
| where StartTime > ago(1h) and TraceID == trace_id
| extend Service=tostring(ResourceAttributes["service.name"]), DurationMs=(EndTime-StartTime)/1ms
| project StartTime, Service, SpanName, DurationMs, SpanStatus, SpanID, ParentID
| order by StartTime asc
```

```kusto
// 7. Logs for one trace
let trace_id = "REPLACE_WITH_TRACE_ID";
OTELLogs
| where Timestamp > ago(1h) and TraceID == trace_id
| project Timestamp, Service=tostring(ResourceAttributes["service.name"]), SeverityText, Body, SpanID
| order by Timestamp asc
```

More examples are in `fabric/queries.kql`.

## Guardrails

- Read only. Do not run management commands that change the database
  (`.create`, `.alter`, `.drop`, `.set`, `.append`, `.ingest`). Schema changes
  belong in `fabric/schema.kql` and the bootstrap script.
- Always bound the time range and the row count. Start with 15 minutes and
  widen only when needed.
- Use the functions and materialized views for trends and the raw tables for
  detail.
- The telemetry is synthetic. Do not present it as production evidence.
- Do not copy tokens, tenant IDs, workspace IDs, or resource names into files,
  commits, or issue text.
