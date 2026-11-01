# Extending the sample

Start with one workload and an explicit signal contract. Replace the synthetic
producer after proving the complete ingestion and query path in your tenant.

## Introduce a workload

1. Instrument the workload with its supported OpenTelemetry SDK or agent. Set
   stable service, version, and environment resource attributes and propagate
   W3C trace context between components.
2. Decide how the workload reaches a trusted collector. The current ingress
   accepts callers from one Container Apps environment. Workloads elsewhere
   require a deliberate network and authentication design.
3. Replace the demo filter and attribute policy with reviewed workload-specific
   controls. The default filter intentionally drops non-demo signals.
4. Keep trace/request identifiers in detail records. Use bounded dimensions for
   metrics and recurring aggregate queries.
5. Add or version the KQL views and functions for your actual questions. Confirm
   counter temporality, histogram handling, error definitions, time grains, and
   query performance. The sample demonstrates scalar gauge and delta-counter
   points; it is not a full metrics semantic model.
6. Validate failure behavior as well as successful ingestion before operational
   adoption. Decide acceptable data loss, buffering, retention, and recovery.

## Add capabilities when the scenario needs them

| Need | Potential next step |
| --- | --- |
| Existing Azure resource diagnostics | Evaluate Event Hubs/Eventstream or other supported connectors separately from the OTLP path. |
| Buffered telemetry handoff | Use the [buffered architecture guide](buffered-architecture.md) and optional Event Hubs Bicep foundation; complete the additional Kafka/Eventstream/projection profile separately. |
| Higher-volume recurring queries | Measure materialized-view cardinality and cost; choose appropriate partitioning, cache, and retention. |
| Alerting | Add freshness/error/latency rules, explicit no-data and query-error behavior, contact points, and delivery tests. |
| Detailed trace visualization | Add a trace waterfall or service-dependency view while preserving trace correlation. |
| Multi-team use | Define dedicated workspaces/databases and deployment identities, data access boundaries, and query governance. |
| Repeated deployments | Add environment-specific CI with workload federation and explicit deployment gates. Current CI validates without Azure credentials. |
| Production resilience | Review durable buffering, resource redundancy, network isolation, collector self-monitoring, and tested recovery. |

Microsoft Fabric also supports other data and reporting experiences. They can be
introduced after the initial telemetry path is understood; they are not implicit
parts of this deployment.
