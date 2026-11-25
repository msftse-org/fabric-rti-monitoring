# Observability migration and cost advisor

The optional [`apps/migration-advisor/`](../apps/migration-advisor/) Rayfin app
helps a customer plan a move from Datadog or Coralogix to Azure Managed Grafana,
Microsoft Fabric Eventhouse, and explicitly selected companion services.

This is the first, **manual planning** stage. It does not connect to vendor APIs,
request API keys, convert dashboards, deploy resources, or migrate historical
telemetry. Access to those systems will be relevant to a future execution tool,
not a prerequisite for this planner.

The **OTel configuration** and **Cost comparison** tools use separate input and
result screens. Enter the essential information, then generate the configuration
or view the comparison. **Edit inputs** returns to the form without losing the
draft. Detailed settings remain available under advanced options.

The shell follows the existing Datadog/Coralogix apps' compact dark rail and
breadcrumb topbar conventions with product-neutral RTI branding. Content supports
light/dark themes, defaulting to OS preference and preserving a local override.
Mobile navigation uses a keyboard-safe drawer; no vendor UI is impersonated.

The OTel tool loads the bundled RTI destination automatically when starting an
empty draft. Choose Fabric-only replacement or dual-output evaluation and select
signals. Dual output asks once for the exact existing exporter IDs shared by the
selected signals; different per-signal IDs, pipeline names, authentication, and
tables remain advanced settings. It never guesses which exporters are present.
Generated fragments must be merged without replacing current receivers,
processors, extensions, or other pipelines. A Datadog Agent configuration is not
an OTel Collector configuration, and suggestions are never applied automatically.

## Run on the customer's computer

To develop or build, use Node.js 22.12+ within the 22.x LTS line or Node.js
24.x LTS (`^22.12.0 || ^24.0.0`). The deployed Fabric app is static and does
not require a Node server.

```shell
cd apps
npm ci --ignore-scripts
npm run dev:migration-advisor
```

Open `http://localhost:5185`. By default no Azure login, telemetry API, or vendor
account is required. Inputs and calculations remain in the browser; exported
files can contain customer inventory and spending assumptions, so handle them
privately. The existing mock apps and RTI On-Call backend are separate
applications.

### Optional browser telemetry

The advisor can use the managed [browser RUM path](rum.md). It is **off by
default**. To enable it, set `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING` when
building or running the frontend; Vite embeds this value in the public bundle,
so never use an Event Hubs key or another secret in this setting.

The integration sends fixed, allowlisted page-route views and one custom event
with navigation-load and first-contentful-paint timings. It does not collect
calculator inputs, imported files, query strings, referrers, dependencies, or
automatic exceptions. Cookies, SDK storage, remote configuration, and SDK
statistics are disabled. Azure still receives the network IP address and user
agent. The example has no end-user consent mechanism: operators must address
applicable consent, privacy, access, and retention requirements before enabling
it for real users.

## Vendor capability scope

The migration map covers **27 migration categories**, not a complete vendor
portfolio or customer licensing. Official documentation reviewed **2026-11-21**
is recorded per vendor/category in `src/capabilities.ts` and linked in each
inspector. **Native** means vendor-owned documented capability, not entitlement.
Rows distinguish **Integration**, **Limited scope**, and **Separate offering**
from migration dispositions (Translate, Redesign, Specialist).

Datadog lists 27 categories; Coralogix lists 26. Coralogix collaborative notebooks
are **Not verified in reviewed documentation**, not asserted absent; the native
scope disclosure explains this omission. Coralogix profiling, replay, SLOs and
Cases remain listed. PagerDuty on-call and Checkly synthetics are integrations;
database client-span insights are narrower than deep engine monitoring; Snowbit
CSPM scanners and SIEM/MDR are separate offerings, with runtime/postmortem parity
limitations explained where relevant.

Vendor switching preserves the full 27-choice plan, including hidden Datadog
notebook selections. Search, category/disposition filters, counts, selected rows,
print and exported mappings use only the active vendor's verified categories and
names. Export/save retains the union plan for restoration; legacy 30-category
plans still restore with `exports`, `quotas` and `ownership` removed.

For a production bundle:

