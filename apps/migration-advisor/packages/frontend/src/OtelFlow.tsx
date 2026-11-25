import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ArrowRight, Copy, Download } from 'lucide-react';
import { exporterIds, generateOtel, signals, validateOtel } from './otel';
import type { OtelSettings } from './otel';
import type { Vendor } from './catalog';
import { focusInvalid } from './flow';
import { createTargetInventory } from './targetInventory';

const targetFields = ['workspaceName', 'eventhouseName', 'queryUri', 'database', 'grafanaUrl', 'collectorName', 'collectorEndpoint'] as const;
const targetLabels = ['Fabric workspace name', 'Eventhouse name', 'KQL database query URI', 'KQL database name', 'Grafana URL', 'Collector name', 'Collector ingress URL'];
const artifacts = [
  ['yaml', 'Collector YAML', 'collector-suggestion.yaml', 'text/yaml'],
  ['environment', 'Environment references', 'collector-environment.txt', 'text/plain'],
  ['verification', 'KQL verification', 'collector-verification.kql', 'text/plain'],
] as const;
type Props = {
  settings: OtelSettings; onChange: (settings: OtelSettings) => void; vendor: Vendor;
  results: boolean; snapshot: OtelSettings | null; onGenerate: () => void; onEdit: () => void;
  inventoryAllowed: RefObject<boolean>;
};

function useTargetInventory({ settings, onChange, inventoryAllowed }: Props) {
  const latest = useRef({ settings, onChange });
  const [destinationRevision, setDestinationRevision] = useState(0);
  useLayoutEffect(() => { latest.current = { settings, onChange }; });
  const [inventory] = useState(() => createTargetInventory(() => ({
    ...latest.current, autoAllowed: inventoryAllowed.current,
    onChange: next => {
      latest.current.onChange(next);
      setDestinationRevision(revision => revision + 1);
    },
    onAutoComplete: () => { inventoryAllowed.current = false; },
  })));
  const state = useSyncExternalStore(inventory.subscribe, inventory.getSnapshot);
  return { ...state, load: inventory.load, destinationRevision };
}

export function OtelConfiguration(props: Props) {
  const { settings, onChange, vendor, results, snapshot, onGenerate, onEdit } = props;
  const { status, loading, load, destinationRevision } = useTargetInventory(props);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof OtelSettings, boolean>>>({});
  const errors = validateOtel(settings);
  const selected = signals.filter(signal => settings[signal]);
  const exporterLists = selected.map(signal => exporterIds(settings[`${signal}Exporters`]).sort().join(','));
  const mixed = new Set(exporterLists).size > 1;
  function update<K extends keyof OtelSettings>(key: K, value: OtelSettings[K]) {
    onChange({ ...settings, [key]: value });
    setTouched(current => ({ ...current, [key]: true }));
  }
  function field(key: keyof OtelSettings, label: string, hint?: string) {
    const error = (attempted || touched[key]) ? errors[key] : undefined;
    return <label className="field" key={key} htmlFor={`otel-${key}`}>
      <span>{label}</span><input id={`otel-${key}`} value={String(settings[key])} spellCheck={false}
        aria-invalid={!!error} aria-describedby={[hint && `otel-${key}-hint`, error && `otel-${key}-error`].filter(Boolean).join(' ') || undefined}
        onChange={event => update(key, event.target.value as never)} />
      {hint && <small id={`otel-${key}-hint`}>{hint}</small>}
      {error && <small className="field-error" id={`otel-${key}-error`}>{error}</small>}
    </label>;
  }
  function submit() {
    setAttempted(true);
    const invalid = Object.keys(errors)[0] as keyof OtelSettings | undefined;
    if (invalid) {
      const isExporter = invalid.endsWith('Exporters');
      focusInvalid(isExporter && !mixed ? 'otel-shared-exporters' : `otel-${invalid}`);
      return;
    }
    onGenerate();
  }
  if (results && snapshot) return <OtelResults settings={snapshot} vendor={vendor} onEdit={onEdit}/>;
  return <section className="flow-page" aria-label="OTel configuration planner">
    <form className="inputs flow-inputs otel-inputs" onSubmit={event => { event.preventDefault(); submit(); }}>
      <h2 data-flow-heading tabIndex={-1}>Configure your Collector plan</h2>
      <fieldset className="otel-mode"><legend>Collector plan</legend>
        <label><input id="otel-mode-dual" type="radio" name="otel-mode" checked={settings.mode === 'dual'} onChange={() => update('mode', 'dual')}/>
          <span><strong>Add Fabric; keep {vendor}</strong><small>Merge into your existing OTel Collector configuration.</small></span></label>
        <label><input id="otel-mode-replace" type="radio" name="otel-mode" checked={settings.mode === 'replace'} onChange={() => update('mode', 'replace')}/>
          <span><strong>Replace with a new baseline</strong><small>Prepare a new local OTLP Collector configuration.</small></span></label>
      </fieldset>
      <DestinationInputs key={destinationRevision} settings={settings} field={field} status={status} loading={loading} load={load}/>
      <h3>Signals</h3>
      <fieldset className="otel-signals"><legend>Select signals to export</legend>
        {signals.map(signal => <label className="check" key={signal}><input id={`otel-${signal}`} type="checkbox" checked={settings[signal]} onChange={event => update(signal, event.target.checked)}/>{signal[0].toUpperCase() + signal.slice(1)}</label>)}
      </fieldset>
      {(attempted || touched.logs || touched.metrics || touched.traces) && !selected.length && <p className="field-error" role="alert">Select at least one signal.</p>}
      <SharedExporters settings={settings} onChange={next=>{onChange(next);setTouched(current=>({...current,...Object.fromEntries(selected.map(signal=>[`${signal}Exporters`,true]))}));}} showErrors={attempted||selected.some(signal=>touched[`${signal}Exporters`])}/>
      <details className="advanced-assumptions" open={mixed || undefined}><summary>Have different pipelines/exporters? · Advanced settings</summary>
        <p className="otel-help">Default pipeline IDs match signal names. Tables use OTEL schemas; authentication defaults to local Azure CLI login. Saved overrides remain unchanged.</p>
        <label className="field" htmlFor="otel-auth"><span>Authentication on the Collector host</span>
          <select id="otel-auth" value={settings.auth} onChange={event => update('auth', event.target.value as OtelSettings['auth'])}>
            <option value="local">Local Azure CLI login</option><option value="workload">AKS workload identity</option>
            <option value="system">System-assigned managed identity</option><option value="user">User-assigned managed identity</option>
            <option value="principal">Service principal · environment references</option>
          </select><small>No credentials belong in this planner. Configure identity on the Collector host.</small></label>
        {selected.map(signal => <section className="otel-signal-fields" key={signal} aria-label={`${signal} advanced configuration`}>
          <h4>{signal[0].toUpperCase() + signal.slice(1)}</h4>
          {field(`${signal}Table`, 'Fabric table name')}
          {settings.mode === 'dual' && <>{field(`${signal}Pipeline`, 'Exact existing pipeline ID')}{field(`${signal}Exporters`, 'All existing exporter IDs · comma-separated')}</>}
        </section>)}
      </details>
      <p className="flow-help">Local planning only. Default: OTEL table schemas and local Azure CLI login on the Collector host. No connection or configuration changes.</p>
      {attempted && Object.keys(errors).length > 0 && <p className="field-error" role="alert">Check the highlighted inputs. Invalid advanced settings have been expanded.</p>}
      <div className="flow-next"><button className="primary-button" id="otel-next" type="submit">Generate configuration <ArrowRight size={16}/></button></div>
    </form>
  </section>;
}

