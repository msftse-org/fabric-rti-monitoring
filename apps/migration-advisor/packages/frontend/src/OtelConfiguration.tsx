import { generateOtel, signals, validateOtel } from './otel';
import type { OtelSettings } from './otel';
export { OtelConfiguration } from './OtelFlow';

export function OtelPrintReport({ settings }: { settings: OtelSettings | null }) {
  const generated = settings && Object.keys(validateOtel(settings)).length === 0 ? generateOtel(settings) : null;
  if (!settings || !generated) return <><h2>OTel configuration</h2><p>No submitted valid configuration. Review inputs and generate a configuration first.</p></>;
  return <>
    <h2>OTel configuration suggestions</h2>
    <p>{settings.mode === 'dual' ? 'Add Fabric; keep existing exporters. Additive fragment, not a complete file.' : 'New local OTLP Collector baseline.'} Authentication: {settings.auth}. Signals: {signals.filter(signal => settings[signal]).join(', ')}. Local planning only; nothing applied.</p>
    <p>Fabric workspace: {settings.workspaceName || 'Not specified'} · Database: {settings.database} · Query URI: {settings.queryUri}</p>
    {([['yaml', 'Collector YAML'], ['environment', 'Environment references'], ['verification', 'KQL verification']] as const).map(([key, label]) => <section key={key}><h3>{label}</h3><pre><code>{generated[key]}</code></pre></section>)}
    <p>Merge only the exporter mapping and named pipeline exporter lists; preserve original settings for rollback. Pin the exporter and review schemas, identity, permissions and capacity. Credentials are environment references only. Synthetic-only sample ingress is not for customer data. Fan-out is not atomic or exactly-once; redact before branching and monitor queues/retries.</p>
  </>;
}
