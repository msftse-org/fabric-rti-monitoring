# Deploy the Azure demonstration

This guide creates a cloud-hosted OpenTelemetry collector, a bounded synthetic
telemetry job, a Fabric Eventhouse and an Azure Managed Grafana dashboard. No
application, local container runtime or custom container build is required.

Deployment has three stages: provision Azure identities and visualization,
bootstrap Fabric and grant ingestion access, then start the collector. This order
lets the collector authenticate with a managed identity from its first start.

The checked-in parameters create only a user-assigned managed identity, which has
no standalone charge. This guide explicitly enables billable Grafana and collector
resources. A new Fabric capacity is optional if an appropriate active capacity or
trial is already available. Review [cost and operations](security-and-operations.md) before
deploying. The sample has local validation; live Azure/Fabric deployment and
end-to-end acceptance have not been executed for this repository.

## Prerequisites

- A current Azure CLI, Bicep CLI available through `az bicep`, and Python 3.10 or
  later on the deployment workstation. Python uses only its standard library.
- An Azure subscription and a region supporting the selected Fabric and Managed
  Grafana services. The examples use `westeurope`; confirm availability and data
  residency for your tenant.
- Permission to create resources in the demo resource group and to create its
  Grafana role assignment, for example Contributor plus Role Based Access Control
  Administrator at the appropriate scope. A subscription administrator may need
  to register the required providers: `Microsoft.ManagedIdentity`,
  `Microsoft.Dashboard`, `Microsoft.App`, `Microsoft.OperationalInsights`,
  `Microsoft.Insights`, and `Microsoft.Fabric` when creating a capacity.
- Fabric permission to create workspaces and assign the chosen capacity. The
  bootstrap identity needs Contributor or Admin permission on that capacity. The
  newly created dedicated workspace gives its creator administrative access.
- If bootstrapping through a service principal instead of an interactive user,
  the relevant Fabric tenant settings must allow that identity to use Fabric APIs
  and create workspaces. See [workspace API prerequisites](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/create-workspace).

Run the commands from the repository root. Use a dedicated demo resource group
and Fabric workspace so the final cleanup does not affect other workloads.
If the Bicep CLI is missing, install it with `az bicep install` before compiling.

## 1. Select the tenant and subscription

```bash
export AZURE_TENANT_ID='<tenant UUID>'
export AZURE_SUBSCRIPTION_ID='<subscription UUID>'
export RESOURCE_GROUP='rg-fabric-rti-demo'
export LOCATION='westeurope'
export FOUNDATION_DEPLOYMENT='fabric-rti-foundation'
export RUNTIME_DEPLOYMENT='fabric-rti-runtime'

az login --tenant "$AZURE_TENANT_ID"
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az account show --query '{subscription:id,tenant:tenantId}' -o table
az bicep version

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
```

Use an identity authorized for both the selected Azure subscription and Fabric
tenant. Azure resource access alone does not grant Fabric data access.

## 2. Deploy the identity and Grafana foundation

Create a private parameter file. Files ending in `.local.bicepparam` are ignored
by Git.

```bash
cp infra/main.bicepparam infra/main.local.bicepparam
az ad signed-in-user show --query id -o tsv
```

Use the returned **user object ID** as `grafanaAdminPrincipalId`. Edit the private
file to contain the following values:

```bicep
using './main.bicep'

param deployFabricCapacity = false
param deployManagedGrafana = true
param deployCollector = false
param grafanaAdminPrincipalId = '<Microsoft Entra user object ID>'
param grafanaAdminPrincipalType = 'User'
```

To grant a group or service principal Grafana administration, use its object ID
and the corresponding `Group` or `ServicePrincipal` type instead.

If a new capacity is needed, set `deployFabricCapacity = true` in the same file
and add an accepted capacity administrator identity:

```bicep
param fabricCapacitySku = 'F2'
param fabricCapacityAdministrators = ['capacity-admin@example.com']
```

F2 is a small starting size for this demonstration, not a sizing recommendation
for an application workload. A new Azure capacity is billed while active.

