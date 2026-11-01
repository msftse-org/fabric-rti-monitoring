# Validation and cloud acceptance

Automated checks validate software and configuration without an Azure login.
They cannot establish that your Fabric tenant, identity grants, capacity, and
Grafana instance work together. Complete the cloud checks after deployment.

## Checked snapshot: 2026-11-01

All 21 protocol/bootstrap/serving-asset tests passed, and Bicep v0.42.1 compiled
the templates and default parameters. The official, checksum-verified
OpenTelemetry Collector Contrib v0.141.0 macOS ARM64 executable validated both
configurations, including cloud configuration loaded through `env:OTEL_CONFIG`.
A native-process run of the smoke-test logic verified real OTLP HTTP traffic,
three-signal export to a debug sink, filtering, and sample transformations.

The CI workflow defines the separate Linux container checks. Azure runtime,
Fabric schema execution and ingestion, managed identity access, and Grafana
rendering still require the cloud acceptance steps below.

## Automated checks

From the repository root:

```bash
python3 -m unittest discover -s tests -v
python3 scripts/validate_repository.py
az bicep build --file infra/main.bicep --outfile /tmp/fabric-rti.json
az bicep build-params --file infra/main.bicepparam --outfile /tmp/fabric-rti.parameters.json
```

The tests exercise the actual synthetic OTLP HTTP wire contract, parent/child/log
correlation, metric dimensions, rejected partial-success responses, and Fabric
bootstrap behavior including long-running operations, pagination, reuse, and
untrusted operation URLs. Asset checks validate JSON and local documentation links
and check for obvious secrets. They are not a comprehensive secret detector or
KQL execution engine.

CI also runs the pinned collector's `validate` command against `cloud.yaml` and
`local.yaml`. Its runtime smoke test loads the cloud configuration through
`env:OTEL_CONFIG`, replaces only the remote exporter with a debug sink, emits all
three signals, and verifies filtering plus log-body and resource-attribute
transformation. It has no cloud credentials and cannot ingest data into Fabric.

If a local Docker daemon is already available, run the same smoke test with:

```bash
python3 scripts/smoke_collector.py
```

It starts and removes only its own container. The optional
`collector/compose.yaml` is a developer debug setup, not a requirement for the
Azure deployment.

## Cloud acceptance

Use a dedicated demo deployment and record results privately. Follow the
[deployment guide](deployment.md) to run each check.

| Check | Passing evidence |
| --- | --- |
| Azure foundation | Capacity, Grafana, and collector identity have provisioned; IDs match the selected tenant and scope. |
| Fabric bootstrap | Dedicated workspace is assigned to the intended active capacity; Eventhouse/database endpoints are returned; tables, policies, three views, and functions exist. |
| Access | Collector identity is a database ingestor; Grafana identity has Viewer on the dedicated workspace; operators have the intended Grafana roles. |
| Runtime | Collector revision is healthy and the manual job completes using the internal HTTPS endpoint. |
| Ingestion | An isolated 60-request run yields 120 spans, 60 logs, and 120 metric points in Fabric. Check exporter/ingestion diagnostics if incomplete. |
| Rollups | Root request count is 60 and request errors are 12; views are enabled and healthy; detail and summary time windows agree. |
| Correlation | A log's trace ID finds its root and child spans, with matching status and service attributes. |
| Visualization | Managed-identity data source passes Save & test; imported dashboard queries succeed; trace selection updates detail. |
| Failure handling | A paused producer is visible as missing data; temporary export failure is detectable independently of successful OTLP acknowledgement. |
| Cleanup | Dedicated Fabric items and Azure resources are handled separately; no recurring producer or unused billable demo resources remain. |

The generated diagram is explanatory, not acceptance evidence. Bicep compilation
does not prove service-region availability, capacity entitlement, valid Fabric
permissions, or successful data-plane execution.
