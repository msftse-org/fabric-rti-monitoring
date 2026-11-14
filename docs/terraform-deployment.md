# Deploy with Terraform

Terraform is an additive alternative to [Bicep](deployment.md). Both paths use
the same collector configuration, synthetic emitter, Fabric bootstrap, KQL, and
Grafana assets. Terraform provisions Azure resources; it does not manage Fabric
workspace items or run the producer automatically.

The layout follows the development-environment conventions: root orchestration,
focused local modules, environment/project naming, environment variable files,
shared tags, and a separate state-storage bootstrap. AzureRM is pinned to 5.12.0;
Terraform 1.11 or later is required, with 1.14.3 used in CI. Provider lock files
are committed. Resource-group deletion protection remains enabled.

**Choose one infrastructure owner.** This is not an import or migration of an
existing Bicep deployment. Generated names differ; use a separate dedicated
resource group for a new Terraform deployment. Adoption of existing resources
requires explicit name alignment and a reviewed import/migration plan.

## 1. Select the account and inputs

Install Terraform, Azure CLI, and Python 3.10 or later. No local Docker or custom
container build is required; the optional AKS demo also needs `kubectl`,
kubelogin, and Helm. Run all commands from the repository root.

```bash
az login --tenant '<tenant UUID>'
az account set --subscription '<subscription UUID>'
export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
export TF_VAR_subscription_id="$ARM_SUBSCRIPTION_ID"

cp infra/terraform/devenv.tfvars.example infra/terraform/devenv.local.tfvars
```

Edit the private variable file for the selected region, environment, and project.
The default name is `dev-rg-frti`. To use an existing **dedicated** resource group
without managing its lifecycle, set `create_resource_group = false` and provide
`resource_group_name`.

All billable application flags default to false: `deploy_fabric_capacity`,
`deploy_managed_grafana`, `deploy_collector`, `deploy_event_hubs`, and
`deploy_aks`. An identity
and an optional new resource group have no standalone charge. Enabling services
incurs their normal charges; the collector stays warm between manual job runs.

