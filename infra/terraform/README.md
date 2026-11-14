# Terraform infrastructure

An alternative to the existing Bicep deployment, not a replacement or automatic
migration. Follow the [Terraform deployment guide](../../docs/terraform-deployment.md)
for backend setup, staged deployment, Fabric grants, and the synthetic job.

| Path | Responsibility |
| --- | --- |
| `main.tf` | Root orchestration and shared naming/tags. |
| `providers.tf`, `terraform.tf`, `backend.tf` | Pinned AzureRM provider, Terraform constraints, and partial Entra-authenticated Azure Storage backend. |
| `modules/foundation/` | New or existing resource group, collector identity, optional Fabric capacity and Managed Grafana. |
| `modules/collector/` | Collector, manual synthetic job, Container Apps environment, and platform diagnostics. |
| `modules/event_hubs/` | Optional broker and scoped sender/receiver roles, not an Eventstream pipeline. |
| `modules/aks/` | Optional AKS cluster, Entra RBAC administrator roles, and a federated credential that lets the in-cluster collector use the collector identity. See the [AKS workload demo](../../docs/aks-demo.md). |
| `tests/` | Credential-free mocked plan tests. |
| `devenv.tfvars.example`, `backend.hcl.example` | Templates for private environment and backend inputs. |
| [`../terraform-state/`](../terraform-state/) | Separate, optional state-storage bootstrap. |

Names use environment/type/project prefixes; globally unique names add a stable
suffix. The Grafana prefix is shortened when needed to fit the provider's limit.
Default tags are `Environment`, `Project`, `ManagedBy`, and `Purpose`.
The shared collector configuration and emitter are loaded from their existing
repository files, not copied into this tree.

All five billable feature flags default to false. The default application plan
creates only a resource group and the collector identity. The separate backend
bootstrap does create billable storage if explicitly applied.

**Terraform tracks resource lifecycle.** Turning an enabled flag off plans
deletion of its managed resources. Preserve the same private variable file
between stages, review every plan, and never let Bicep and Terraform own the
same resource.

For local checks that do not access Azure:

```bash
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform test
tflint --chdir=infra/terraform --recursive
```

Commit `.terraform.lock.hcl`. Do not commit state, saved plans, private variable
files, backend configuration, or credentials.
