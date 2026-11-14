# OpenTelemetry on Azure + Fabric

Cloud building blocks for collecting logs, traces, and metrics with OpenTelemetry,
analyzing them in Microsoft Fabric Eventhouse, and exploring them in Azure Managed
Grafana. A bounded synthetic telemetry job makes the flow demonstrable before an
application exists.

![Architecture: a finite Azure Container Apps job and six continuous AKS microservices send OTLP to their own internal OpenTelemetry Collectors; managed and workload identities connect the collectors to Fabric Eventhouse. On the Consume side, KQL, MCP, and REST serve dashboards and apps (Grafana, Real-Time Dashboards, Power BI, Fabric apps), exploration (KQL queryset with Copilot, notebooks, OneLake), alerting (Activator, operations agent), and AI agents (Eventhouse, Fabric RTI, and Grafana MCP servers, Agent Skills, and the Fabric data agent).](docs/assets/architecture-azure.png)

## What you can demonstrate

| Capability | What the sample shows |
| --- | --- |
| Open instrumentation | One producer emits OTLP logs, metrics, and traces across four synthetic service contexts. |
| Managed ingestion | A collector on Azure Container Apps uses managed identity to write to a Fabric KQL database. |
| Correlated investigation | Run, trace, and span IDs connect detailed records; metrics use bounded dimensions. |
| Incremental aggregation | Three materialized views maintain minute-level log, request, and metric summaries. |
| Reusable query contracts | KQL functions serve the overview; raw tables support detailed investigation. |
| Visualization | Three Grafana dashboards (metrics, logs, traces) and three matching native Fabric Real-Time Dashboards. Both Traces dashboards have a trace waterfall and a service dependency view. |
| AI agent access | MCP servers for Eventhouse and Grafana, plus an included Agent Skill, let GitHub Copilot and other agents investigate the same telemetry. |
| Repeatable setup | Bicep or Terraform defines Azure resources; a separate Fabric REST bootstrap creates analytics items and applies KQL. |
| Continuous workload (optional) | Instrumented services on AKS send telemetry continuously through an in-cluster collector that uses workload identity. |

## Start in Azure

Follow the [Bicep deployment guide](docs/deployment.md) or
[Terraform deployment guide](docs/terraform-deployment.md) to provision the foundation,
bootstrap Fabric, start the collector, and run the synthetic job. Resource switches
are off by default so creating billable services is an explicit choice. No local
Docker runtime, application deployment, Kubernetes cluster, or custom image build
is required for the Azure demonstration. For live dashboards, the optional
[AKS workload demo](docs/aks-demo.md) adds a small Terraform-managed cluster with
instrumented services and continuous traffic.

Then use the [guided demonstration](docs/demo-guide.md) to walk through a healthy
signal, a simulated error, the materialized summaries, and a correlated trace.

## Understand the design

- [Architecture and data flow](docs/architecture.md) - component boundaries,
  identity, and the three deployment surfaces.
- [Consume the telemetry](docs/consume.md) - dashboards, Power BI, notebooks,
  Activator, and AI agents through MCP servers, Agent Skills, and the Fabric
  data agent.
- [KQL and materialized views](docs/kql-and-materialized-views.md) - raw tables,
  aggregation semantics, retention, and serving functions.
- [Security and operations](docs/security-and-operations.md) - sample boundaries,
  access, failure modes, and cost controls.
- [Validation](docs/validation.md) - automated checks and a separate cloud
  acceptance checklist.
- [Extending the sample](docs/extending.md) - how to introduce your own workloads
  and decide which additional capabilities to add.
- [Buffered ingestion option](docs/buffered-architecture.md) - Event Hubs
  foundation and a separate Eventstream, raw-data, deduplication, and exemplar design.
- [AKS workload demo](docs/aks-demo.md) - optional cluster, Helm chart, workload
  identity, cost, and teardown.
- [Mock observability apps](docs/mock-apps.md) - three optional Rayfin apps that
  imitate Datadog, Coralogix, and groundcover on top of the same telemetry, and
  an on-call app that compares Datadog On-Call with Fabric Real-Time Intelligence.

## Repository map

| Path | Contents |
| --- | --- |
| [`infra/`](infra/) | Bicep and Terraform foundation, collector/job hosting, and optional broker. |
| [`infra/terraform-state/`](infra/terraform-state/) | Separate, optional Entra-authenticated Terraform state-storage bootstrap. |
| [`scripts/bootstrap-fabric.py`](scripts/bootstrap-fabric.py) | Fabric workspace, Eventhouse, and KQL database setup. |
| [`scripts/deploy-fabric-dashboard.py`](scripts/deploy-fabric-dashboard.py) | Creates or updates the three subject-specific Fabric Real-Time Dashboards. |
| [`collector/`](collector/) | Cloud collector configuration and optional developer configurations. |
| [`demo/emit.py`](demo/emit.py) | Dependency-free synthetic OTLP producer, also embedded in the Azure job. |
| [`k8s/`](k8s/) | Optional AKS Helm chart: collector, instrumented services, and load generator. |
| [`fabric/`](fabric/) | Versioned schema, materialized views, functions, example queries, and the three Real-Time Dashboard definitions. |
| [`grafana/`](grafana/) | Managed-identity data source and importable metrics, logs, and traces dashboards. |
| [`apps/`](apps/) | Optional Rayfin mock apps (Datadog, Coralogix, groundcover), a Fabric RTI on-call app, their shared on-call engine, and the shared read-only telemetry layer. |
| [`.github/skills/`](.github/skills/) | Agent Skill that teaches AI agents the telemetry schema and investigation queries. |
| [`docs/`](docs/) | Deployment, explanation, operations, and presentation material. |

This is a focused reference sample. Automated validation checks the templates and
software contracts; a deployment in your tenant still needs the cloud acceptance
steps. It does not provision alert rules or an end-to-end private network.

The diagrams are generated illustrations with official product assets; the IaC,
collector configuration, KQL, and [editable diagrams](docs/diagrams/) define the
technical contract. See [asset sources and notices](docs/assets/README.md).

## References and license

Microsoft documents the [OpenTelemetry exporter for Fabric
Eventhouse](https://learn.microsoft.com/en-us/azure/data-explorer/open-telemetry-connector)
and [Managed Grafana data
sources](https://learn.microsoft.com/en-us/azure/managed-grafana/how-to-data-source-plugins-managed-identity).
Use [CONTRIBUTING.md](CONTRIBUTING.md) for changes.

Sample code is [MIT licensed](LICENSE). Third-party software and product assets
retain their respective licenses and usage terms in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
