# Azure infrastructure

`main.bicep` targets an existing resource group. All three billable resource
creation switches default to `false`. The default deployment creates only the
collector's user-assigned managed identity, which has no standalone charge.
Compiling templates creates no resources.

| Parameter | Default | Purpose |
| --- | --- | --- |
| `deployFabricCapacity` | `false` | Create a billable Fabric capacity; reuse a capacity or trial by leaving this off. |
| `fabricCapacitySku` | `F2` | Smallest starting SKU. Size against measured ingestion and query load. |
| `fabricCapacityAdministrators` | `[]` | Required when creating a capacity. Supply administrator user identities accepted by Fabric, such as UPNs. |
| `deployManagedGrafana` | `false` | Create billable Managed Grafana Standard X1 with a system-assigned managed identity. |
| `deployCollector` | `false` | Create a Container Apps environment, collector, manual synthetic job and platform Log Analytics workspace. |
| `kustoClusterUri` | `''` | Fabric database query URI, required when enabling the collector. |
| `kustoDatabase` | `Observability` | Fabric database display name. |
| `grafanaAdminPrincipalId` | `''` | Entra **object ID**, not application client ID. Supply this when enabling Grafana. |
| `grafanaAdminPrincipalType` | `User` | `User`, `Group`, or `ServicePrincipal`. |

The Grafana identity has no data access until separately granted access in Fabric.
The admin role is scoped to the one Grafana resource; the template grants no
subscription-wide Azure Monitor role. API keys are disabled. Managed Grafana
Standard includes the Azure Data Explorer data source plugin; this template does
not purchase an Enterprise add-on.

The collector has internal ingress accessible only inside its Container Apps
environment. The synthetic job calls that internal FQDN over HTTPS on port 443;
Azure proxies it to the OTLP HTTP receiver on port 4318. The collector uses its
user-assigned identity to ingest into Fabric, without a client secret. Its memory
queue is bounded and not durable across replica replacement. The default topology
has one replica and no availability-zone redundancy.

The environment sends collector and job platform diagnostics through Azure
Monitor to Log Analytics with 30-day retention. The three OTLP signals go to
Fabric. These destinations serve different purposes. The synthetic job is manual,
has no automatic retries, and finishes after 60 samples at one-second intervals.

Grafana uses a public endpoint protected by Entra authentication. The environment
does not have a customer VNet or private endpoint; internal **app** ingress does
not mean a VNet-isolated environment. Private networking and redundancy can be
added for the chosen workload.

## Compile and preview

```bash
az bicep build --file infra/main.bicep
az deployment group what-if \
  --resource-group "$RESOURCE_GROUP" \
  --parameters infra/main.bicepparam
```

For a new capacity and Grafana, make a private copy of the parameter file, enable
the switches, and supply the administrator values. Use a region supported by both
services. The deploying principal needs resource creation permissions and permission
to create the scoped Grafana role assignment, for example Role Based Access Control
Administrator on the target scope. Review the cost and `what-if` before `create`.

```bash
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --parameters infra/main.local.bicepparam
```

Fabric workspace, Eventhouse and KQL database are Fabric service objects, managed
through the Fabric REST API separately from ARM. See the repository deployment
guide and `python3 scripts/bootstrap-fabric.py --help`. The Bicep capacity output
is an **ARM ID**; resolve its **Fabric capacity UUID** through the Fabric capacity
list or portal before bootstrapping. These identifiers are different.

Bootstrap the database and grant its ingestor role to the output
`collectorIdentityClientId` in the output `tenantId`. Then enable `deployCollector`
and set the query service URI for a second Bicep deployment. The identity's
`collectorIdentityPrincipalId` is its object ID and is a different identifier.
See [deployment instructions](../docs/deployment.md) for the complete sequence.

Disabling a creation switch in an incremental deployment does not stop or delete
an already-deployed resource. Use the documented cleanup procedure to stop costs.

Deleting an Azure resource group does not delete Fabric workspace items. Review
the cleanup guide before removing any resource.

## References

- [Fabric capacity Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.fabric/2023-11-01/capacities)
- [Managed Grafana Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.dashboard/2025-08-01/grafana)
- [Managed Grafana included data sources](https://learn.microsoft.com/en-us/azure/managed-grafana/how-to-data-source-plugins-managed-identity)
- [Fabric REST workspace creation](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/create-workspace)
- [Container Apps ingress](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview)
- [Container Apps jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [Container Apps diagnostics destinations](https://learn.microsoft.com/en-us/azure/container-apps/log-options)
