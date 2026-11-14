# Validation and cloud acceptance

Automated checks validate software and configuration without an Azure login.
They cannot establish that your Fabric tenant, identity grants, capacity, and
Grafana instance work together. Complete the cloud checks after deployment.

## Checked snapshot: 2026-11-01

All 22 protocol/bootstrap/serving-asset tests passed, and Bicep v0.42.1 compiled
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

CI also runs the pinned collector's `validate` command against `cloud.yaml`,
`local.yaml`, and the AKS chart's `collector.yaml`. Its runtime smoke test loads
the cloud and AKS configurations through `env:OTEL_CONFIG`, replaces only the
remote exporter with a debug sink, emits all three signals, and verifies
filtering plus log-body and resource-attribute transformation. It has no cloud
credentials and cannot ingest data into Fabric.

If a local Docker daemon is already available, run the same smoke test with:

```bash
python3 scripts/smoke_collector.py
```

It starts and removes only its own container. The optional
`collector/compose.yaml` is a developer debug setup, not a requirement for the
Azure deployment.

### Terraform checks

Both roots use pinned providers and credential-free mocked **plans**, not real
Azure applies. CI checks formatting, validation, tests, and TFLint using
Terraform 1.14.3 and TFLint 0.65.0.

```bash
for directory in infra/terraform infra/terraform-state; do
  terraform -chdir="$directory" fmt -check -recursive
  terraform -chdir="$directory" init -backend=false -input=false -lockfile=readonly
  terraform -chdir="$directory" validate
  terraform -chdir="$directory" test
  tflint --chdir="$directory" --recursive
done
```

Tests cover opt-in billable resources, invalid bootstrap inputs, existing-group
ownership, managed identity wiring, internal HTTPS, shared collector/emitter
assets, a bounded manual job, scoped broker roles, and protected state storage.
Repository checks also inspect Terraform/HCL and example inputs while excluding
private variable files and generated provider directories.

Mocked plans cannot prove Azure API behavior, region/SKU availability, Fabric
permissions, RBAC propagation, or live ingestion. For a real deployment, follow
the [Terraform guide](terraform-deployment.md) and the same cloud acceptance
checks below. Do not initialize a real backend just to run offline tests.

### AKS chart checks

CI lints and renders the optional chart with Helm v4.2.0 and the placeholder
values in `k8s/aks.example.yaml`. It also confirms that the chart refuses a
namespace that the federated credential does not trust:

```bash
helm lint k8s/otel-demo --strict --namespace otel-demo --values k8s/aks.example.yaml
helm template otel-demo k8s/otel-demo --namespace otel-demo --values k8s/aks.example.yaml > /dev/null
```

The values schema rejects an ingestion URI, malformed IDs, and out-of-range
traffic settings. The unit tests cover the services' run-ID parsing, log
timestamps, case-insensitive trace-context headers, load-generator limits, the
hash-only lock file, and agreement between the chart, the Terraform federated
subject, and the cloud collector filter. Rendering does not prove admission,
image pulls, workload identity, or ingestion; use a live cluster for those.

## Cloud acceptance

Use a dedicated demo deployment and record results privately. Follow the
[deployment guide](deployment.md) to run each check.

| Check | Passing evidence |
| --- | --- |
| Azure foundation | Capacity, Grafana, and collector identity have provisioned; IDs match the selected tenant and scope. |
| Fabric bootstrap | Dedicated workspace is assigned to the intended active capacity; Eventhouse/database endpoints are returned; tables, policies, three views, and functions exist. |
| Access | Collector identity is a database ingestor; Grafana identity has Viewer on the dedicated workspace; operators have the intended Grafana roles. |
| Runtime | Collector revision is healthy and the manual job completes using the internal HTTPS endpoint. |
| Ingestion | An isolated 60-request run yields 240 spans, 60 logs, and 120 metric points in Fabric. Use Run ID for trace/log isolation and check diagnostics if incomplete. |
| Rollups | Root request count is 60 and request errors are 12; views are enabled and healthy; detail and summary time windows agree. |
| Correlation | A log's trace ID finds the four-service span chain and matching Run ID, parent relationships, service attributes, and status. |
| Visualization | Managed-identity data source passes Save & test; the three imported dashboards' queries succeed; selecting a TraceID draws its waterfall. If published, each of the three Fabric Real-Time Dashboards loads for a viewer with database read access; cross-dashboard links resolve and a pasted TraceID draws the requested waterfall. |
| Failure handling | A paused producer is visible as missing data; temporary export failure is detectable independently of successful OTLP acknowledgement. |
| AKS demo (optional) | All eight `otel-demo` pods are ready; the collector logs no export errors; `Environment == "aks"` rows keep arriving from six microservices. Successful checkout traces contain seven linked spans and six correlated logs. The Traces dashboard draws a recent multi-service waterfall without manual ID entry. |
| Cleanup | Dedicated Fabric items and Azure resources are handled separately; no recurring producer or unused billable demo resources remain. |

The generated diagram is explanatory, not acceptance evidence. Bicep compilation
and mocked Terraform plans do not prove service-region availability, capacity entitlement, valid Fabric
permissions, or successful data-plane execution.