type RenderField = (key: keyof OtelSettings, label: string, hint?: string) => ReactNode;
function DestinationInputs({ settings, field, status, loading, load }: {
  settings: OtelSettings; field: RenderField; status: string; loading: boolean; load: () => Promise<void>;
}) {
  // Keep fields in their entry location throughout typing, including clearing a
  // known URI in details. Only an applied inventory load resets this section.
  const [manual] = useState(() => !settings.queryUri);
  return <section className="destination-summary" aria-label="Fabric destination">
    <h3>Fabric destination</h3><p>{settings.workspaceName || 'Workspace not specified'} · {settings.database || 'Database not specified'}</p>
    {status && <p className="otel-help" role="status">{status}</p>}
    {manual && <>{field('queryUri', 'KQL database query URI', 'HTTPS query origin, not an OTLP endpoint.')}{field('database', 'KQL database name')}</>}
    <details><summary>Edit destination</summary>
      <button id="otel-load-targets" type="button" disabled={loading} aria-busy={loading} onClick={() => void load()}>{loading ? 'Loading destination…' : 'Refresh destination from RTI deployment'}</button>
      <p className="otel-help">Reads a non-secret deployment inventory. Refresh replaces destination fields only.</p>
      {targetFields.filter(key => !manual || (key !== 'queryUri' && key !== 'database')).map(key => field(key, targetLabels[targetFields.indexOf(key)]))}
    </details>
  </section>;
}
function SharedExporters({ settings, onChange, showErrors }: {
  settings: OtelSettings; onChange: (settings: OtelSettings) => void; showErrors: boolean;
}) {
  const selected = signals.filter(signal => settings[signal]);
  if (settings.mode !== 'dual' || !selected.length) return null;
  const mixed = new Set(selected.map(signal => exporterIds(settings[`${signal}Exporters`]).sort().join(','))).size > 1;
  const value = mixed ? '' : settings[`${selected[0]}Exporters`];
  const errors = validateOtel(settings);
  const error = showErrors && selected.some(signal => errors[`${signal}Exporters`]);
  return <label className="field" htmlFor="otel-shared-exporters">
    <span>All current exporter IDs · comma-separated</span>
    <input id="otel-shared-exporters" value={value} spellCheck={false} placeholder={mixed ? 'Different exporter lists — review advanced settings' : 'Enter your exact exporter IDs'}
      aria-invalid={!!error} aria-describedby={`otel-shared-help${error ? ' otel-shared-error' : ''}`}
      onChange={event => {
        const next = { ...settings };
        for (const signal of selected) next[`${signal}Exporters`] = event.target.value;
        onChange(next);
      }}/>
    <small id="otel-shared-help">{mixed ? 'Selected signals have different exporter lists. They are preserved below; typing here replaces the lists for all selected signals.' : 'Use every exact exporter ID from your current Collector. Applies to all selected signals; no vendor ID is assumed.'}</small>
    {error && <small id="otel-shared-error" className="field-error">Enter all current exporter IDs, including your existing destination.</small>}
  </label>;
}