Compile, review the proposed resources, and deploy:

```bash
az bicep build --file infra/main.bicep
az deployment group what-if \
  --resource-group "$RESOURCE_GROUP" \
  --parameters infra/main.local.bicepparam

az deployment group create \
  --name "$FOUNDATION_DEPLOYMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --parameters infra/main.local.bicepparam
```

Read the identifiers needed by the next stage:

```bash
export COLLECTOR_CLIENT_ID="$(az deployment group show \
  --name "$FOUNDATION_DEPLOYMENT" --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs.collectorIdentityClientId.value -o tsv)"
export COLLECTOR_TENANT_ID="$(az deployment group show \
  --name "$FOUNDATION_DEPLOYMENT" --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs.tenantId.value -o tsv)"
export GRAFANA_PRINCIPAL_ID="$(az deployment group show \
  --name "$FOUNDATION_DEPLOYMENT" --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs.grafanaPrincipalId.value -o tsv)"
export GRAFANA_ENDPOINT="$(az deployment group show \
  --name "$FOUNDATION_DEPLOYMENT" --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs.grafanaEndpoint.value -o tsv)"
```

`COLLECTOR_CLIENT_ID` is the identity's **application/client ID**, used by the
exporter and KQL `aadapp` grants. `GRAFANA_PRINCIPAL_ID` is Grafana's **service
principal object ID**, used by the Fabric workspace role API. They serve different
purposes. The collector needs no client secret.

## 3. Bootstrap the Fabric workspace and database

List capacities visible to the signed-in identity:

```bash
python3 scripts/bootstrap-fabric.py --list-capacities
```

Select the active capacity intended for this demonstration. Its Fabric `id` is a
UUID. The Azure `fabricCapacityArmId` output is a different identifier and cannot
be passed as `--capacity-id`. If a newly created capacity is not yet listed, allow
time for provisioning and verify that the signed-in user has capacity permission.

```bash
export FABRIC_CAPACITY_ID='<Fabric capacity UUID>'
mkdir -p output

python3 scripts/bootstrap-fabric.py \
  --capacity-id "$FABRIC_CAPACITY_ID" \
  --workspace-name fabric-rti-observability \
  --eventhouse-name observability \
  --database-name Observability \
  --grafana-principal-id "$GRAFANA_PRINCIPAL_ID" \
  > output/fabric.local.json
```

The script creates or reuses the named resources and applies
[`fabric/schema.kql`](../fabric/schema.kql) when creating the database. That
definition creates the three raw tables, retention and streaming-ingestion
policies, materialized views and serving functions. Grafana receives **Viewer on
the dedicated workspace**. Do not use a shared workspace for this default grant.

Rerunning reuses matching resources. The script refuses to move an existing
workspace to another capacity or change a broader existing Grafana role. To apply
a revised schema to an existing demo database, review the schema and pass
`--update-schema`. To target a specific existing dedicated workspace, use
`--workspace-id <UUID>`.

Read the query endpoint and database name from the bootstrap result:

```bash
export KUSTO_CLUSTER_URI="$(python3 -c \
  'import json; print(json.load(open("output/fabric.local.json"))["queryServiceUri"])')"
export KUSTO_DATABASE="$(python3 -c \
  'import json; print(json.load(open("output/fabric.local.json"))["databaseName"])')"
```

Use `queryServiceUri` for the collector and Grafana. The exporter SDK discovers
ingestion endpoints; do not substitute `ingestionServiceUri`.

## 4. Grant the collector permission to ingest

Open the new Eventhouse in Fabric and select the `Observability` database query
editor. As a database administrator, replace the placeholders below with the
`COLLECTOR_CLIENT_ID` and `COLLECTOR_TENANT_ID` values from step 2, then run this
management command:

```kusto
.add database Observability ingestors ('aadapp=<COLLECTOR_CLIENT_ID>;<COLLECTOR_TENANT_ID>')
```

The same teaching template is available in
[`fabric/permissions.kql`](../fabric/permissions.kql). Replace its placeholders
before running it; the bootstrap does not execute this permissions file.