```shell
cd apps
npm run -w @rti-mock/migration-advisor-frontend test
npm run -w @rti-mock/migration-advisor-frontend typecheck
npm run -w @rti-mock/migration-advisor-frontend build
```

For optional portable browser regressions, keep the local dev server running and
point `PLAYWRIGHT_MODULE` to an already installed Playwright ESM entry:

```shell
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  node --test apps/migration-advisor/packages/frontend/test/browser/*.mjs
```

From the repository root, `apps/migration-advisor/scripts/capture-review.mjs`
uses the same optional module and `ADVISOR_URL` environment variables to capture
desktop/mobile cost input/results, migration shell and OTel input/results into
`apps/migration-advisor/.impeccable/review/`. It uses synthetic inventory and
checks console errors, failed requests and horizontal overflow. StrictMode's
intentional aborted inventory request is reported separately.

The app includes a Rayfin manifest for optional protected Fabric static hosting.
Review the plan and exported assumptions locally before deploying:

```shell
cd apps/migration-advisor
npx @microsoft/rayfin-cli login --tenant <tenant-id>
npx @microsoft/rayfin-cli up -n --workspace-id <workspace-id>
npx @microsoft/rayfin-cli up --workspace-id <workspace-id>
```

Rayfin prints the generated hosting URL. No source-system credential belongs in
the static bundle. Hosting does not turn a manual planner into a connector.

### Include the deployed RTI target inventory

The OTel tab reads a dated, non-secret inventory bundled with this app. An empty
draft loads it automatically; advanced destination settings allow refreshing or
overriding it. Existing custom or restored destinations are not silently replaced.
It does not query Azure from the customer's browser.
Before publishing, generate that inventory from the existing bootstrap output
and the explicitly selected collector and Grafana:

```shell
python3 apps/migration-advisor/scripts/deployment-targets.py \
  --fabric-config output/fabric.local.json \
  --resource-group <resource-group> \
  --collector <container-app-name> \
  --grafana <managed-grafana-name>
```

The generated `packages/frontend/public/deployment-targets.json` is git-ignored.
It contains only workspace/Eventhouse names, KQL query URI, database, Grafana URL,
collector name/URL, and discovery time. No credentials or identity identifiers
are included. Run the generator again after resources change, then publish.
Without this optional file, users can enter the target details manually.

The database query URI belongs in `azuredataexplorer.cluster_uri`; it is **not**
an OTLP endpoint. Application SDKs send OTLP to a collector. The replacement
baseline listens on loopback for local evaluation; remote receivers require
appropriate network isolation, TLS, authentication, and deployment-specific
bindings. Azure CLI authentication is for a collector running on the logged-in
host; a container does not inherit that session. AKS workload identity and
Azure-hosted managed identities require their own provisioning and ingestion
permissions.

Existing sample collectors use internal ingress and synthetic-only filters.
Do not route real customer traffic through those demo policies: use a separate
reviewed collector and raw-table schema. Demo dashboard materialized views also
filter synthetic data. Never paste API keys or client secrets into the planner;
generated authentication uses environment-variable references.

Use a pinned Collector Contrib build containing the `azuredataexplorer` exporter
(the repository uses 0.141.0), validate the completed configuration with
`otelcol-contrib validate --config=<file>`, prepare tables and ingestion policies,
and test a bounded pilot before cutover. Fan-out is not atomic or exactly-once:
monitor both destinations, retry/queue failures, CPU/memory, privacy controls,
duplicate data, and additional vendor/Fabric costs. Save the original
configuration for rollback. SDK instrumentation and metric/log transformations
still require workload-specific validation.

## Migration map

Select the source platform, inventory the capabilities needed, and review each
feature's proposed destination, alternatives, conversion work, and gaps.
The plan should distinguish what this repository already provides from what the
customer must implement, operate, or license separately.

Key boundaries:

