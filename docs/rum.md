# Browser real user monitoring

This optional path sends browser telemetry to the Microsoft-managed Application
Insights endpoint, then exports selected categories through Azure Event Hubs to
the existing Fabric Eventhouse. It does not introduce an intake service,
collector, or Eventstream.

The Application Insights JavaScript SDK is not OpenTelemetry. The optional
advisor integration is a small example for a React application; instrument
other web applications separately. The advisor sends fixed page views to
`AppPageViews` and navigation/FCP timings as a custom `AppEvents` event; it does
not send `AppBrowserTimings`, dependencies, or exceptions. It does not measure
sessions, LCP, INP, or CLS, or provide Datadog-compatible session replay or full
RUM feature parity.

## Alternative: Azure Monitor mirroring (preview)

Microsoft Fabric also offers [Mirrored Azure Monitor](https://learn.microsoft.com/en-us/fabric/mirroring/catalog-mirroring/azure-monitor)
in public preview. It exposes Log Analytics tables through Eventhouse shortcuts
without Event Hubs, a custom intake, or duplicate storage. Data remains in Azure
Monitor, is read-only in Fabric, and typically appears within minutes; Fabric
query capacity and Azure Monitor ingestion/retention are still billable.

The preview exposes only new data, requires tenant enablement, and makes all
tables in the connected workspace available regardless of Azure Monitor
table-level protections. Some system columns, including `Type`, are unavailable,
and data purges require separate Azure Monitor and lake purge operations. Review
workspace isolation and access before using it. This repository implements and
estimates the separately provisioned Event Hubs path below; it does not
provision or estimate the preview alternative.

## Costs, privacy, and network boundaries

- The standalone Bicep template creates a billable Standard Event Hubs
  namespace with one throughput unit and two partitions by default, an
  Application Insights resource, and a diagnostic setting. Application Insights
  ingestion/retention, Event Hubs
  throughput and ingress events, and Fabric compute/storage may all incur
  charges. Microsoft currently lists the five selected Application Insights
  categories as [free to export](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/supported-logs/microsoft-insights-components-logs);
  verify current terms before adding other categories. Use an existing Fabric
  capacity only when it has sufficient headroom.
- Size Event Hubs throughput units and partitions for peak ingress, event rate,
  egress, and reader concurrency before provisioning. Set
  `eventHubsThroughputUnits` and `eventHubPartitionCount` in the Bicep deployment
  if the defaults are insufficient. Auto-inflate is disabled. Standard-tier
  event hub partition counts cannot be changed after creation; a calculator
  estimate based on monthly averages is not a peak-sizing guarantee.
- Use a workspace-based Application Insights resource and an existing Log
  Analytics workspace in the same Azure region. The SDK's connection string is
  visible to browsers: it is not an authentication secret. Browser telemetry can
  therefore be forged; do not use it as an authorization or billing signal.
- Diagnostic export requires a namespace SAS policy with Manage, Send, and
  Listen permissions. The documented native Eventhouse connection also uses a
  shared access key and a Manage policy. The template isolates these in a
  dedicated namespace; it does not weaken the existing identity-only optional
  OTLP broker. Keep keys out of source, logs, browser configuration, and
  Terraform state; restrict access, rotate them, and update the Fabric
  connection after rotation.
- The documented Eventhouse Event Hubs connector requires public network
  access and does not support a firewall or private link. TLS is enabled. This
  example is not an end-to-end private network design.
- Raw events can contain page URLs, anonymous identifiers, browser properties,
  location, and application-defined data. Instrumentation must avoid sensitive
  values and honor applicable consent and retention policies. The sample
  Eventhouse table retains data for seven days; Log Analytics retention is
  independent. The calculator instead models browser retention at the selected
  Datadog log-retention period or an assumed 30 days for Coralogix; align the
  assumptions and actual policies before comparing costs. Review both stores'
  policies before collecting real customer traffic.
- Azure Monitor diagnostic export can lag and its first delivery may take up
  to 90 minutes. Event Hubs retains messages for one day; a prolonged outage
  can result in loss. The sample is not a replay or exactly-once system.

## Provision the Azure resources

Start from an existing deployment with a Log Analytics workspace and Fabric
Eventhouse. The following creates a separate set of resources; it does not
transfer ownership of the baseline Terraform resources to Bicep.

```bash
export RESOURCE_GROUP='<existing resource group>'
export LOG_WORKSPACE='<existing Log Analytics workspace name>'
export LOG_WORKSPACE_ID="$(az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" --workspace-name "$LOG_WORKSPACE" \
  --query id -o tsv)"

az bicep build --file infra/optional/rum.bicep --stdout > /dev/null
az deployment group what-if --resource-group "$RESOURCE_GROUP" \
  --template-file infra/optional/rum.bicep \
  --parameters logAnalyticsWorkspaceId="$LOG_WORKSPACE_ID"
```

Optionally add `eventHubsThroughputUnits=<1-40>` and
`eventHubPartitionCount=<1-32>` to the `--parameters` argument after reviewing
the expected peak load and [Event Hubs scaling guidance](https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability).
Use the same parameter values for the what-if and deployment.

Review the changes and charges before deploying:

```bash
az deployment group create --name browser-rum \
  --resource-group "$RESOURCE_GROUP" --template-file infra/optional/rum.bicep \
  --parameters logAnalyticsWorkspaceId="$LOG_WORKSPACE_ID" \
  --query properties.outputs -o json
```

Record the resource names from the non-secret deployment outputs. Do not copy
Event Hubs keys into a parameter file or source control. The template does not
output keys or automatically configure a Fabric connection.

## Enable the advisor example

After provisioning, an operator can use the Application Insights connection
string at build time:

```bash
export APP_INSIGHTS_NAME='<Application Insights resource name>'
export VITE_APPLICATIONINSIGHTS_CONNECTION_STRING="$(az resource show \
  --resource-group "$RESOURCE_GROUP" --resource-type Microsoft.Insights/components \
  --name "$APP_INSIGHTS_NAME" --api-version 2020-02-02 \
  --query properties.ConnectionString -o tsv)"
cd apps
npm run -w @rti-mock/migration-advisor-frontend build
```

For Fabric static hosting, set the same environment variable for the Rayfin
build/publish command. The connection string is public in the bundle and
must never be replaced with an Event Hubs SAS key. The integration is disabled
when the variable is blank; see the [advisor guide](migration-advisor.md) for
its data collection and consent boundaries.

## Create the Eventhouse schema

The existing bootstrap script can apply just the optional RUM schema to an
existing database. Supply the actual Fabric capacity UUID, workspace UUID,
Eventhouse name, and database name from the baseline deployment:

```bash
python3 scripts/bootstrap-fabric.py \
  --capacity-id '<Fabric capacity UUID>' \
  --workspace-id '<Fabric workspace UUID>' \
  --eventhouse-name '<Eventhouse name>' \
  --database-name '<KQL database name>' \
  --schema-file fabric/rum.kql --update-schema
```

`RUMEnvelopes` stores each Azure Monitor message's `records` array as a dynamic
column. `RUMEvents(24h)` expands every item and accepts the Application Insights
`type` field as well as the `category` field used by other resource logs.
Source-specific fields remain in the returned record; inspect the actual
export schema before creating derived dimensions.

## Connect Event Hubs to Eventhouse

In the KQL database, choose **Get data** > **Event Hubs** and create a cloud
connection to the namespace and event hub from the deployment outputs. Use the
`rum-fabric-connection` event-hub policy and its key from the Azure portal;
enter it only in the Fabric connection dialog. Select the `fabric-rum` consumer
group, the existing `RUMEnvelopes` table, JSON format, and the existing
`RUMAzureMonitorMapping` mapping. If preview data is not yet available, first
enable a browser client and allow time for diagnostic export.

To include retained events that arrived before the connection was created,
specify a retrieval start time within the event hub's one-day retention period.
See [Get data from Azure Event Hubs](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/get-data-event-hub).

## Verify

Enable the browser SDK for a test application, visit its pages, and query:

```kusto
RUMEvents(24h)
| summarize Events=count(), Latest=max(Timestamp) by Type
| order by Events desc
```

For a time series of page views, replace the `where` value with any other
exported category:

```kusto
RUMEvents(24h)
| where Type == "AppPageViews"
| summarize PageViews=count() by Window=bin(Timestamp, 5m)
| order by Window asc
```

The Application Insights resource also provides its own browser performance
and usage views. These views query Application Insights data, not Eventhouse.

To validate the expansion function against an existing Fabric database without
writing sample rows, run
`RUN_FABRIC_RUM_INTEGRATION=1 python3 -m unittest tests.test_telemetry.RumQueryIntegrationTests`
from the repository root. This uses the ignored `output/fabric.local.json` and
the current Azure CLI identity; it does not test the Event Hubs connection.

Check Application Insights and its Log Analytics workspace first if no browser
events arrive. Then check the diagnostic setting, Event Hubs incoming messages,
and the Eventhouse connection/mapping. A successful browser request or an
Event Hubs message alone does not prove that records reached Eventhouse.

References: [Application Insights JavaScript SDK](https://learn.microsoft.com/en-us/azure/azure-monitor/app/javascript-sdk),
[diagnostic settings](https://learn.microsoft.com/en-us/azure/azure-monitor/data-collection/diagnostic-settings),
and [Azure Monitor resource-log schema](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/resource-logs-schema).
