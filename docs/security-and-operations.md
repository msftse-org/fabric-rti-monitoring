# Security and operations

## Identity and network boundaries

The cloud collector uses its user-assigned managed identity and a database
Ingestor grant. Managed Grafana uses a different system-assigned identity with
Viewer access to the dedicated Fabric workspace. A Grafana administrator role
controls dashboard administration; it does not replace Fabric permissions.
No application secret, service-principal password, or Grafana API key is needed
for the primary cloud path.

The OTLP ingress is reachable only from the same Container Apps environment.
The synthetic job calls its HTTPS FQDN, which forwards to receiver port 4318.
This internal application ingress is not VNet isolation. Fabric and Grafana use
their service endpoints, and Grafana's public endpoint uses Entra authentication.
Restrict who can deploy code into the collector's environment: the baseline has
no per-producer authentication inside that trusted boundary.

For a workload that needs a private network, design Container Apps VNet
integration, outbound access, name resolution, and supported Fabric/Grafana private
connectivity together. Those are additional infrastructure decisions, not settings
already delivered by this sample.

## Data handling

The producer emits only fabricated data. The collector requires `demo.synthetic`
and fixed demo span/metric names, keeps a short list of resource and record
attributes, replaces log bodies, clears span status messages, and drops span
events. The marker is a selector, not authentication. Allowed attribute values,
links, scope metadata, and other fields can still carry sensitive content if a
different producer is connected. Define and verify a workload-specific data
contract before accepting real traffic.

Keep credentials and environment output outside the repository. Private parameter
and generated JSON files use `*.local.bicepparam` and `*.local.json`, which are
ignored. Do not upload actual telemetry, portal exports, deployment output, or
tokens as an issue attachment or test fixture.

## Reliability and troubleshooting

| Symptom | Check first |
| --- | --- |
| Job cannot reach collector | Same Container Apps environment, collector readiness, internal HTTPS FQDN, and no `:4318` suffix on that FQDN. |
| Collector cannot export | Active Fabric capacity, query URI instead of ingestion URI, UAMI client ID, database ingestor grant, and identity propagation. |
| OTLP succeeds but tables are empty | Exporter diagnostics and ingestion failures; an acknowledgement is not end-to-end ingestion proof. Managed streaming can fall back to queued ingestion. |
| Raw rows exist but summary is unexpected | Root-span filter, time range, matching service/environment, materialized-view health, and whether the view was created before the data arrived. |
| Grafana query fails | Data source query URI, database name, managed identity Viewer grant, imported data source selection, and exact query error. |
| Charts stop after a minute | The producer is a finite manual job. Check execution status, then start another run if needed. |

The collector has one warm replica, memory limits, batching, retries, and a bounded
**in-memory** sending queue. Restarting the replica loses queued records. An outage
that exceeds the retry window or queue capacity can drop telemetry. The sample
does not implement durable buffering, exactly-once delivery, multi-region recovery,
or end-to-end availability guarantees.

Use Container Apps platform and console logs in the dedicated Log Analytics
workspace to investigate the pipeline itself. Do not set the cloud exporter to
debug payload logging for real data. Add independent ingestion freshness and
collector-health monitoring before relying on this path operationally.

## Cost and lifecycle

All billable deployment switches default to false. A user-assigned identity is
created by the foundation. Opting into the cloud demo creates resources whose
costs continue outside a presentation:

| Resource | Main cost drivers | Control |
| --- | --- | --- |
| Fabric capacity | SKU, active time, and workload demand. | Reuse an appropriate active capacity or explicitly create one; pause a dedicated demo capacity after use. |
| Eventhouse | Ingestion, query/materialization workload, and retained data. | Bounded producer; 7-day raw and 30-day aggregate retention; minimum-consumption setting starts at zero. |
| Container Apps | One warm collector replica and manual job executions. | No scheduled producer; remove idle demo runtime when finished. |
| Managed Grafana | Standard instance and applicable service charges. | Remove dedicated demo instances after use; pausing Fabric does not stop Grafana charges. |
| Log Analytics | Platform log ingestion and retention. | Only pipeline diagnostics; 30-day retention. |

A small starting SKU is not a capacity or performance guarantee. Measure data
volume, ingestion latency, query time, materialization health, and cost before
changing throughput, retention, dimensions, or replica count. Get current regional
estimates from the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/).

Changing a Bicep flag to false does not delete an existing resource in an
incremental deployment. Azure resource-group deletion also does not delete a
Fabric workspace. Follow the separate Fabric and Azure cleanup steps in the
[deployment guide](deployment.md), using a dedicated demo scope whose data you can
remove.
