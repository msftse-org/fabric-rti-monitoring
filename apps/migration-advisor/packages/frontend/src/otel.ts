export const signals = ['logs', 'metrics', 'traces'] as const;
export type Signal = typeof signals[number];
export interface OtelSettings {
  mode: 'replace' | 'dual';
  auth: 'local' | 'workload' | 'system' | 'user' | 'principal';
  workspaceName: string;
  eventhouseName: string;
  queryUri: string;
  database: string;
  grafanaUrl: string;
  collectorName: string;
  collectorEndpoint: string;
  logs: boolean;
  metrics: boolean;
  traces: boolean;
  logsTable: string;
  metricsTable: string;
  tracesTable: string;
  logsPipeline: string;
  metricsPipeline: string;
  tracesPipeline: string;
  logsExporters: string;
  metricsExporters: string;
  tracesExporters: string;
}
export function defaultOtel(): OtelSettings {
  return {
    mode: 'dual', auth: 'local', workspaceName: '', eventhouseName: '',
    queryUri: '', database: 'observability', grafanaUrl: '', collectorName: '', collectorEndpoint: '',
    logs: true, metrics: true, traces: true,
    logsTable: 'OTELLogs', metricsTable: 'OTELMetrics', tracesTable: 'OTELTraces',
    logsPipeline: 'logs', metricsPipeline: 'metrics', tracesPipeline: 'traces',
    logsExporters: '', metricsExporters: '', tracesExporters: '',
  };
}
const exporterId = 'azuredataexplorer/fabric';
const component = /^[a-z][a-z0-9_]*(?:\/[a-zA-Z0-9_.-]+)?$/;
function https(value: string): boolean {
  if (value.length > 300 || /[\s\x00-\x1f\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
export function exporterIds(value: string): string[] {
  return [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))];
}
export function validateOtel(s: OtelSettings): Partial<Record<keyof OtelSettings, string>> {
  const errors: Partial<Record<keyof OtelSettings, string>> = {};
  if (!['replace', 'dual'].includes(s.mode)) errors.mode = 'Select replacement or dual output.';
  if (!['local', 'workload', 'system', 'user', 'principal'].includes(s.auth)) errors.auth = 'Select a supported collector authentication method.';
  if (!https(s.queryUri) || new URL(s.queryUri).pathname !== '/') errors.queryUri = 'Use the HTTPS KQL database query origin, not an OTLP or ingestion URL.';
  if (!/^[a-zA-Z0-9_. -]{1,100}$/.test(s.database)) errors.database = 'Enter a database name (1-100 letters, numbers, spaces, dots, underscores or hyphens).';
  if (!signals.some(signal => s[signal])) errors.logs = 'Select at least one signal.';
  for (const key of ['workspaceName', 'eventhouseName', 'collectorName'] as const) {
    if (s[key].length > 150 || /[\r\n\x00-\x1f]/.test(s[key])) errors[key] = 'Use a single-line name under 150 characters.';
  }
  for (const key of ['grafanaUrl', 'collectorEndpoint'] as const) {
    if (s[key] && (!https(s[key]) || s[key].length > 300)) errors[key] = 'Use an HTTPS URL without credentials, query parameters or fragments.';
  }
  for (const signal of signals) {
    if (!s[signal]) continue;
    const table = `${signal}Table` as const;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(s[table])) errors[table] = 'Use a simple table identifier (letters, numbers and underscores).';
    if (s.mode === 'dual') {
      const pipeline = `${signal}Pipeline` as const;
      const exporters = `${signal}Exporters` as const;
      if (!component.test(s[pipeline]) || s[pipeline].split('/')[0] !== signal) errors[pipeline] = `Use the existing ${signal} pipeline ID, e.g. ${signal}/production.`;
      const ids = exporterIds(s[exporters]);
      if (s[exporters].length > 1000 || !ids.length || ids.some(id => !component.test(id)) || !ids.some(id => id !== exporterId)) errors[exporters] = 'List every current exporter ID, comma-separated, including the vendor destination.';
    }
  }
  return errors;
}
export function restoreOtel(value: unknown): OtelSettings {
  const defaults = defaultOtel();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid OTel settings.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== Object.keys(defaults).length) throw new Error('OTel settings schema does not match.');
  for (const [key, expected] of Object.entries(defaults)) {
    if (typeof record[key] !== typeof expected || (typeof record[key] === 'string' && record[key].length > 1000)) throw new Error('Invalid OTel setting value.');
  }
  if (!['replace', 'dual'].includes(String(record.mode)) || !['local', 'workload', 'system', 'user', 'principal'].includes(String(record.auth))) throw new Error('Invalid OTel option.');
  // Incomplete drafts are restorable; invalid populated fields are not.
  const result = { ...record } as unknown as OtelSettings;
  const draft = { ...result, queryUri: result.queryUri || 'https://example.kusto.fabric.microsoft.com' };
  for (const signal of signals) if (!draft[`${signal}Exporters`]) draft[`${signal}Exporters`] = 'otlp/current';
  if (Object.keys(validateOtel(draft)).length) throw new Error('Invalid OTel configuration fields.');
  return result;
}
export function generateOtel(s: OtelSettings): { yaml: string; environment: string; verification: string } {
  if (Object.keys(validateOtel(s)).length) throw new Error('Correct OTel configuration fields before generating suggestions.');
  const selected = signals.filter(signal => s[signal]);
  const q = (value: string) => JSON.stringify(value);
  const lines: string[] = [
    s.mode === 'dual'
      ? '# ADDITIVE FRAGMENT, NOT A COMPLETE COLLECTOR CONFIGURATION.'
      : '# NEW COLLECTOR BASELINE. Review before replacing any existing configuration.',
    '# Use a pinned otelcol-contrib distribution containing azuredataexplorer.',
    '# Credentials are environment references only; do not put secrets in this file.',
  ];
  if (s.mode === 'replace') lines.push(
    'receivers:', '  otlp:', '    protocols:',
    '      grpc:', '        endpoint: 127.0.0.1:4317',
    '      http:', '        endpoint: 127.0.0.1:4318',
    'processors:', '  memory_limiter:', '    check_interval: 1s',
    '    limit_mib: 192', '    spike_limit_mib: 48',
    '  batch:', '    timeout: 5s', '    send_batch_size: 1024', '    send_batch_max_size: 2048',
  );
  lines.push('exporters:', `  ${exporterId}:`,
    '    cluster_uri: ${env:KUSTO_CLUSTER_URI}', '    db_name: ${env:KUSTO_DATABASE}');
  if (s.auth === 'local' || s.auth === 'workload') lines.push('    use_azure_auth: true');
  if (s.auth === 'system') lines.push('    managed_identity_id: system');
  if (s.auth === 'user') lines.push('    managed_identity_id: ${env:AZURE_CLIENT_ID}');
  if (s.auth === 'principal') lines.push('    application_id: ${env:AZURE_CLIENT_ID}', '    tenant_id: ${env:AZURE_TENANT_ID}', '    application_key: ${env:AZURE_CLIENT_SECRET}');
  for (const signal of selected) lines.push(`    ${signal}_table_name: ${q(s[`${signal}Table`])}`);
  lines.push('    ingestion_type: managed', '    timeout: 30s',
    '    sending_queue:', '      enabled: true', '      num_consumers: 2', '      queue_size: 128',
    '    retry_on_failure:', '      enabled: true', '      initial_interval: 2s', '      max_interval: 15s', '      max_elapsed_time: 2m');
  if (s.mode === 'dual') lines.push(
    '# Merge this exporter into the existing exporters mapping.',
    '# In EACH named existing pipeline, update ONLY exporters to the list below.',
    '# Preserve its receivers, processors, extensions, other signals and settings.',
    '# All listed current exporters must already be defined. Do not replace service wholesale.',
  );
  lines.push('service:', '  pipelines:');
  for (const signal of selected) {
    lines.push(`    ${q(s.mode === 'dual' ? s[`${signal}Pipeline`] : signal)}:`);
    if (s.mode === 'replace') lines.push('      receivers: [otlp]', '      processors: [memory_limiter, batch]');
    lines.push(`      exporters: ${JSON.stringify(s.mode === 'dual' ? [...new Set([...exporterIds(s[`${signal}Exporters`]), exporterId])] : [exporterId])}`);
  }
  const env = [
    '# Non-secret values; supply these to the collector process, not the web app.',
    `KUSTO_CLUSTER_URI=${s.queryUri}`, `KUSTO_DATABASE=${s.database}`,
  ];
  if (s.auth === 'local') env.push('# Run az login on the collector host. A container does not inherit host login automatically.');
  if (s.auth === 'workload') env.push('# AKS workload identity must inject AZURE_CLIENT_ID, AZURE_TENANT_ID and AZURE_FEDERATED_TOKEN_FILE.');
  if (s.auth === 'user') env.push('AZURE_CLIENT_ID=<collector-managed-identity-client-id>');
  if (s.auth === 'principal') env.push('AZURE_CLIENT_ID=<service-principal-client-id>', 'AZURE_TENANT_ID=<tenant-id>', '# Inject AZURE_CLIENT_SECRET from a secret store. Never enter it in this planner.');
  if (s.mode === 'replace') env.push(
    '# Application SDK reference: local collector HTTP/protobuf, NOT the Fabric query URL.',
    'OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318', 'OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf',
    ...selected.map(signal => `OTEL_${signal.toUpperCase()}_EXPORTER=otlp`),
    '# Set service.name and review language-specific SDK log/metric/trace instrumentation.',
  );
  const verification = selected.map(signal => {
    const timestamp = signal === 'traces' ? 'StartTime' : 'Timestamp';
    return `// ${signal}: run in ${s.database}, compare the same pilot window and service in both destinations.\n${s[`${signal}Table`]}\n| where ${timestamp} > ago(15m)\n| summarize Records=count() by Service=tostring(ResourceAttributes["service.name"])`;
  }).join('\n\n');
  return { yaml: lines.join('\n') + '\n', environment: env.join('\n') + '\n', verification };
}
export interface DeploymentTargets {
  version: 1;
  discoveredAt: string;
  workspaceName: string;
  eventhouseName: string;
  queryUri: string;
  database: string;
  grafanaUrl: string;
  collectorName: string;
  collectorEndpoint: string;
}
export function parseTargets(value: unknown): DeploymentTargets {
  if (!value || typeof value !== 'object') throw new Error('Invalid deployment inventory.');
  const r = value as Record<string, unknown>;
  const keys = ['discoveredAt', 'workspaceName', 'eventhouseName', 'queryUri', 'database', 'grafanaUrl', 'collectorName', 'collectorEndpoint'] as const;
  if (r.version !== 1 || keys.some(key => typeof r[key] !== 'string')) throw new Error('Invalid deployment inventory.');
  const settings = { ...defaultOtel(), mode: 'replace' as const, ...Object.fromEntries(keys.filter(k => k !== 'discoveredAt').map(k => [k, r[k]])) };
  if (Object.keys(validateOtel(settings)).length || !Number.isFinite(Date.parse(String(r.discoveredAt)))) throw new Error('Invalid deployment resource details.');
  return { version: 1, ...Object.fromEntries(keys.map(k => [k, r[k]])) } as unknown as DeploymentTargets;
}
