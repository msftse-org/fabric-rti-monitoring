# Guided demonstration

Use this sequence after [deploying the cloud building blocks](deployment.md).
Prepare the Fabric KQL query tab, the Grafana dashboards (or the Fabric Real-Time
Dashboard), and the architecture image
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
It generates 60 synthetic requests over about a minute. One producer fabricates
four service contexts: gateway, checkout, payment, and postgres. Each request
produces a four-span chain, a root-correlated log, a duration gauge sample, and a
delta counter point. Every fifth request simulates an error. These are logical
service contexts within the generated telemetry, not four deployed applications.

For one successful run into an otherwise empty database, expect **240 spans,
60 logs, 120 metric points, 60 root requests, and 12 request errors**. Ingestion may
appear in stages. The job's success means OTLP was acknowledged; verify the rows
in KQL before presenting a complete result. Save the emitted Run ID to isolate
that run's logs and traces. Run IDs stay out of metrics and summary dimensions.

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

Open **Fabric RTI Metrics** in Grafana or Fabric. Select the recent time range.
Choose **Environment =
Container Apps job** for the bounded producer, or **AKS** for the continuous
six-microservice demo. Per-service request counts, error rates, p95 latency, and
service health distinguish each hop from the root-only gateway rollups.

Open **Fabric RTI Traces**. **Find a trace** lists recent, failed, or slowest
requests. With a blank **Trace ID**, the waterfall shows the newest complete
multi-span trace. Select a TraceID in **Find a trace** to draw that request. To
follow a TraceID found in **Fabric RTI Logs**, copy it into the Traces dashboard's
**Trace ID** parameter. In Grafana, the service map shows caller-to-callee edges
with their traffic and latency, and highlights services with elevated error
rates. Fabric shows the same hops in **Calls by dependency**, a stacked bar
chart of successful and failed calls per minute, beside **Service dependencies**
with error rates and p95 latency.

The waterfall nests each span under its parent and shows its service, offset,
duration, and status. In Grafana, each span's logs appear beside it. In Fabric,
each bar starts at its span's offset and failed spans are red; **Spans in this
trace** lists status, duration, and the number of logs per span, and **Logs in
this trace** lists the logs. The manual job has four
spans. A successful AKS checkout has seven spans across gateway, checkout,
inventory, payment, shipping, and notifications, including payment's simulated
database call. Use **Logs** to search lines, filter by severity, and open a
failed request's trace from **Latest errors**.

## 6. Explain an idle period

After the job finishes, no traffic continues. The resulting gap demonstrates why
missing data, zero traffic, ingestion failure, and a real service outage need
different interpretations. This sample does not configure alert rules or
notification routes.

Finish by showing the [extension path](extending.md): introduce one workload,
define its signal contract, measure ingestion and query behavior, and add only
the operational capabilities it needs.