| Capability | Migration consideration |
| --- | --- |
| Dashboards, widgets, and saved queries | Rebuild panels and translate Datadog queries or Coralogix DataPrime to KQL. Validate aggregation and filter semantics; there is no general one-to-one conversion. |
| Logs, metrics, traces, and retention | Map OTLP attributes and schemas, cardinality, sampling, retention, and archive policies. Vendor indexes and Coralogix priority classes are not equivalent to Eventhouse cache policies. |
| Alerts and monitors | Managed Grafana supports alerting for suitable backend data sources, including the Azure Data Explorer plugin. Activator is another option; test no-data, query failures, thresholds, and notification delivery. |
| Notification routing and silences | Grafana Alertmanager supplies contact points, label routing, grouping, mute timings, and silences. It is not an on-call scheduler. |
| On-call and incident management | Retain a paging/ITSM provider or design and operate scheduling, acknowledgment, escalation, and notification flows. Grafana Cloud IRM is not automatically included with Azure Managed Grafana. |
| RUM, session replay, synthetic testing, profiling, and security | Require explicit replacements or separate services. A telemetry database and this sample's synthetic producer do not provide equivalent specialist products. |

Microsoft recommends Azure Monitor's native alerts for Azure Monitor services;
Grafana alerts against those services are not officially supported by Microsoft.
This caveat must not be generalized into "Grafana cannot alert on KQL."
The existing sample's live Activator authoring does not make its simulated
on-call schedules, pages, or escalation workflows production services.

## Cost comparison

The default **Estimate from usage** flow asks only for current source usage:
logs/traces/metrics GB/day for both vendors and infrastructure/APM hosts for
Datadog. **Advanced source assumptions** retains source billing days, tiers,
retention, metering assumptions and public/quoted source rates. Unknown source
rates remain quote-needed, with **Enter rate** returning to the source field.
Blank is unknown; zero is only a confirmed zero source cost.

### Import a usage or billing export

**Start from a usage or billing export** fills the source inputs from files the
customer exports with their own access. Files are parsed in the browser; nothing
is uploaded, and the planner never asks for API keys. A preview lists the
detected format, period and values before **Apply to inputs**, which also
switches the vendor toggle to the detected vendor.

| Export | How to get it | What it fills |
| --- | --- | --- |
| Coralogix Data Usage Report (CSV, TSV or JSON) | Settings > Usage & Quota > More actions > Generate report, **Detailed** type, up to 90 days | Logs, traces and metrics GB/day (daily averages) and the log/trace TCO priority split. Blocked data is excluded; columns are matched by header name. |
| Coralogix Data Usage API JSON | `GET /mgmt/openapi/3/dataplans/data-usage/v2` | Same as the report, from `sizeGb` with tier and pillar dimensions. |
| Datadog usage summary JSON | `GET /api/v1/usage/summary` for one month | Billing days, p99 infrastructure and APM hosts, ingested log and span GB/day, indexed log %, indexed spans, custom metric series and synthetic runs. Metric GB is not reported by Datadog and is left unchanged. |
| Datadog cost JSON (invoice amounts) | `GET /api/v2/usage/historical_cost` (billed) or `/estimated_cost` (month-to-date) | **Monthly Datadog bill (all-in)**, which replaces every estimated Datadog meter. Per-product `total` charges are not double counted; organizations are summed for the latest month, and the Datadog discount resets to 0%. |

Coralogix invoices are PDFs and are not machine-readable; use the Coralogix
all-in monthly contract field for a billed amount. Import usage and cost from
one vendor at a time; the Datadog usage and cost files can be imported together.

Target costs are calculated automatically; there are no customer Fabric SKUs,
capacity hours/rates, Grafana numbers or collector costs to enter, even under
advanced options. Results open with a savings summary: estimated monthly
savings (or the extra cost), percentage, a monthly × 12 annual figure and
scaled bars for today versus Fabric RTI. Savings use the higher
continuous-query reference; when source rates are missing, only a positive
known-subtotal gap is shown as an "at least" floor. Below it, a two-column
split places the current vendor ledger beside the itemized Fabric ledger
(capacity, OneLake storage, Grafana hosting and users, OTel Collector), each
with a composition bar. The Fabric column shows a compact sizing reference
(source GB/day, capacity SKU, active hours and region). Sensitivity ranges and
the prominent unvalidated-sizing warning are in the collapsed assumptions
disclosure, avoiding a repeated section beneath the comparison. These
heuristics are not a validated GB-to-Fabric sizing formula or confidence range.
Actual costs can be outside the range; it is not a complete bill or guaranteed
savings. Read-only assumptions and limitations expand below. Unsupported reference
sizing requires a pilot, not target rate entry.

