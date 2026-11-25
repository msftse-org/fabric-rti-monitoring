import { calculate, defaultScenario, validateScenario } from './model.ts';
import type { Line, Scenario, Stack } from './model.ts';

export const rumProvisioningAssumption = 'The RUM template defaults to 1 provisioned TU and 2 partitions. Calculator TU estimates do not configure infrastructure. Choose TU and partition counts for peak load before deployment; Standard-tier partition counts cannot be changed after hub creation.';

const reference = {
  region: 'West US 3',
  cuHour: .18,
  standardUnitHour: .0342,
  userMonth: 6,
  storageGBMonth: .023,
  cpuSecond: .000024,
  memoryGBSecond: .000003,
  lowerCUHoursPerGB: 23 / 1000,
  continuousCUHoursPerGB: 817 / 2500,
  headroom: 1.3,
  compression: 5,
  collectorGBDayPerReplica: 250,
  appInsightsGB: 2.30,
  eventHubsTUHour: .03,
  eventHubsHours: 730,
  eventHubsIngressMBSecond: 1,
  eventHubsMaxTUs: 40,
};

export function normalizedAutomaticScenario(scenario: Scenario): Scenario {
  const defaults = defaultScenario();
  return {
    ...scenario,
    hours: String(Number(scenario.days) * 24), grafanaHours: String(Number(scenario.days) * 24),
    fabricRate: '', allocation: defaults.allocation, storageGB: defaults.storageGB, storageRate: '',
    cacheGB: defaults.cacheGB, cacheRate: '', grafanaRate: '', users: defaults.users, userRate: '',
    collector: '', diagnostics: '', aks: '', aksShare: defaults.aksShare, notifications: '', targetExtras: '',
    targetDiscount: defaults.targetDiscount,
    storageEnabled: false, cacheEnabled: false, diagnosticsEnabled: false, notificationsEnabled: false,
    targetExtrasEnabled: false, fabricMode: 'incremental', fabricSKU: 'custom', runtime: 'collector',
    grafanaSize: 'X1', region: reference.region, azureExample: false,
  };
}

export function validateAutomaticScenario(scenario: Scenario, vendor: 'Datadog' | 'Coralogix' = 'Datadog') {
  return validateScenario(normalizedAutomaticScenario(scenario), vendor);
}

function capacity(required: number) {
  const units = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(1, required))));
  return units <= 1024 ? units : null;
}

function pricedLine(id: string, label: string, quantity: number, rate: number | null, formula: string, source: string): Line {
  return { id, label, quantity, rate, amount: rate === null ? null : quantity * rate, formula, source };
}

function ledger(lines: Line[]): Stack {
  const missing = lines.filter(line => line.amount === null).length;
  return { lines, total: lines.reduce((sum, line) => sum + (line.amount ?? 0), 0), complete: missing === 0, missing, discount: 0 };
}