The Azure permissions, service-region availability, and Fabric permissions in
the [deployment prerequisites](deployment.md#prerequisites) still apply. Provider
auto-registration is disabled. A subscription administrator must register the
providers required by enabled features: `Microsoft.ManagedIdentity`,
`Microsoft.Dashboard`, `Microsoft.App`, `Microsoft.OperationalInsights`,
`Microsoft.Insights`, plus `Microsoft.Fabric` for a new capacity,
`Microsoft.EventHub` for the broker, `Microsoft.ContainerService` for AKS, and
`Microsoft.Storage` for new backend storage.

## 2. Configure remote state

### Reuse approved state storage

Use an existing private blob container with Entra data-plane access. The
operator needs Storage Blob Data Contributor on the state container or an
appropriate parent scope. Do not copy another project's blob key.

```bash
cp infra/terraform/backend.hcl.example infra/terraform/backend.local.hcl
```

Fill in the storage resource group, account, and container. Keep a distinct key
such as `fabric-rti-monitoring/dev/infrastructure.tfstate`. For a backend in a
different subscription, also set its `subscription_id` in this private backend
file. Backend authentication is separate from Terraform input variables; the
example otherwise uses `ARM_SUBSCRIPTION_ID` and the Azure CLI login.

Use a separate working directory and state key for each environment. State and
saved plan files can contain sensitive resource data even when authentication
is keyless. Do not commit them, account-specific backend files, or credentials.

### Optionally bootstrap new state storage

Skip this subsection when reusing an existing backend. The separate
[`infra/terraform-state/`](../infra/terraform-state/) root creates billable GRS
storage, recovery controls, a private container, a scoped data role, and a
deletion lock. It initially uses local state.

```bash
cp infra/terraform-state/devenv.tfvars.example infra/terraform-state/devenv.local.tfvars
```

Edit its region, environment, and project to match the intended deployment.
Optionally set `allowed_ips` to operator/runner public egress IPs. The default
explicitly enables public network access but still requires Entra authorization.

> **Governed subscriptions.** Some tenants enforce a policy that forces
> `publicNetworkAccess` to `Disabled` on every storage account (for example an
> MCAPS "SFI-NS2.2.1" modify policy). Azure then silently reverts any change, and
> `terraform init` against the new backend fails with `403 AuthorizationFailure`
> even though the role assignment exists. Do not try to bypass the guardrail.
> Use an approved backend that you can reach over a private network path, or
> follow [local state](#use-local-state-when-no-reachable-backend-exists).

```bash
terraform -chdir=infra/terraform-state init -input=false -lockfile=readonly
terraform -chdir=infra/terraform-state plan -var-file=devenv.local.tfvars -out=bootstrap.tfplan
terraform -chdir=infra/terraform-state show bootstrap.tfplan
terraform -chdir=infra/terraform-state apply bootstrap.tfplan

terraform -chdir=infra/terraform-state output -raw backend_config \
  > infra/terraform/backend.local.hcl
```

Creating the scoped role requires role-assignment permission as well as resource
creation access. Entra RBAC propagation can delay container creation. If it
returns an authorization error after the role exists, allow propagation and
review a new plan before retrying; do not enable shared keys to work around it.
Additional operators and CI identities need their own least-privilege grants.

Keep the bootstrap state secure and recoverable. To migrate it to remote state,
first back it up, add an `azurerm` backend block to that root, prepare a separate
private backend file with a key such as
`fabric-rti-monitoring/dev/bootstrap.tfstate`, then use `terraform init
-migrate-state` with that file. Never migrate it onto the application state key.
The deletion lock is a control-plane safeguard, not immutable blob storage.

### Use local state when no reachable backend exists

For a single-operator proof of concept, or when policy blocks a reachable remote
backend, keep state on the operator machine with an override file. Terraform
merges `*_override.tf` over `backend.tf`, and the repository ignores both the
override file and `*.tfstate`:

```hcl
# infra/terraform/backend_override.tf
terraform {
  backend "local" {
    path = "terraform.local.tfstate"
  }
}
```

Run `terraform init -input=false -lockfile=readonly` without `-backend-config`.
The state file is then the only record of the deployed resources. Back it up
securely before you rely on it, and never commit it. Migrate it to a reachable
backend with `terraform init -migrate-state` once one exists.

## 3. Provision the foundation

For the full Grafana demonstration, edit `devenv.local.tfvars` to enable
`deploy_managed_grafana` and set `grafana_admin_principal_id` to an Entra **object
ID**. For an interactive user, obtain it with:

```bash
az ad signed-in-user show --query id -o tsv
```

Set `grafana_admin_principal_type` to `User`, `Group`, or `ServicePrincipal` as
appropriate. The explicit Grafana Admin role is scoped to the instance. Its
system identity receives Fabric access separately.

The native AzureRM resource does not expose Bicep's `creatorCanAdmin` setting.
Supply the intended administrator explicitly and verify creator access during
cloud acceptance rather than assuming an omitted API property disables it.

Keep `deploy_collector = false` until the database and ingestion grant exist.
Leave `deploy_fabric_capacity = false` to reuse an eligible active capacity or
trial. If a new billable capacity is necessary, enable it explicitly and supply
`fabric_capacity_administrators` and the desired `fabric_capacity_sku`.

```bash
terraform -chdir=infra/terraform init -input=false -lockfile=readonly -backend-config=backend.local.hcl
terraform -chdir=infra/terraform plan -var-file=devenv.local.tfvars -out=foundation.tfplan
terraform -chdir=infra/terraform show foundation.tfplan
terraform -chdir=infra/terraform apply foundation.tfplan

export COLLECTOR_CLIENT_ID="$(terraform -chdir=infra/terraform output -raw collector_identity_client_id)"
export COLLECTOR_TENANT_ID="$(terraform -chdir=infra/terraform output -raw tenant_id)"
export GRAFANA_PRINCIPAL_ID="$(terraform -chdir=infra/terraform output -raw grafana_principal_id)"
export GRAFANA_ENDPOINT="$(terraform -chdir=infra/terraform output -raw grafana_endpoint)"
```

The collector client ID selects its user-assigned identity and is used in the
KQL `aadapp` grant. The collector principal ID output is instead its object ID
for Azure RBAC. Grafana's principal ID is also an object ID.

## 4. Bootstrap Fabric and grant ingestion

List eligible capacities and select the intended active capacity:

```bash
python3 scripts/bootstrap-fabric.py --list-capacities
export FABRIC_CAPACITY_ID='<Fabric capacity UUID>'
mkdir -p output

python3 scripts/bootstrap-fabric.py \
  --capacity-id "$FABRIC_CAPACITY_ID" \
  --workspace-name fabric-rti-terraform-observability \
  --eventhouse-name observability \
  --database-name Observability \
  --grafana-principal-id "$GRAFANA_PRINCIPAL_ID" \
  > output/fabric.local.json
```

If Grafana was left disabled, omit `--grafana-principal-id`. Its output is empty
until an instance is enabled. The optional `fabric_capacity_arm_id` Terraform
output is an **ARM ID**, not the Fabric capacity UUID accepted by this script.

Use a dedicated workspace for the Grafana Viewer grant. The bootstrap creates or
reuses the workspace, Eventhouse, and database and applies the shared schema for
a new database/Eventhouse. Review [bootstrap reuse and schema
updates](deployment.md#3-bootstrap-the-fabric-workspace-and-database) before
reusing existing items.

Read `queryServiceUri` and the actual `databaseName` from `output/fabric.local.json`.
Database casing can differ from the requested display name. As a database
administrator, run the following in that database's Fabric query editor,
replacing the database identifier and identity placeholders:

```kusto
.add database ['<databaseName>'] ingestors ('aadapp=<COLLECTOR_CLIENT_ID>;<COLLECTOR_TENANT_ID>')
```

The grant uses the collector **client ID**, not its object ID. The bootstrap does
not execute this permission command. Azure resource roles do not grant Fabric
database access.

## 5. Enable the runtime and run the producer

Update the **same** private variable file: set `deploy_collector = true`,
`kusto_cluster_uri` to `queryServiceUri`, and `kusto_database` to `databaseName`.
Use the query URI, never `ingestionServiceUri`. Preserve previously enabled
flags and administrator values.

```bash
terraform -chdir=infra/terraform plan -var-file=devenv.local.tfvars -out=runtime.tfplan
terraform -chdir=infra/terraform show runtime.tfplan
terraform -chdir=infra/terraform apply runtime.tfplan

export RESOURCE_GROUP="$(terraform -chdir=infra/terraform output -raw resource_group_name)"
export COLLECTOR_APP="$(terraform -chdir=infra/terraform output -raw collector_app_name)"
export DEMO_JOB="$(terraform -chdir=infra/terraform output -raw demo_job_name)"

az containerapp job start --name "$DEMO_JOB" --resource-group "$RESOURCE_GROUP"
az containerapp job execution list --name "$DEMO_JOB" --resource-group "$RESOURCE_GROUP" -o table
```

The collector accepts HTTPS only from inside its Container Apps environment.
It is not a VNet-isolated/private-endpoint deployment, and its endpoint cannot
be called directly from a laptop. The job emits 60 requests, then stops without
automatic retries; it is not scheduled.

Use the [data and correlation checks](deployment.md#7-verify-data-aggregation-and-correlation)
and [Grafana configuration](deployment.md#8-configure-grafana-and-import-the-dashboards) to complete
the demonstration. Terraform does not configure the Grafana data source or
import the dashboards. To add the native Fabric view, follow
[Publish the Fabric Real-Time Dashboards](deployment.md#9-publish-the-fabric-real-time-dashboards-optional).
Offline mocks do not prove live service availability,
Fabric grants, ingestion, or dashboard rendering.

## Optional Event Hubs foundation

Set `deploy_event_hubs = true` and provide the existing Fabric workspace
identity's **object ID** as `fabric_workspace_identity_principal_id`. Review a
new plan using the same private variable file. This creates a Standard namespace,
one hub, the `fabric` consumer group, and hub-scoped sender/receiver grants.
Local authentication is disabled.

This does not change collector routing, create a Fabric connection/Eventstream,
or implement replay/projection/deduplication. Complete those separate pieces in
the [buffered architecture](buffered-architecture.md) before claiming buffered
ingestion works.

## Optional AKS workload demo

After step 4, set `deploy_aks = true` and `aks_admin_principal_id` to add a
small AKS cluster whose in-cluster collector reuses the collector identity
through workload identity. Install the Helm chart for continuous telemetry. See
the [AKS workload demo](aks-demo.md) for the plan, the Helm install, verification,
cost, and teardown. Setting `deploy_aks` back to false deletes the cluster.

## Lifecycle and cleanup

Unlike Bicep incremental deployment, **setting a Terraform feature flag back to
false plans destruction of its managed resources**. Omitting the private
variable file can have the same effect by restoring defaults. Review all
deletions/replacements and use the same inputs for every stage.

Terraform only removes resources it owns, but deleting a managed resource group
can also affect resources created outside Terraform. Default resource-group
deletion protection remains enabled; do not disable it to bypass unexpected
contents. An existing group selected with `create_resource_group = false` is
looked up, not managed.

Fabric items are separate from Azure resources. Follow the [Fabric cleanup
guidance](deployment.md#cleanup) and explicitly review Azure destruction when
finished. Keep state storage and its recovery data until the application
lifecycle is complete; its separate root and deletion lock are intentional.
Stopping the manual producer does not stop collector, Grafana, storage, or
capacity costs.

### Switching an existing Bicep deployment to Terraform

Terraform creates a new stack with environment-first names; it does not adopt
Bicep resources, and the two tools must never own the same resources. After
deleting the Bicep resource group, the reused Fabric workspace still holds grants
for the removed identities. Re-run the bootstrap with the **new**
`--grafana-principal-id` and the existing `--workspace-id`, grant the new collector
identity as database `ingestors`, and remove the old collector grant
(`.drop database ['<databaseName>'] ingestors ('aadapp=<OLD_CLIENT_ID>;<TENANT_ID>')`)
and the old Grafana workspace role manually. The bootstrap never deletes anything.