Verify the application identity appears with the ingestor role:

```kusto
.show database Observability principals
```

An ingestor can write telemetry without query or schema-administration access.
Schema deployment remains an administrator action. If choosing a different
database name, use it consistently in the grant and subsequent parameters. See
[Kusto security roles](https://learn.microsoft.com/en-us/kusto/management/security-roles?view=microsoft-fabric)
and [application principal syntax](https://learn.microsoft.com/en-us/kusto/management/reference-security-principals?view=microsoft-fabric).

## 5. Deploy the cloud collector and synthetic job

Edit **the same private parameter file**. Preserve the capacity and Grafana values
from stage 1. Change its existing `deployCollector` entry to `true`, then add the
query URI returned by the bootstrap:

```bicep
param deployCollector = true
param kustoClusterUri = 'https://<your-query-service-host>.kusto.fabric.microsoft.com'
param kustoDatabase = 'Observability'
```

Each parameter may appear only once in the file. Keep the `deployFabricCapacity`
and `deployManagedGrafana` flags at their previously selected values.

```bash
az deployment group what-if \
  --resource-group "$RESOURCE_GROUP" \
  --parameters infra/main.local.bicepparam

az deployment group create \
  --name "$RUNTIME_DEPLOYMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --parameters infra/main.local.bicepparam

export COLLECTOR_APP_NAME="$(az deployment group show \
  --name "$RUNTIME_DEPLOYMENT" --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs.collectorAppName.value -o tsv)"
export DEMO_JOB_NAME="$(az deployment group show \
  --name "$RUNTIME_DEPLOYMENT" --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs.demoJobName.value -o tsv)"

az containerapp show --name "$COLLECTOR_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query '{provisioning:properties.provisioningState,revision:properties.latestRevisionName}'
az containerapp logs show --name "$COLLECTOR_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" --type console --tail 50
```

If the Container Apps command group is unavailable in your CLI, install or update
its extension with `az extension add --name containerapp --upgrade`.

The collector runs with one replica and internal app ingress. The synthetic job
shares its Container Apps environment and calls its internal FQDN over HTTPS on
port 443. The platform forwards traffic to receiver port 4318. A laptop cannot
call that internal endpoint directly. See [Container Apps ingress](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview).

Platform console and system diagnostics are routed to a 30-day Log Analytics
workspace. They help diagnose the collector and job; the three OTLP signals are
stored in Fabric.

## 6. Run one bounded demonstration

The job has a manual trigger. Creating it does not start an execution.

```bash
az containerapp job start \
  --name "$DEMO_JOB_NAME" --resource-group "$RESOURCE_GROUP"

az containerapp job execution list \
  --name "$DEMO_JOB_NAME" --resource-group "$RESOURCE_GROUP" -o table
```

A run emits 60 synthetic requests at one-second intervals and exits. Each request
contains two parent/child spans, one correlated log and two metric points. Every
fifth request fails deliberately. The job has no automatic retry, a five-minute
timeout and no recurring schedule. Inspect the execution's status and container
output in the Azure portal. The expected final message acknowledges **120 spans,
60 logs and 120 metric points** accepted by the collector.

Collector acknowledgement and a successful job are separate from Fabric
ingestion. Wait for rows to appear in the database before presenting a populated
dashboard. See [Container Apps job execution commands](https://learn.microsoft.com/en-us/azure/container-apps/jobs).

## 7. Verify data, aggregation and correlation

In the Fabric query editor, run the queries in
[`fabric/queries.kql`](../fabric/queries.kql) individually. For a fresh database
after one successful execution, the signal-count query should find 120 trace
rows, 60 log rows and 120 metric rows in the last hour. Repeated executions add
rows, so compare an isolated time window or before/after counts.

Check the root request rollup:

```kusto
RequestsOverview(1h)
| summarize Requests=sum(RequestCount), Errors=sum(ErrorCount)
```

Expected after one run: `Requests = 60`, `Errors = 12`. Child spans do not count as
additional requests. Check view health separately:

```kusto
.show materialized-views
```

Confirm `Logs1m`, `Requests1m` and `Metrics1m` exist and are healthy. Querying a
view by name includes its current unmaterialized delta; an empty background
materialization immediately after ingestion does not itself prove missing data.
Run the correlation query from `fabric/queries.kql` and inspect a `TraceID` with
its root and child spans.

If counts remain incomplete, inspect collector console logs for identity,
ingestion, throttling or rejected-item errors. Recheck the **client ID** in the
ingestor grant, database name, query URI and Fabric capacity state. Allow for
batching, managed streaming fallback and backend ingestion delay. The configured
in-memory queue and bounded retry period do not guarantee durable delivery across
collector replacement; repeated attempts can duplicate telemetry. Investigate the
first run before starting another one.

## 8. Configure Grafana and import the dashboard

Prepare a private copy of the data source definition. This replaces the exact
`__KUSTO_CLUSTER_URI__` token and uses the bootstrapped database name:

```bash
python3 - <<'PY'
import json
import os
from pathlib import Path

source = json.loads(Path('grafana/datasource.json').read_text())
assert source['jsonData']['clusterUrl'] == '__KUSTO_CLUSTER_URI__'
source['jsonData']['clusterUrl'] = os.environ['KUSTO_CLUSTER_URI']
source['jsonData']['defaultDatabase'] = os.environ['KUSTO_DATABASE']
Path('grafana/datasource.local.json').write_text(json.dumps(source, indent=2) + '\n')
PY
```

Open `GRAFANA_ENDPOINT` in a browser and sign in as the user or group assigned
Grafana Admin. Managed Grafana Standard includes the Azure Data Explorer plugin.

1. Open **Connections > Data sources > Add new data source** and choose **Azure
   Data Explorer**.
2. Name it **Fabric Eventhouse**. Enter `KUSTO_CLUSTER_URI` as the cluster URL and
   `KUSTO_DATABASE` as the default database. Select **Managed Identity**
   authentication with the Grafana instance's system-assigned identity.
3. Select **Save & test**. The prepared `datasource.local.json` records these
   values for automation or review; the UI does not import a data source JSON
   file as a dashboard.
4. Open **Dashboards > New > Import**, upload
   [`grafana/overview.json`](../grafana/overview.json), and map the **Fabric
   Eventhouse** data source input (`DS_FABRIC`) to the data source just created.
5. Import the dashboard, choose a time window containing the run, and confirm the
   request, log and metric panels. Copy a recent log's `TraceID` into the
   dashboard's **Trace ID** field to inspect the span detail.

The dashboard contains Grafana import-time `__inputs`. Use the import screen so
that the input is resolved; posting the unmodified file directly to the dashboard
API does not perform that selection. See [Managed Grafana data sources](https://learn.microsoft.com/en-us/azure/managed-grafana/how-to-data-source-plugins-managed-identity).

## Cleanup

The collector keeps one replica running after the synthetic job completes.
Grafana and an active Fabric capacity also continue to incur their applicable
charges. Retention policies are not cost-stop switches.

For a dedicated disposable demonstration, first inspect the Fabric workspace and
Azure resource group to confirm that they contain only this demonstration.
Remove the demo workspace and its items through the Fabric portal, or remove only
the demo items and grants if deliberately using a retained workspace. Preserve
anything needed for a customer or another workload.

Then delete the dedicated Azure resource group through the Azure portal. This
removes the collector, job, environment, diagnostic workspace, Grafana, identity
and any capacity created in that group. An existing capacity outside the group is
not removed. Azure resource-group deletion does not delete the Fabric workspace;
Fabric and Azure cleanup are separate operations.

Setting Bicep creation flags back to `false` in an incremental deployment does
not delete existing resources or stop their charges. If retaining a paid capacity
for later, follow the Fabric administrator's suspend/resume procedure and check
the impact on its other workspaces. Verify cleanup in both Azure and Fabric and
review billing separately.