Existing saved/imported monthly totals are view-only and can be compared or
switched to usage. Legacy comparisons use their saved amounts, not automatic
projection, and still require matching periods and feature scope.

Pricing sources were checked on **2026-11-21**. Estimates are in USD, not a
commercial quote. Use the customer's negotiated rates, billed host counts,
actual volumes, entitlements, region, and billing commitment when available.
Annual commitment prices are monthly rates under an annual contract, not
month-to-month prices. Annualized estimates multiply the monthly model by 12.

Source billing days remain editable; the automatic model uses all-month
always-on target references. For logs, ingest GB and
indexed event counts are different meters. Estimating event counts from GB
requires a customer-supplied average event size and indexed fraction.
An indexed custom metric is a time series, not a metric datapoint count.

### Datadog

The official list price separates independently billed products:

| Meter | Example annual-commitment list price |
| --- | --- |
| Infrastructure Pro | USD 15 per host-month |
| Infrastructure Enterprise | USD 23 per host-month |
| Log ingestion | USD 0.10 per uncompressed GB |
| Indexed logs, 3 / 7 / 15 / 30-day retention | USD 1.06 / 1.27 / 1.70 / 2.50 per million events |
| Standard APM | USD 31 per APM host-month |
| On-Call | USD 20 per seat-month |
| RUM Measure | USD 0.15 per 1,000 sessions; not full RUM or session replay |
| Synthetic API / browser tests | USD 5 per 10,000 API runs / USD 12 per 1,000 browser runs |

The documented standard APM-host model includes 150 GB of ingested spans and
one million indexed spans per APM host per month. Above those allowances, the
annual 15-day example uses USD 0.10 per GB and USD 1.70 per million indexed
spans. Confirm the customer's deployment model, plan, retention, and contract
before applying these allowances.

Infrastructure Pro and Enterprise document 100 and 200 indexed custom metrics
per host respectively. Cardinality-based overages and Metrics without Limits
have their own units and allowances. The cited documents do not establish a
round-up rule for partial 100-series blocks; the calculator uses a pro-rata
estimate and requires confirmation of contractual billing and rounding.
Container overages, archives, security,
profiling, incident products, support, and other selected services must not
silently be assumed included.

### Coralogix

Coralogix bills by data usage and priority, with contract-specific commitments
and daily quotas. Published examples are **not mutually interchangeable**:

- The pricing page advertises logs at USD 0.42/GB, traces at USD 0.16/GB,
  and metrics at USD 0.06/GB.
- Its FAQ also gives illustrative frequent-search and monitoring log rates of
  USD 1.15/GB and USD 0.50/GB.
- The billing documentation lists high/medium/low log rates of
  0.75/0.32/0.12 units per GB, trace rates of 0.5/0.25/0.1 units per GB,
  and metrics at one unit per 30 GB. A pricing example values a unit at USD 1.50.

Those examples do not reconcile exactly. Enter quoted per-signal/per-priority
rates or the customer's monthly contract instead of treating a headline rate as
a validated quote. Do not choose a low-priority price while assuming high-priority
search, alerting, and dashboard features. Include customer-owned archive storage,
overages, and other contract charges separately.

### Browser RUM estimate

The optional RUM section models the managed Application Insights → diagnostic
export → Event Hubs → Eventhouse path. Datadog usage can use measured browser
GB/month or an editable sessions × KB/session proxy; the default 20 KB/session
is a placeholder, not a measured benchmark. Coralogix requires browser GB and
an incremental quote or an all-in source contract. Exclude browser volume and
cost already included in other source inputs.

The target adds Application Insights ingestion, an Event Hubs Standard TU
baseline, incremental Fabric capacity when the rounded SKU changes, and retained
storage. The shipped template creates a dedicated namespace, billed even when
no events arrive, with one TU and two partitions by default. Calculator sizing
does not configure those resources; choose throughput units and partitions for
peak load before deployment, since Standard-tier partition counts cannot be
changed after the hub is created. More than 40 required TUs exceeds a single
Standard namespace and requires separate architecture and pricing. A shared-TU
credit represents an alternative existing SAS-compatible namespace and
connection, not the template's default. No Application Insights free allowance
is assumed. The estimate excludes Event Hubs ingress-event charges, whose
billable 64-KB units depend on batching, and does not imply full vendor RUM or
session-replay parity. For planning, browser storage uses the selected Datadog
log-retention period or an assumed 30 days for Coralogix; the supplied
Eventhouse RUM table defaults to seven days. Review and align retention before
comparing bills.

