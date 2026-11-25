import { capabilities } from './capabilities.ts';
import type { Capability, CapabilityId } from './capabilities.ts';
export type Vendor = 'Datadog' | 'Coralogix';
export type Status = 'Translate' | 'Redesign' | 'Specialist';
export type Feature = {
  id: string; category: string; name: string; datadog: string; coralogix: string;
  status: Status; targets: string[]; rationale: string; shipment: string; sources: string[];
  capabilities: Record<Vendor, Capability>;
};
const rows: [CapabilityId, string, string, string, string, Status, string[], string, string, string[]][] = [
  ['dashboards','Explore','Dashboards & widgets','Dashboards, template variables and widgets','Custom dashboards and widgets','Translate',['Azure Managed Grafana panels','Fabric Real-Time Dashboards'],'Rebuild panels and variables; validate aggregation, time range and permissions. No dashboard JSON conversion.','Sample Grafana and Fabric dashboards',['cx-features','fabric-consumption']],
  ['queries','Explore','Queries & saved searches','Log search DSL and saved views','DataPrime, Lucene and saved queries','Translate',['KQL querysets + Grafana','Fabric Real-Time Dashboards'],'Manual semantic rewrite; compare null handling, parsing, joins, time windows and output against fixtures. No exact query parity.','Raw tables and KQL views',['cx-features','fabric-consumption']],
  ['logs','Telemetry','Log ingestion & parsing','Pipelines, processors and facets','Parsing rules and enrichment','Translate',['OTLP collector → Eventhouse','Fabric Eventstreams → Eventhouse'],'Map fields, timestamps and severity; recreate parsing/enrichment and test schema evolution.','OTLP raw log tables and views',['fabric-consumption','cx-features']],
  ['retention','Data lifecycle','Retention & indexing','Indexed logs and exclusion filters','Priority tiers and retention policies','Redesign',['Eventhouse retention policies','Eventhouse + customer archive'],'Validate query performance, compliance and hot-cache requirements against source data-lifecycle policies.','Policies require customer configuration',['dd-pricing','cx-tco','fabric-consumption']],
  ['archive','Data lifecycle','Archive & rehydration','Log archives and rehydration','Customer-owned archive and retrieval','Redesign',['Customer Azure Storage archive','OneLake export + governed retrieval'],'Design export, lifecycle, retrieval latency and egress. Archive and cache are separate responsibilities and costs.','Not a turnkey archive workflow',['fabric-price','cx-features']],
  ['metrics','Telemetry','Metrics & dimensional series','Custom metrics and tags','Metrics ingestion and dimensions','Translate',['OTLP metrics → Eventhouse','Azure Monitor managed Prometheus + Grafana'],'Validate temporality, aggregation and cardinality. Prometheus is a separate priced service; sample metrics are not complete infrastructure monitoring.','OTLP metrics tables/views',['dd-metrics','fabric-consumption']],
  ['hosts','Infrastructure','Host monitoring','Infrastructure host integrations','Infrastructure monitoring','Translate',['Azure Monitor agents + Grafana','OTel hostmetrics collector → Eventhouse'],'Add agents, permissions, OS integrations and host identity; validate coverage before removing source agents.','Additional instrumentation required',['dd-pricing','azure-alerts']],
  ['containers','Infrastructure','Containers & Kubernetes','Container monitoring and orchestrator explorer','Kubernetes monitoring','Translate',['Managed Prometheus + Grafana','OTel Kubernetes receivers → Eventhouse'],'Cluster/node/pod inventory, kube-state and collector resources need deployment and operations.','Not turnkey Kubernetes monitoring',['dd-metrics','azure-alerts']],
  ['apm','Applications','APM traces & service views','APM service map and trace explorer','APM and distributed traces','Translate',['OTLP traces → Eventhouse + Grafana','Azure Application Insights'],'Trace/span correlation can move; service map, sampling and vendor-specific diagnostics require separate validation. App Insights billed separately.','OTLP trace tables and Grafana views',['dd-apm','cx-features']],
  ['sampling','Applications','Trace sampling & retention','Ingestion controls and indexed spans','Head/tail sampling and priorities','Redesign',['OTel collector sampling','Eventhouse retention + KQL selectors'],'Design sampling under load; preserve rare-error visibility and quantify loss. Retention does not recreate indexed span selection.','Customer collector configuration',['dd-apm','cx-tco']],
  ['correlation','Explore','Logs, traces & metrics correlation','Unified tags and trace-log linking','Contextual signal correlation','Translate',['Grafana links + KQL joins','Fabric Real-Time Dashboards'],'Normalize service/resource IDs, trace IDs and clock semantics; links alone do not prove full correlation.','Three-signal sample views',['cx-features','fabric-consumption']],
  ['slo','Reliability','SLOs & error budgets','SLO tracking and burn-rate monitors','SLO management','Translate',['KQL error budgets + Grafana','Fabric dashboards + Activator'],'Specify denominator, time windows, burn rate and no-data semantics; validate historical budgets and alert timing.','Customer queries/rules required',['kql-alerts','activator']],
  ['monitors','Reliability','Monitors & threshold alerts','Metric/log/APM monitors','Standard and flow alerts','Translate',['Grafana KQL/ADX alerting','Fabric Activator','Native Azure Monitor alerts'],'Rewrite conditions and no-data behavior. Prefer native Azure Monitor alerts for Azure Monitor services; Microsoft does not officially support Grafana alerting against those services.','Baseline alerts do not ship; optional RTI OnCall authors rules',['kql-alerts','azure-alerts','activator']],
  ['routing','Reliability','Notification routing & grouping','Notification rules and monitor routing','Alert grouping and routing','Translate',['Grafana Alertmanager policies','Activator integrations'],'Recreate grouping keys, contact points, silences and mute timings. Delivery routing is not responder scheduling.','Customer policies/integrations required',['routing','activator']],
  ['oncall','Reliability','On-call schedules & escalation','Datadog On-Call','On-call integration and escalation workflows','Specialist',['External paging platform','Engineered Power Automate + ACS'],'Independently license or build schedules, acknowledgement, retries and escalation. Responder simulation in this repo is not production paging.','No production schedules/escalation service',['dd-pricing','routing','activator']],
  ['incidents','Reliability','Incident management','Incident timelines and response','Incident investigation and integrations','Specialist',['ITSM / incident platform','Power Automate + ITSM integration'],'Design ownership, audit, incident lifecycle and stakeholder communication. Do not treat alert history as incident management.','Not shipped',['routing','cx-features']],
  ['rum','Experience','Real user monitoring','RUM Measure and fuller RUM offerings','Real user monitoring','Specialist',['Specialist RUM product','Application Insights browser telemetry (validate scope)'],'Validate consent, user journeys, privacy and frontend instrumentation.','No RUM parity',['dd-pricing','cx-features']],
  ['replay','Experience','Session replay','Session Replay','Session replay','Specialist',['Specialist replay product','Retain source replay service'],'Requires privacy controls, capture and replay engine; Eventhouse storage is not session replay.','Not shipped',['dd-pricing','cx-features']],
  ['synthetics','Experience','Synthetic API & browser tests','API and browser synthetics','Synthetic monitoring','Specialist',['Azure availability tests (scope validation)','Specialist browser/API testing service'],'Real testing fleet, locations, assertions and browser execution required. Synthetic Container Apps sample job is telemetry generation, not a testing fleet.','No production synthetic fleet',['dd-pricing','collector-price']],
  ['profiling','Applications','Continuous profiling','Continuous profiler','Continuous profiling','Specialist',['Specialist profiler','Retain source profiling'],'CPU/heap capture, symbolization and diagnostic experience need a specialist. Do not claim trace-view parity with profiling.','Not shipped',['dd-apm','cx-features']],
  ['db','Applications','Database monitoring','Database Monitoring','Database observability','Redesign',['Database-native monitoring + Grafana','Azure Monitor + custom collectors'],'Match the documented source diagnostic scope; validate permissions and sensitive SQL handling. Additional target licensing may apply.','Not shipped as database monitoring',['dd-pricing','cx-features']],
  ['security','Security & access','SIEM & security detections','Cloud SIEM and security monitoring','Security analytics and detections','Specialist',['Microsoft Sentinel','Specialist SIEM'],'Separate ingestion costs, detection engineering, retention and security operations. Observability KQL queries are not a SIEM replacement.','Not shipped',['dd-pricing','cx-features']],
  ['posture','Security & access','Cloud posture & workload security','CSPM / workload security','Cloud security integrations','Specialist',['Microsoft Defender for Cloud','Specialist workload security'],'Policy posture, vulnerability scans and runtime protection require specialist services and permissions.','Not shipped',['dd-pricing','cx-features']],
  ['rbac','Security & access','RBAC, SSO & tenancy','Roles, teams and organization access','Teams, scopes and SSO','Redesign',['Entra + Fabric workspace roles','Entra + Grafana roles'],'Design Fabric and Grafana access separately; test least privilege, service identities, row-level requirements and tenant boundaries.','Separate platform access configuration',['fabric-consumption','grafana-price']],
  ['audit','Security & access','Audit & compliance evidence','Audit trail and retention','Audit logs and compliance controls','Redesign',['Azure/Fabric audit + governed storage','SIEM audit integration'],'Validate available audit events, export, retention, access and compliance evidence. No certification inherited by migration.','Customer governance required',['fabric-consumption','cx-features']],
  ['notebooks','Explore','Notebooks & investigation','Notebooks and collaborative investigation','Query workspaces and investigation','Redesign',['KQL querysets','Fabric notebooks'],'Rebuild notebooks with permissions and compute costs; translate investigation workflows rather than vendor notebook formats.','Querysets possible; notebooks customer-authored',['fabric-consumption','cx-features']],
  ['integrations','Platform','Integrations & enrichment','Integration catalog and webhooks','Integrations, enrichment and webhooks','Redesign',['OTel receivers/processors','Eventstreams + Power Automate'],'Inventory integration-specific receivers, enrichment sources, auth and rate limits. No vendor connector in this planner.','Three-signal OTLP receiver only',['collector-price','activator']],
];
export const retiredFeatureIds = ['exports','quotas','ownership'] as const;
export const features: Feature[] = rows.map(([id,category,name,datadog,coralogix,status,targets,rationale,shipment,sources]) => ({id,category,name,datadog,coralogix,status,targets,rationale,shipment,sources,capabilities:capabilities[id]}));
export function featuresForVendor(vendor: Vendor): Feature[] {
  return features.filter(f => f.capabilities[vendor].support !== 'Not verified').map(f => ({
    ...f, name: f.capabilities[vendor].name,
    rationale: `${f.capabilities[vendor].migration} ${f.rationale}`,
  }));
}
export type Choice = { needed: boolean; count: number; priority: 'Must' | 'Should' | 'Could'; target: string };
export type Plan = Record<string, Choice>;
export function parseInventoryCount(value: string): number | null {
  if (!value.trim() || !/^\d+$/.test(value.trim())) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 && count <= 1e6 ? count : null;
}
export function initialPlan(): Plan {
  return Object.fromEntries(features.map(f => [f.id,{ needed: ['dashboards','queries','logs','metrics','apm','monitors'].includes(f.id), count: 1, priority: 'Must', target: f.targets[0] }]));
}
export function filterFeatures(vendor: Vendor, query: string, category: string, status: string, selectedOnly: boolean, plan: Plan) {
  const q = query.trim().toLowerCase();
  return featuresForVendor(vendor).filter(f => (category === 'All' || f.category === category) && (status === 'All' || f.status === status) && (!selectedOnly || plan[f.id]?.needed) && `${f.name} ${f.capabilities[vendor].description} ${f.capabilities[vendor].support} ${f.targets.join(' ')}`.toLowerCase().includes(q));
}
export function planCounts(plan: Plan, vendor: Vendor = 'Datadog') {
  return featuresForVendor(vendor).reduce((a,f) => { if (plan[f.id]?.needed) { a.selected++; a[f.status]++; } return a; }, {selected:0, Translate:0, Redesign:0, Specialist:0});
}
export function validPlan(value: unknown): value is Plan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Plan;
  return Object.keys(p).length === features.length && features.every(f => {
    const c = p[f.id];
    return c && typeof c.needed === 'boolean' && Number.isSafeInteger(c.count) && c.count >= 0 && c.count <= 1e6 && ['Must','Should','Could'].includes(c.priority) && f.targets.includes(c.target);
  });
}
export function restorePlan(value: unknown): Plan | null {
  if (validPlan(value)) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  const ids = features.map(f => f.id);
  if (Object.keys(saved).length !== ids.length + retiredFeatureIds.length ||
      !ids.every(id => Object.hasOwn(saved, id)) ||
      !retiredFeatureIds.every(id => Object.hasOwn(saved, id))) return null;
  const active = Object.fromEntries(ids.map(id => [id, saved[id]]));
  return validPlan(active) ? active : null;
}