function OtelResults({ settings, vendor, onEdit }: { settings: OtelSettings; vendor: Vendor; onEdit: () => void }) {
  const generated = generateOtel(settings);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  async function copy(text: string, label: string) {
    setError(''); setFeedback('');
    if (!window.isSecureContext || !navigator.clipboard?.writeText) {
      setError(`Clipboard unavailable. Select the ${label} code to copy manually, or use Download.`);
      return;
    }
    try { await navigator.clipboard.writeText(text); setFeedback(`${label} copied. Nothing was applied.`); }
    catch { setError(`Could not copy ${label}. Select the code to copy manually, or use Download.`); }
  }
  function download(text: string, filename: string, type: string) {
    setError(''); setFeedback('');
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const link = document.createElement('a');
      link.href = url; link.download = filename; link.click();
      setFeedback(`${filename} download requested. Nothing was applied.`);
    } catch { setError('Download could not start. Select the code to copy it manually.'); }
  }
  function artifact([key, label, filename, type]: typeof artifacts[number]) {
    return <section className="otel-artifact" aria-label={label}>
      <header><h3>{label}</h3><div>
        <button id={`otel-copy-${key}`} onClick={() => void copy(generated[key], label)}><Copy size={16}/>Copy<span className="sr-only"> {label}</span></button>
        <button id={`otel-download-${key}`} onClick={() => download(generated[key], filename, type)}><Download size={16}/>Download<span className="sr-only"> {label}</span></button>
      </div></header><pre tabIndex={0} aria-label={`${label}, read-only`}><code>{generated[key]}</code></pre>
    </section>;
  }
  return <section className="flow-page flow-results otel-outputs" aria-label="Generated Collector configuration">
    <button id="otel-edit" className="edit-inputs" onClick={onEdit}>Edit inputs</button>
    <h2 data-flow-heading tabIndex={-1}>Collector configuration</h2>
    <p className="flow-help">{settings.workspaceName || 'Fabric'} / {settings.database} · {settings.mode === 'dual' ? `Add Fabric; keep ${vendor}` : 'New local baseline'} · {signals.filter(signal => settings[signal]).join(', ')}</p>
    <p className="warning">{settings.mode === 'dual' ? <><strong>Merge, not standalone.</strong> Add the exporter mapping and change only the named pipeline exporter lists. Preserve receivers, processors, credentials, routing and sampling.</> : <><strong>Review before replacement.</strong> This baseline listens locally on ports 4317/4318. Preserve your original configuration for rollback.</>}</p>
    <p className="otel-help">Credentials are environment references only. The sample’s synthetic-only Collector is not a production endpoint for customer data.</p>
    <div className="otel-artifact-feedback"><p role="status">{feedback}</p>{error && <p className="warning" role="alert">{error}</p>}</div>
    {artifact(artifacts[0])}
    <details className="artifact-details"><summary>Environment references</summary>{artifact(artifacts[1])}</details>
    <details className="artifact-details"><summary>KQL verification</summary>{artifact(artifacts[2])}</details>
    <details className="artifact-details"><summary>Before any rollout · review checklist</summary>
      <ul className="otel-checks">
        <li>Pin an otelcol-contrib version containing the beta Azure Data Explorer exporter. Prepare OTEL table schemas, ingestion permissions and active capacity.</li>
        <li>Configure authentication on the Collector host; containers do not inherit your host’s Azure CLI login.</li>
        <li>Native Datadog Agent configuration cannot be patched here. Use a parallel OTel Collector / SDK gateway and reviewed cutover.</li>
        <li>Build a privacy-safe production Collector. Redact before fan-out; monitor queues, retries and duplicate delivery costs. Fan-out is not atomic or exactly-once.</li>
        <li>Compare both destinations and retain the original configuration for rollback.</li>
      </ul>
      <div className="otel-docs"><a href="https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/exporter/azuredataexplorerexporter/README.md" target="_blank" rel="noreferrer">Exporter documentation (new tab)</a><a href="https://opentelemetry.io/docs/collector/configuration/" target="_blank" rel="noreferrer">Collector configuration (new tab)</a></div>
    </details>
  </section>;
}