### Azure Managed Grafana and Fabric

The target estimate must account for more than ingestion:

| Cost | Model and required assumption |
| --- | --- |
| Fabric capacity | Hourly SKU rate times active hours times the allocated share, or the explicitly incremental capacity required by this workload. Do not charge the same capacity twice. |
| Eventhouse storage | Average retained standard and chargeable cache GB-months, using applicable storage rates. Verify cache billing and do not duplicate an included charge. |
| Managed Grafana | Standard Units times active hours times regional unit rate, plus monthly active users. X1 uses two Standard Units; X2 uses four. Optional redundancy and Enterprise licensing are separate. |
| Collectors and diagnostics | Container Apps collector/job compute, diagnostics ingestion and retention, and networking; optionally AKS. Use measured or quoted monthly costs when subscription free grants and idle rates make a simple estimate unreliable. |
| Companion services | Selected automation, notification delivery, on-call/ITSM, security, support, and other required services. Include these to avoid comparing unequal capabilities. |

Grafana active users include users, service accounts, and API keys and are counted
once per subscription across instances. Shared allocation needs an explicit
incremental-cost comparison; already-paid capacity is not evidence that additional
load is free.

**There is no supported GB/day-to-Fabric-CU sizing conversion.** Select capacity
from measured workload behavior, concurrency, query/materialization load, and
headroom. Retention and compression estimates do not establish capacity sizing.
Unknown rates are incomplete assumptions, not zero-cost services. Do not present
savings as complete until both source and target costs are fully priced for the
selected scope.

### Regional retail reference: West US 3

The public Azure Retail Prices API returned these USD Consumption meters on
2026-11-21:

| Product / meter | Published retail rate | Interpretation |
| --- | --- | --- |
| Managed Grafana / Standard User | USD 6 per user-month | Apply the subscription-level active-user definition and customer agreement. |
| Managed Grafana / Standard Node | USD 0.0342 per hour | The pricing page independently lists USD 0.0342 per Standard Unit-hour for West US 3. |
| OneLake / Storage Hot Data Stored | USD 0.023 per GB-month | Standard retained storage; verify the applicable Eventhouse storage meter. |
| OneLake / Cache Data Stored | USD 0.266 per GB-month | Charge only when this cache is separately billable. |
| Fabric / Eventhouse Capacity Usage CU | USD 0.18 per CU-hour | Do not add this again to an already priced Fabric capacity. |
| Fabric / Eventhouse OD On-Demand Usage CU | USD 0.2448 per CU-hour | A different on-demand meter, not the ordinary capacity rate. |

