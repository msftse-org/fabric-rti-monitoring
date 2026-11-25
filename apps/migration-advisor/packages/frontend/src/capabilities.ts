// Documentation review supplied for the 27 migration categories, not the full
// vendor portfolio or an assessment of customer licensing/entitlement.
export type SupportKind = 'Native' | 'Integration' | 'Limited scope' | 'Separate offering' | 'Not verified';
export type Capability = {
  name: string;
  description: string;
  support: SupportKind;
  evidence: { url: string; reviewed: string }[];
  migration: string;
};
const reviewed = '2026-11-21';
function capability(name: string, description: string, support: SupportKind, urls: string[], migration: string): Capability {
  return { name, description, support, evidence: urls.map(url => ({ url, reviewed })), migration };
}
const dd = (name: string, description: string, path: string, migration: string, extra: string[] = []) =>
  capability(name, description, 'Native', [`https://docs.datadoghq.com/${path}`, ...extra], migration);
const cx = (name: string, description: string, path: string, migration: string, support: SupportKind = 'Native', extra: string[] = []) =>
  capability(name, description, support, [`https://coralogix.com/docs/${path}`, ...extra], migration);
export const capabilities = {
  dashboards: {
    Datadog: dd('Datadog Dashboards', 'Dashboards with widgets and template variables.', 'dashboards/llms.txt', 'Recreate Datadog widget queries and template-variable behavior.'),
    Coralogix: cx('Coralogix Custom Dashboards', 'Custom dashboards and telemetry widgets.', 'user-guides/custom-dashboards/introduction/', 'Recreate Coralogix widgets and their query semantics.'),
  },
  queries: {
    Datadog: dd('Log Explorer & saved views', 'Log search DSL, exploration and saved views.', 'logs/explorer.md', 'Translate Datadog search DSL and saved views to KQL.'),
    Coralogix: cx('DataPrime & query history', 'DataPrime query language and reusable query history for investigation.', 'user-guides/data_exploration/query-history/', 'Translate DataPrime/Lucene semantics and query-history workflows, not notebook formats.', 'Native', ['https://coralogix.com/docs/dataprime/introduction/welcome-to-the-dataprime-reference/']),
  },
  logs: {
    Datadog: dd('Log pipelines & processors', 'Ingestion pipelines, processing and structured log fields.', 'logs/log_configuration/pipelines.md', 'Rebuild processors and facets with tested field mappings.'),
    Coralogix: cx('Log parsing & enrichment', 'Parsing rules transform logs into structured fields.', 'user-guides/data-transformation/parsing/log-parsing-rules/', 'Rebuild parsing and enrichment rules in collectors or ingestion transforms.'),
  },
  retention: {
    Datadog: dd('Log indexes & retention', 'Log indexes, retention settings and exclusion filters.', 'logs/log_configuration/indexes.md', 'Replace index/exclusion semantics explicitly; storage retention is not indexed-event parity.'),
    Coralogix: cx('TCO priorities & retention', 'TCO Optimizer priority and retention policies control telemetry treatment.', 'user-guides/account-management/tco-optimizer/', 'Map priority-dependent query, alert and dashboard availability; do not substitute Datadog indexed-event semantics.'),
  },
  archive: {
    Datadog: dd('Log Archives & rehydration', 'Log archives and workflows to rehydrate archived logs for investigation.', 'logs/log_configuration/archives.md', 'Plan archive export and rehydration access, latency and cost.'),
    Coralogix: cx('Direct archive querying', 'Explore can query customer archive data directly.', 'user-guides/data-query/archive-query/archive-query-from-the-explore-screen/', 'Preserve direct archive-query workflows; this is not a Datadog-style rehydration requirement.'),
  },
  metrics: {
    Datadog: dd('Datadog Metrics', 'Metric ingestion, dimensional series and metric exploration.', 'metrics/llms.txt', 'Validate tags, series cardinality and metric aggregation.'),
    Coralogix: cx('Metrics Explorer', 'Explore metrics and dimensions across telemetry.', 'user-guides/data_exploration/metrics-explorer/', 'Validate metric dimensions and query aggregation rather than Datadog custom-series billing semantics.'),
  },
  hosts: {
    Datadog: dd('Infrastructure Monitoring', 'Host infrastructure telemetry and integrations.', 'infrastructure/llms.txt', 'Inventory Datadog Agent host integrations and replacement coverage.'),
    Coralogix: cx('Infrastructure Explorer · hosts', 'Host monitoring through Infrastructure Explorer.', 'user-guides/infrastructure/infrastructure-explorer/getting-started-host-monitoring/', 'Inventory host telemetry receivers and identity needed to rebuild host views.'),
  },
  containers: {
    Datadog: dd('Container & Kubernetes Monitoring', 'Container and orchestrator telemetry and exploration.', 'containers/llms.txt', 'Rebuild container/orchestrator views and check source Agent coverage.'),
    Coralogix: cx('Infrastructure Explorer · Kubernetes', 'Kubernetes monitoring in Infrastructure Explorer.', 'user-guides/infrastructure/infrastructure-explorer/getting-started-kubernetes-monitoring/', 'Rebuild Kubernetes entity relationships and collector coverage; Datadog container allowances do not describe this capability.'),
  },
  apm: {
    Datadog: dd('Datadog APM', 'Distributed traces, service views and trace exploration.', 'apm/llms.txt', 'Validate Datadog tracing instrumentation, diagnostics and service-map semantics.'),
    Coralogix: cx('Coralogix APM', 'Distributed trace and service observability.', 'user-guides/apm-v2/', 'Validate OTel instrumentation, service entities and span-derived views.'),
  },
  sampling: {
    Datadog: dd('APM ingestion & retention controls', 'APM ingestion sampling and retained/indexed span controls.', 'apm/llms.txt', 'Distinguish Datadog ingestion sampling from retention/indexed-span selection.'),
    Coralogix: cx('OTel sampling & TCO priorities', 'Collector sampling configuration and TCO priority policies govern trace treatment.', 'user-guides/apm-v2/getting-started/span-metrics-recommended-configuration/', 'Sampling runs in the OTel collector; preserve span-metric accuracy and priority behavior, not Datadog indexed-span equivalence.', 'Native', ['https://coralogix.com/docs/user-guides/account-management/tco-optimizer/']),
  },
  correlation: {
    Datadog: dd('APM & log correlation', 'Link traces and logs using shared trace and service context.', 'apm/llms.txt', 'Preserve trace IDs and Datadog service/tag correlation conventions.'),
    Coralogix: cx('Service Map & linked telemetry', 'Service relationships and linked telemetry using resource and trace context.', 'user-guides/apm-v2/features/service-map/', 'Normalize common resource and trace IDs before rebuilding contextual links.'),
  },
  slo: {
    Datadog: dd('Service Level Objectives', 'SLO tracking, error budgets and related monitors.', 'service_level_objectives/llms.txt', 'Validate SLO windows, budget history and burn-rate monitor behavior.'),
    Coralogix: cx('SLO Center & service SLOs', 'SLOs, budgets and service-level objectives; permissions and account availability vary.', 'user-guides/slos/introduction/', 'Confirm account access and validate service denominators, budget windows and alert semantics.', 'Native', ['https://coralogix.com/docs/user-guides/apm-v2/features/service-slos/']),
  },
  monitors: {
    Datadog: dd('Datadog Monitors', 'Metric, log and APM monitors with alert conditions and notifications.', 'monitors/llms.txt', 'Translate monitor conditions; do not import monitor JSON as target rules.'),
    Coralogix: cx('Coralogix Alerts', 'Log, metric, trace and flow alerting.', 'user-guides/alerting/introduction-to-alerts/', 'Translate Coralogix alert/flow conditions and no-data behavior, not Datadog monitor formats.'),
  },
  routing: {
    Datadog: dd('Monitor notification routing', 'Monitor notifications and routing to responder destinations.', 'monitors/llms.txt', 'Rebuild monitor destinations and routing independently of On-Call schedules.'),
    Coralogix: cx('Notification Center', 'Alert routing and notification connectors.', 'user-guides/notification-center/introduction/', 'Rebuild connector routing; Notification Center does not establish native on-call scheduling.'),
  },
  oncall: {
    Datadog: dd('Datadog On-Call', 'Vendor-owned responder schedules and escalation policies.', 'incident_response/on-call.md', 'Replace schedules, escalation and acknowledgement deliberately; Native does not imply included licensing.'),
    Coralogix: cx('PagerDuty on-call integration', 'Cases integrate with external PagerDuty, including bidirectional acknowledgement and resolution.', 'user-guides/cases/pagerduty-integration/', 'Preserve external PagerDuty schedules/escalation and connector state synchronization; reviewed evidence does not establish a native schedule engine.', 'Integration'),
  },
  incidents: {
    Datadog: dd('Datadog Incident Management', 'Incident declaration, responders, timelines and postmortems.', 'incident_response/incident_management.md', 'Preserve responder coordination, timeline and postmortem workflows.'),
    Coralogix: cx('Coralogix Cases', 'Cases replace Incidents with ownership, triage and lifecycle management.', 'user-guides/cases/cases-incidents/', 'Map Cases ownership, triage and lifecycle; do not assume full Datadog postmortem parity.', 'Native', ['https://coralogix.com/docs/user-guides/cases/overview/']),
  },
  rum: {
    Datadog: dd('Datadog Real User Monitoring', 'Browser/mobile real user telemetry and user-experience investigation.', 'rum_session_replay/llms.txt', 'Validate browser/mobile coverage and privacy; RUM Measure session pricing does not represent full RUM or replay.'),
    Coralogix: cx('Coralogix Real User Monitoring', 'SDK-based real user telemetry and user-experience investigation.', 'user-guides/rum/getting-started/real-user-monitoring/', 'Validate SDK coverage, consent and journey analysis; Datadog RUM Measure pricing language does not apply to Coralogix.'),
  },
  replay: {
    Datadog: dd('Datadog Session Replay', 'Session capture and replay for user-experience investigation.', 'session_replay/llms.txt', 'Retain privacy and capture controls when choosing a replay engine.'),
    Coralogix: cx('Coralogix Session Replay', 'Replay for web, iOS, Android, React Native and Flutter, with privacy masking and SDK sampling.', 'user-guides/rum/product-features/session-replay/', 'Validate platform SDKs, masking and replay sampling before replacing the capture/replay experience.'),
  },
  synthetics: {
    Datadog: dd('Datadog Synthetic Testing', 'Vendor-owned API and browser synthetic testing.', 'synthetic_testing_and_monitoring/llms.txt', 'Replace real test execution, locations and assertions, not just test-result storage.'),
    Coralogix: cx('Synthetic monitoring via Checkly', 'API/browser tests run in a separate Checkly account; Coralogix ingests results by webhook. Telegraf can provide simple probes.', 'user-guides/monitoring-and-insights/synthetic-monitoring/synthetic-monitoring-with-checkly/', 'Keep or replace Checkly execution and account separately; webhook ingestion is not a native Coralogix browser fleet.', 'Integration'),
  },
  profiling: {
    Datadog: dd('Datadog Continuous Profiler', 'Continuous code-level runtime profiling.', 'continuous_profiler/llms.txt', 'Validate runtime capture, symbols and code-level diagnostic workflows.'),
    Coralogix: cx('Coralogix Continuous Profiling', 'OTel profiling signal for CPU/memory code-level bottlenecks; runtime support varies.', 'user-guides/continuous-profiling/introduction/', 'Validate supported runtimes and OTel profile capture; traces alone cannot replace CPU/memory profiling.'),
  },
  db: {
    Datadog: dd('Datadog Database Monitoring', 'Agent-based database monitoring with query explain plans and historical database/host metrics.', 'database_monitoring/', 'Rebuild per-engine query plans, waits and historical engine/host diagnostics.'),
    Coralogix: cx('Database client-span insights', 'First-class database entities and RED metrics derived from DATABASE CLIENT SPANS using database system, namespace and operation.', 'user-guides/apm-v2/databases/', 'Enable spanmetrics and database client instrumentation; no database agent is required. Reviewed scope is client-span insights, not deep engine plans/waits parity.', 'Limited scope'),
  },
  security: {
    Datadog: dd('Datadog Cloud SIEM', 'Security detection and investigation in Cloud SIEM.', 'security/cloud_siem.md', 'Map SIEM detection engineering and security operations independently of observability monitors.'),
    Coralogix: capability('Snowbit SIEM / MDR', 'Vendor-affiliated Snowbit SIEM threat detections, rules and dashboards with managed security offerings.', 'Separate offering', ['https://snowbit.io/siem-platform/'], 'Confirm Snowbit SIEM/MDR offering and operations scope; base observability alerts do not imply SIEM/MDR entitlement.'),
  },
  posture: {
    Datadog: dd('Cloud Security & Workload Protection', 'Cloud security posture and workload/runtime protection products.', 'security/cloud_security_management.md', 'Evaluate posture and runtime protection separately when choosing Defender or another specialist.', ['https://docs.datadoghq.com/security/workload_protection.md']),
    Coralogix: cx('Snowbit CSPM scanners', 'AWS/Azure posture scanners deployed by the customer with Docker/cron and cloud credentials or RBAC.', 'user-guides/security/cloud-security-posture-management/azure-cspm/', 'Confirm Snowbit offering, scanner operations and permissions. Posture scanning is narrower than the grouped posture/runtime row; full runtime prevention parity is not verified.', 'Separate offering', ['https://coralogix.com/docs/user-guides/security/cloud-security-posture-management/aws-cloud-security-posture-management/']),
  },
  rbac: {
    Datadog: dd('Datadog roles, teams & SSO', 'Account roles, teams and organization access management.', 'account_management/llms.txt', 'Translate source roles and team boundaries into separately tested target permissions.'),
    Coralogix: cx('Coralogix permissions & SAML SSO', 'Permission controls and SAML single sign-on.', 'user-guides/aaa/access-control/permissions/', 'Map source permissions and SAML identities to Entra and target workspace roles.', 'Native', ['https://coralogix.com/docs/user-guides/account-management/user-management/sso-with-saml/']),
  },
  audit: {
    Datadog: dd('Datadog Audit Trail', 'Audit trail of account and platform activity.', 'security/audit_trail.md', 'Inventory actual audit events and required retention evidence.'),
    Coralogix: cx('Coralogix Audit', 'Coralogix account audit events.', 'user-guides/account-management/coralogix-audit/', 'Inventory documented audit events rather than assuming a compliance certification or Datadog event-schema parity.'),
  },
  notebooks: {
    Datadog: dd('Datadog Notebooks', 'Collaborative notebooks for telemetry investigation.', 'notebooks/llms.txt', 'Rebuild collaborative notebook content and permissions; validate target compute costs.'),
    Coralogix: cx('Collaborative notebooks', 'Not verified in reviewed documentation. The official index includes query history, investigation and Cases, but those are not native collaborative notebook parity.', 'llms.txt', 'Do not map investigation screens as notebooks; retain any hidden Datadog notebook choice in the union plan.', 'Not verified'),
  },
  integrations: {
    Datadog: dd('Datadog Integrations', 'Vendor integration catalog and telemetry integration workflows.', 'integrations/llms.txt', 'Inventory installed integrations and their credentials, enrichment and receiver requirements.'),
    Coralogix: cx('Integration packages & enrichment', 'Integration packages and enrichment workflows.', 'user-guides/getting-started/packages-and-extensions/integration-packages/', 'Inventory Coralogix packages and enrichment dependencies before choosing target receivers/processors.'),
  },
} satisfies Record<string, { Datadog: Capability; Coralogix: Capability }>;
export type CapabilityId = keyof typeof capabilities;