export function calculateAutomatic(scenario: Scenario, vendor: 'Datadog' | 'Coralogix' = 'Datadog') {
  const original = calculate(normalizedAutomaticScenario(scenario), vendor);
  const baselineDailyGB = Number(scenario.logsGB) + Number(scenario.traceGB) + Number(scenario.metricGB);
  const days = Number(scenario.days);
  const hours = days * 24;
  const baselineMonthlyGB = baselineDailyGB * days;
  const rumEnabled = vendor === 'Datadog' ? scenario.rum : scenario.cxRum;
  const measuredRumVolume = vendor === 'Coralogix' || scenario.rumMonthlyGB.trim() !== '';
  const rumMonthlyGB = !rumEnabled ? 0 : vendor === 'Coralogix'
    ? Number(scenario.cxRumMonthlyGB)
    : measuredRumVolume ? Number(scenario.rumMonthlyGB) : Number(scenario.rumSessions) * Number(scenario.rumKBPerSession) / 1e6;
  const rumDailyGB = rumMonthlyGB / days;
  const dailyGB = baselineDailyGB + rumDailyGB;
  const monthlyGB = baselineMonthlyGB + rumMonthlyGB;
  const volumeBasis = !rumEnabled ? 'Not included' : measuredRumVolume
    ? 'Entered source volume used as an approximate 1:1 target-volume proxy'
    : `Estimate: ${scenario.rumSessions} sessions × ${scenario.rumKBPerSession} assumed KB/session ÷ 1,000,000`;
  const retentionDays = vendor === 'Datadog' ? Number(scenario.retention) : 30;
  const retainedGB = dailyGB * retentionDays / reference.compression;
  // Browser telemetry bypasses the existing OTel Collector.
  const collectorReplicas = Math.max(1, Math.ceil(baselineDailyGB / reference.collectorGBDayPerReplica));
  const collectorRate = .5 * reference.cpuSecond + reference.memoryGBSecond;
  const requiredThroughputUnits = rumEnabled
    ? Math.max(1, Math.ceil(rumMonthlyGB * 1000 / (reference.eventHubsHours * 3600 * reference.eventHubsIngressMBSecond)))
    : 0;
  const incrementalThroughputUnits = Math.max(0, requiredThroughputUnits - (scenario.rumSharedEventHub ? 1 : 0));
  const eventHubsLimitExceeded = requiredThroughputUnits > reference.eventHubsMaxTUs;
  const eventHubsLimitExplanation = eventHubsLimitExceeded
    ? `RUM average ingress requires ${requiredThroughputUnits} TUs, exceeding the ${reference.eventHubsMaxTUs}-TU limit for one Event Hubs Standard namespace${scenario.rumSharedEventHub ? ' even with a shared-TU credit' : ''}. Multiple namespaces or another tier require separate sizing and pricing; no Event Hubs price, complete target estimate or savings is calculated.`
    : null;
  const common = [
    pricedLine('storage', 'Estimated retained OneLake storage', baselineDailyGB * retentionDays / reference.compression, reference.storageGBMonth,
      `${baselineDailyGB} GB/day × ${retentionDays} retention days ÷ 5 assumed compression × $0.023/GB-month`, 'azure-retail-fabric'),
    ...(rumEnabled ? [
      pricedLine('rum-appinsights', 'Application Insights · browser ingestion', rumMonthlyGB, reference.appInsightsGB,
        `${rumMonthlyGB} estimated GB/month × $2.30/GB; no account-level free allowance assumed. ${volumeBasis}.`, 'appinsights-pricing'),
      pricedLine('rum-eventhubs', eventHubsLimitExceeded ? 'Event Hubs Standard · exceeds single-namespace limit' : 'Event Hubs Standard · incremental throughput',
        incrementalThroughputUnits * reference.eventHubsHours, eventHubsLimitExceeded ? null : reference.eventHubsTUHour,
        eventHubsLimitExplanation ?? `${requiredThroughputUnits} required TU(s) (minimum 1; sized from average ingress) − ${scenario.rumSharedEventHub && requiredThroughputUnits ? 1 : 0} assumed spare shared TU(s) = ${incrementalThroughputUnits} additional × 730 hours × $0.03/TU-hour. Excludes $0.028/million billable 64-KB ingress units; diagnostic batching is unknown.`,
        eventHubsLimitExceeded ? 'eventhubs-limits' : 'eventhubs-pricing'),
      pricedLine('rum-storage', 'Fabric · additional browser OneLake storage', rumDailyGB * retentionDays / reference.compression, reference.storageGBMonth,
        `${rumMonthlyGB} GB/month ÷ ${days} days × ${retentionDays} retention days ÷ 5 assumed compression × $0.023/GB-month`, 'azure-retail-fabric'),
    ] : []),
    pricedLine('grafana', 'Grafana Standard X1 hosting', hours * 2, reference.standardUnitHour,
      `2 Standard Units × ${hours} hours × $0.0342/SU-hour`, 'grafana-price'),
    pricedLine('users', 'Grafana active users · assumed team of 5', 5, reference.userMonth,
      '5 assumed monthly active users × $6/user-month', 'azure-retail-grafana'),
    pricedLine('runtime', 'Estimated Collector compute baseline', collectorReplicas * hours * 3600, collectorRate,
      `${collectorReplicas} assumed replica(s) × ${hours} hours × 3,600 × (0.5 vCPU × $0.000024 + 1 GiB × $0.000003)/second; before grants`, 'azure-retail-collector'),
  ];
  function project(ratio: number) {
    const baselineUnits = capacity(baselineMonthlyGB * ratio / hours * reference.headroom);
    const units = capacity(monthlyGB * ratio / hours * reference.headroom);
    const baseline = pricedLine('fabric', baselineUnits === null ? 'Fabric capacity · beyond reference range' : `Illustrative baseline Fabric capacity · F${baselineUnits}`,
      hours, baselineUnits === null ? null : baselineUnits * reference.cuHour,
      `Reference ${ratio} CU-hours/GB × ${baselineMonthlyGB} GB ÷ ${hours} hours × 1.3 planning headroom; rounded to an F SKU, minimum F2. SKU-hour price = CUs × $0.18`, 'fabric-cost-drivers');
    const incremental = rumEnabled ? [
      pricedLine('rum-fabric', 'Fabric · incremental browser capacity', hours,
        units === null || baselineUnits === null ? null : (units - baselineUnits) * reference.cuHour,
        `Combined ${units === null ? 'beyond reference range' : `F${units}`} minus baseline ${baselineUnits === null ? 'beyond reference range' : `F${baselineUnits}`}; only added capacity is charged`, 'fabric-cost-drivers'),
    ] : [];
    return { units, stack: ledger([baseline, ...incremental, ...common]) };
  }
  const lower = project(reference.lowerCUHoursPerGB);
  const continuous = project(reference.continuousCUHoursPerGB);
  const source = vendor === 'Datadog' ? original.datadog : original.coralogix;
  const target = continuous.stack;
  const automatic = {
    dailyGB, monthlyGB, retentionDays, hours, retainedGB, collectorReplicas,
    rum: { enabled: rumEnabled, monthlyGB: rumMonthlyGB, dailyGB: rumDailyGB, volumeBasis, requiredThroughputUnits, incrementalThroughputUnits, eventHubsLimitExceeded, eventHubsLimitExplanation },
    region: reference.region,
    capacitySKU: continuous.units === null ? 'Beyond F1024 reference range' : `F${continuous.units}`,
    capacityUnits: continuous.units,
    lowerMonthly: lower.stack.complete ? lower.stack.total : null,
    upperMonthly: target.complete ? target.total : null,
    basis: 'Automatic planning projection from source usage using two published Eventhouse examples and explicit application assumptions; not a Microsoft sizing formula or quote.',
    assumptions: [
      'USD West US 3 pay-as-you-go references, checked 2026-11-21. Customer agreements and other regions can differ.',
      `All three entered signals are retained: ${baselineDailyGB} original GB/day and ${baselineMonthlyGB} GB per ${days}-day month.`,
      'Two Microsoft production examples supply sensitivity references: 23 CU-hours/1,000 GB (infrequent access) and 817 CU-hours/2,500 GB (continuous queries). Their ratios are extrapolated, not published sizing guarantees.',
      `New dedicated capacity runs ${hours} hours/month. Average reference CU demand gets 30% application-assumed headroom and rounds up to a listed F SKU, minimum F2. Existing shared capacity is not presumed free.`,
      `Steady-state retained storage uses ${retentionDays} days for all signals and an assumed 5:1 compression ratio. Datadog uses the selected source log-retention period; Coralogix assumes 30 days.`,
      'Grafana Standard X1 uses 2 Standard Units and an assumed team of 5 active users. Service accounts and API keys count as users. No trial discount is assumed.',
      'Collector planning assumes one 0.5-vCPU/1-GiB active replica per 250 GB/day, at least one replica. The 250 GB/day threshold is an application assumption, not a benchmark. Compute is priced before shared free grants. Browser telemetry bypasses this Collector.',
      'Always-on Eventhouse is assumed; no separately billed hot-cache line is added. No additional Eventhouse CU charge is added on top of dedicated capacity.',
      ...(rumEnabled ? [
        `Browser path: Application Insights browser SDK → Azure Monitor diagnostic settings → Event Hubs → Fabric Eventhouse; no custom intake. ${volumeBasis}.`,
        'The source RUM volume is an estimated 1:1 proxy for Application Insights ingestion and exported Fabric volume. Export JSON bytes can differ from billed ingestion bytes; SDK events, sampling, serialization and enrichment also change actual GB. Exclude this volume from the entered logs, traces and metrics.',
        `RUM storage is estimated using ${retentionDays} days (${vendor === 'Datadog' ? 'selected Datadog log retention' : 'assumed for Coralogix'}). fabric/rum.kql defaults RUMEnvelopes retention to 7 days; review like-for-like retention before comparing costs.`,
        `Application Insights Analytics is $2.30/GB before any billing-account free grant; no 5 GB grant is presumed available. Event Hubs Standard is $0.03/TU-hour for a fixed 730 hours/month.`,
        `Event Hubs requires ${requiredThroughputUnits} TU(s), with a 1-TU minimum even at zero traffic, sized by average ingress at 1 MB/s per TU${scenario.rumSharedEventHub ? eventHubsLimitExceeded ? '; a shared-TU credit cannot bypass the namespace limit' : '; one already-paid TU with confirmed spare capacity is credited' : '; no existing TU is credited'}.`,
        'infra/optional/rum.bicep provisions a dedicated Event Hubs namespace. The shared-TU credit represents an alternative existing SAS-compatible namespace and connection with confirmed spare capacity; it is not provisioned by this template.',
        rumProvisioningAssumption,
        'Microsoft currently lists no separate diagnostic export charge for AppPageViews, AppBrowserTimings, AppEvents, AppExceptions and AppDependencies; only these browser categories are assumed. Other categories or future prices can differ.',
        'The Fabric browser-capacity line is only the difference between combined and baseline rounded SKUs; browser storage is incremental. No replay or full RUM capability is implied.',
      ] : []),
    ],
    limitations: [
      'The two reference totals are not a confidence interval. Real costs can fall outside them; query concurrency, transformations, schemas, peak load and cache needs require a measured pilot.',
      'Average CU extrapolation cannot guarantee that a capacity handles peaks or meets latency requirements. A listed SKU is illustrative, not a deployment recommendation.',
      'Collector throughput, memory, retries and autoscaling require load testing. Request charges, diagnostics, networking, redundancy, support, setup labor and specialist/on-call replacements are excluded.',
      ...(rumEnabled ? [
        'Event Hubs ingress event charges are excluded and variable: $0.028 per million billable 64-KB units in West US 3. Each message rounds up, and diagnostic batching is unknown. Capture, network, peak throughput, event rate and additional readers are also excluded; 730-hour average volume is not peak sizing.',
        'Application Insights retention beyond included terms, sampling differences and browser instrumentation scope can change costs. Application Insights browser telemetry is not session replay or full vendor RUM parity.',
      ] : []),
      ...(eventHubsLimitExplanation ? [eventHubsLimitExplanation] : []),
      ...(continuous.units === null ? ['This workload exceeds the supported F2–F1024 reference range. No full target total or difference is calculated.'] : []),
    ],
  };
  return { ...original, target, automatic, savings: source.complete && target.complete ? source.total - target.total : null };
}