The [Managed Grafana pricing page](https://azure.microsoft.com/en-us/pricing/details/managed-grafana/)
also publishes the West US 3 Standard Unit price in its regional data.

The API did not return directly named F2/F4 meters in this query. Microsoft's
documented on-demand multiplier of 1.36 gives a derived PAYG reference of
USD 0.18/CU-hour, hence F2 at USD 0.36/hour and F4 at USD 0.72/hour.
These are derived examples, not customer-specific SKU quotes. Confirm the
regional pricing calculator and billing configuration before procurement.

The source filters are
[Grafana retail meters](https://prices.azure.com/api/retail/prices?%24filter=serviceName%20eq%20%27Azure%20Grafana%20Service%27%20and%20armRegionName%20eq%20%27westus3%27%20and%20priceType%20eq%20%27Consumption%27&currencyCode=USD)
and
[Fabric retail meters](https://prices.azure.com/api/retail/prices?%24filter=serviceName%20eq%20%27Microsoft%20Fabric%27%20and%20armRegionName%20eq%20%27westus3%27%20and%20priceType%20eq%20%27Consumption%27&currencyCode=USD).
See the [on-demand multipliers](https://learn.microsoft.com/en-us/fabric/enterprise/on-demand-billing-meters-multipliers)
and [Eventhouse consumption](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/real-time-intelligence-consumption)
for the distinction between capacity, on-demand usage, and cache billing.

### Automatic planning projection

Customers enter source usage, not Fabric or Grafana sizing and rates. The app
sums original daily log, trace, and metric GB, then generates two illustrative
target totals using the dated West US 3 references:

| Component | Automatic planning assumption |
| --- | --- |
| Fabric compute | Microsoft's two production examples report 23 CU-hours for about 1,000 GB with infrequent access, and 817 CU-hours for 2,500 GB with continuous queries. The app extrapolates each CU-hour/GB ratio to the entered month, divides by full-month hours, adds 30% assumed headroom, and rounds up to an F2-F1024 capacity. |
| Capacity bill | New dedicated, always-on capacity; SKU CUs × USD 0.18/CU-hour × billing days × 24. This is not an allocation of existing shared capacity. No additional Eventhouse CU bill is added. |
| Retained storage | Daily original GB × retention days ÷ an assumed 5:1 compression ratio × USD 0.023/GB-month. All signals use the selected Datadog indexed-log retention, or an assumed 30 days for Coralogix. This is steady-state storage, not just the first month's accumulated data. |
| Grafana | X1 at two Standard Units × USD 0.0342/unit-hour × full-month hours, plus an assumed five active users × USD 6/month. |
| Collector compute | At least one assumed 0.5-vCPU/1-GiB replica, adding one replica per 250 GB/day. Full active compute uses USD 0.000024/vCPU-second and USD 0.000003/GiB-second, before shared subscription free grants. |

The 30% headroom, compression, team size, and collector throughput threshold are
**application assumptions, not Microsoft benchmarks**. The two Eventhouse
production examples are **sensitivity references**, not a supported conversion
from GB/day to capacity or an accuracy interval. Actual bills can be outside the
displayed range. SCUs in Microsoft's article are generic units and are never
converted directly to USD.

The main target ledger uses the continuous-query reference. When the illustrative
capacity exceeds F1024, the app does not clamp it to a falsely sufficient SKU or
calculate a full total/difference. A measured pilot is required for peak load,
query concurrency, transformations, cache size, schemas, and Collector scaling.
Request charges, diagnostics, network, redundancy, licensing, setup labor and
specialist/paging replacements remain outside this baseline.

Usage-plan exports include the model's assumptions, limitations, reference
totals and an explicitly indicative comparison basis. Legacy target inputs do
not override the automatic model; old monthly-total documents remain readable.

## Official sources

- [Datadog pricing list](https://www.datadoghq.com/pricing/list/)
- [Datadog APM billing](https://docs.datadoghq.com/account_management/billing/apm_tracing_profiler/)
- [Datadog custom metric billing](https://docs.datadoghq.com/account_management/billing/custom_metrics/)
- [Coralogix pricing](https://coralogix.com/pricing/)
- [Coralogix data usage and billing](https://coralogix.com/docs/user-guides/account-management/payment-and-billing/data-usage/)
- [Coralogix TCO Optimizer](https://coralogix.com/docs/user-guides/account-management/tco-optimizer/)
- [Azure Managed Grafana pricing](https://azure.microsoft.com/en-us/pricing/details/managed-grafana/)
- [Microsoft Fabric pricing](https://azure.microsoft.com/en-us/pricing/details/microsoft-fabric/)
- [Real-Time Intelligence consumption](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/real-time-intelligence-consumption)
- [Eventhouse production cost examples](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/pricing-cost-drivers)
- [Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)
- [Application Insights pricing](https://azure.microsoft.com/en-us/pricing/details/monitor/)
- [Event Hubs pricing](https://azure.microsoft.com/en-us/pricing/details/event-hubs/)
- [Application Insights diagnostic export categories](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/supported-logs/microsoft-insights-components-logs)
- [Grafana notification routing and Alertmanager](https://grafana.com/docs/grafana/latest/alerting/fundamentals/notifications/)
- [Azure Data Explorer plugin alerting](https://grafana.com/docs/plugins/grafana-azure-data-explorer-datasource/latest/alerting/)
- [Managed Grafana and Azure Monitor alerts](https://learn.microsoft.com/en-us/azure/managed-grafana/how-to-use-azure-monitor-alerts)
- [Fabric Activator](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/data-activator/activator-introduction)

Use a current customer quote before procurement. Public list prices, feature
availability, and Azure regional meters can change independently of this app.
