# Guided demonstration

Use this sequence after [deploying the cloud building blocks](deployment.md).
Prepare the Fabric KQL query tab, the Grafana dashboard, and the architecture image
before the session. Show only the dedicated synthetic workspace.

## 1. Explain the interfaces

Start with the [architecture](architecture.md). The producer speaks OTLP, the
collector handles collection policy and export, Eventhouse holds typed data and
incremental summaries, and Grafana reads KQL results. Managed identities give the
collector write access and the dashboard read access separately.

The sample does not need an application because the manual job supplies the same
three signal types an instrumented workload would send.

## 2. Create a short burst of activity

Start the job from the Azure portal or use the command in the deployment guide.
It generates 60 synthetic requests over about a minute. Each request produces a
root span, a child span, a correlated log, a duration gauge sample, and a delta
counter point. Every fifth request simulates an error.

For one successful run into an otherwise empty database, expect **120 spans,
60 logs, 120 metric points, 60 root requests, and 12 request errors**. Ingestion may
appear in stages. The job's success means OTLP was acknowledged; verify the rows
in KQL before presenting a complete result.

## 3. Query the raw records

Use the first-signal queries in [fabric/queries.kql](../fabric/queries.kql). Show
the service and environment attributes, the timestamps, and a log's trace ID.
The data is synthetic and its log body is fixed by the collector.

Explain the two distinct delays: telemetry must first arrive in Eventhouse, then
materialization progresses. A view-name query also reads the unmaterialized delta.

## 4. Show the incremental serving layer

Open [schema.kql](../fabric/schema.kql) and find `Requests1m`. Point out its time
bucket, bounded grouping keys, root-span filter, counts, duration sum, and t-digest.
Run `RequestsOverview(1h)` and compare it with the raw root spans.

This is the useful distinction between retaining detailed events and maintaining
compact answers to recurring questions. Explain that views consume compute and
storage, and that actual query performance must be measured for the workload.

## 5. Move from overview to an individual request

In Grafana, select the recent time range. Walk through request counts, error
counts, approximate latency percentiles, gauge statistics, and recent logs.
Select a trace ID from the log table or paste it into the **Trace ID** field.
The detail panel shows the root and its child span with their duration and status.

The dashboard provides a bounded span table. It is not a full trace waterfall UI
or service map. Those are possible additions when introducing a workload.

## 6. Explain an idle period

After the job finishes, no traffic continues. The resulting gap demonstrates why
missing data, zero traffic, ingestion failure, and a real service outage need
different interpretations. This sample does not configure alert rules or
notification routes.

Finish by showing the [extension path](extending.md): introduce one workload,
define its signal contract, measure ingestion and query behavior, and add only
the operational capabilities it needs.
