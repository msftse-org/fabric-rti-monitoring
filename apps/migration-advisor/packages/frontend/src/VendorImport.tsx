import { useId, useRef, useState } from 'react';
import { Check, Copy, FileUp, X } from 'lucide-react';
import type { Vendor } from './catalog';
import type { Scenario } from './model';
import { mergeImports, parseVendorExport } from './vendorExport';
import type { ImportResult } from './vendorExport';

type Parsed = { name: string; result?: ImportResult; error?: string };

function previousMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function datadogCommands() {
  const month = previousMonth();
  const head = '-H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY"';
  return [
    ['Usage summary (volumes and hosts)', `curl -sG "https://api.\${DD_SITE:-datadoghq.com}/api/v1/usage/summary" \\\n  --data-urlencode "start_month=${month}" --data-urlencode "end_month=${month}" \\\n  ${head} -o datadog-usage.json`],
    ['Billed cost (invoice amounts)', `curl -sG "https://api.\${DD_SITE:-datadoghq.com}/api/v2/usage/historical_cost" \\\n  --data-urlencode "start_month=${month}" --data-urlencode "end_month=${month}" \\\n  ${head} -o datadog-cost.json`],
  ] as const;
}

function CopyCommand({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  }
  return <div className="import-command">
    <div className="import-command-head"><span>{label}</span><button type="button" className="copy-button" onClick={copy}>{copied ? <Check size={14}/> : <Copy size={14}/>}{copied ? 'Copied' : 'Copy'}</button></div>
    <pre><code>{command}</code></pre>
  </div>;
}

function Preview({ item }: { item: Parsed }) {
  if (item.error) return <li className="import-file import-file-error"><strong>{item.name}</strong><p role="alert">{item.error}</p></li>;
  const r = item.result!;
  return <li className="import-file">
    <div className="import-file-head"><strong>{r.format}</strong><span>{r.period}</span></div>
    <small className="import-file-name">{item.name}</small>
    <dl className="import-values">{r.breakdown.map(b => <div key={b.label}><dt>{b.label}</dt><dd>{b.value}</dd></div>)}</dl>
    {r.notes.length > 0 && <ul className="import-notes">{r.notes.map(n => <li key={n}>{n}</li>)}</ul>}
  </li>;
}

export function VendorImport({ vendor, scenario, onApply }: { vendor: Vendor; scenario: Scenario; onApply: (vendor: Vendor, patch: Partial<Scenario>, summary: string) => void }) {
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();

  async function read(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const texts = await Promise.allSettled(Array.from(files).slice(0, 5).map(file => file.text()));
    setParsed(Array.from(files).slice(0, 5).map((file, i): Parsed => {
      const text = texts[i];
      if (text.status === 'rejected') return { name: file.name, error: 'The file could not be read.' };
      try { return { name: file.name, result: parseVendorExport(text.value, file.name, scenario) }; }
      catch (e) { return { name: file.name, error: (e as Error).message }; }
    }));
    if (input.current) input.current.value = '';
  }

  const good = parsed.flatMap(p => p.result ? [p.result] : []);
  function apply() {
    try {
      const merged = mergeImports(good);
      onApply(merged.vendor, merged.patch, `${good.length} export${good.length === 1 ? '' : 's'} applied to ${merged.vendor} inputs. Files stayed in this browser.`);
      setParsed([]);
    } catch (e) { setError((e as Error).message); }
  }

  return <section className="vendor-import" aria-labelledby={headingId}>
    <div className="vendor-import-bar">
      <span className="vendor-import-icon" aria-hidden="true"><FileUp size={18}/></span>
      <div className="vendor-import-copy">
        <h3 id={headingId}>Start from a usage or billing export</h3>
        <p>Fill these inputs from a {vendor} file. Read locally; nothing is uploaded.</p>
      </div>
      <label className="button-like">
        <input ref={input} className="sr-only" type="file" multiple accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json"
          onChange={e => { void read(e.currentTarget.files); }}/>
        Choose files
      </label>
    </div>
    <details className="import-howto">
      <summary>How to export from {vendor}</summary>
      {vendor === 'Coralogix' ? <ol>
        <li>In Coralogix, open <strong>Settings → Usage &amp; Quota</strong>.</li>
        <li>Open <strong>More actions → Generate report</strong>, choose <strong>Data Usage Report</strong> and the <strong>Detailed</strong> type.</li>
        <li>Pick the last 30 days (up to 90), format <strong>CSV, TSV or JSON</strong>, and keep headers on. Import the CX units tab or the JSON file.</li>
        <li>The Data Usage API JSON (<code>/dataplans/data-usage/v2</code>) also works.</li>
      </ol> : <>
        <p>Run these on your machine with your own keys in environment variables. The planner never asks for keys. Billed cost needs an admin key on the parent organization.</p>
        {datadogCommands().map(([label, command]) => <CopyCommand key={label} label={label} command={command}/>)}
        <p className="hint">Importing <code>estimated_cost</code> output also works; it is month-to-date.</p>
      </>}
    </details>
    {parsed.length > 0 && <div className="import-preview" aria-live="polite">
      <ul className="import-files">{parsed.map(p => <Preview key={p.name} item={p}/>)}</ul>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="import-actions">
        <button type="button" className="primary-button" disabled={!good.length} onClick={apply}><Check size={16}/>Apply to inputs</button>
        <button type="button" onClick={() => { setParsed([]); setError(''); }}><X size={16}/>Discard</button>
      </div>
    </div>}
  </section>;
}
