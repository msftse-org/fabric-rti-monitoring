import type { Scenario } from './model.ts';

export type ImportVendor = 'Datadog' | 'Coralogix';
export type ImportResult = {
  vendor: ImportVendor;
  format: string;
  period: string;
  patch: Partial<Scenario>;
  breakdown: { label: string; value: string }[];
  notes: string[];
};

const MAX_BYTES = 20e6;
const num = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value.replace(/[,\s$]/g, '')) : Number(value);
  return Number.isFinite(n) ? n : null;
};
const fixed = (n: number, digits = 3) => String(Number(n.toFixed(digits)));
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

type Pillar = 'logs' | 'traces' | 'metrics' | 'other';
type Tier = 'High' | 'Medium' | 'Low' | 'Blocked';
type UsageRow = { date: string; gb: number; units: number | null; pillar: Pillar; tier: Tier };

function pillarOf(value: string): Pillar {
  const v = value.toLowerCase();
  if (v.includes('log')) return 'logs';
  if (v.includes('span') || v.includes('trace')) return 'traces';
  if (v.includes('metric')) return 'metrics';
  return 'other';
}
function tierOf(value: string): Tier {
  const v = value.toLowerCase();
  if (v.includes('block')) return 'Blocked';
  if (v.includes('medium')) return 'Medium';
  if (v.includes('low')) return 'Low';
  return 'High';
}

function split(rows: UsageRow[], pillar: Pillar) {
  const kept = rows.filter(r => r.pillar === pillar && r.tier !== 'Blocked');
  const total = kept.reduce((s, r) => s + r.gb, 0);
  if (total <= 0) return null;
  const share = (tier: Tier) => Number((kept.filter(r => r.tier === tier).reduce((s, r) => s + r.gb, 0) / total * 100).toFixed(2));
  const high = share('High');
  const medium = share('Medium');
  return { High: String(high), Medium: String(medium), Low: String(Number((100 - high - medium).toFixed(2))) };
}

function summarizeCoralogix(rows: UsageRow[], format: string): ImportResult {
  const dates = [...new Set(rows.map(r => r.date).filter(Boolean))].sort();
  if (dates.length === 0) throw new Error('The Coralogix export has no dated rows. Choose the Detailed report so usage is broken down per day.');
  const days = dates.length;
  const gb = (pillar: Pillar, blocked = false) => rows.filter(r => r.pillar === pillar && (blocked ? r.tier === 'Blocked' : r.tier !== 'Blocked')).reduce((s, r) => s + r.gb, 0);
  const logs = gb('logs'), traces = gb('traces'), metrics = gb('metrics'), other = gb('other') + gb('other', true);
  if (logs + traces + metrics <= 0) throw new Error('No log, span or metric volume was found. Export the CX units tab with entity type or pillar included.');
  const patch: Partial<Scenario> = { logsGB: fixed(logs / days), traceGB: fixed(traces / days), metricGB: fixed(metrics / days) };
  const logSplit = split(rows, 'logs');
  const traceSplit = split(rows, 'traces');
  if (logSplit) Object.assign(patch, { logHigh: logSplit.High, logMedium: logSplit.Medium, logLow: logSplit.Low });
  if (traceSplit) Object.assign(patch, { traceHigh: traceSplit.High, traceMedium: traceSplit.Medium, traceLow: traceSplit.Low });
  const units = rows.some(r => r.units !== null) ? rows.reduce((s, r) => s + (r.units ?? 0), 0) : null;
  const breakdown = [
    { label: 'Logs', value: `${fixed(logs / days)} GB/day` },
    { label: 'Spans / traces', value: `${fixed(traces / days)} GB/day` },
    { label: 'Metrics', value: `${fixed(metrics / days)} GB/day` },
    ...(units !== null ? [{ label: 'CX units consumed', value: `${fixed(units / days, 2)} units/day` }] : []),
  ];
  const notes = [`Daily averages over ${days} day${days === 1 ? '' : 's'} with data.`];
  const blocked = gb('logs', true) + gb('traces', true);
  if (blocked > 0) notes.push(`${fixed(blocked / days)} GB/day of blocked data is excluded, matching the equivalent-workload model.`);
  if (other > 0) notes.push(`${fixed(other / days)} GB/day of other entity types (for example AI or system data) is not mapped.`);
  if (units !== null) notes.push('Coralogix bills in units. Enter your contract rates or all-in monthly contract; unit prices are not inferred.');
  return { vendor: 'Coralogix', format, period: `${dates[0]} to ${dates[dates.length - 1]}`, patch, breakdown, notes };
}

function coralogixTable(records: Record<string, string>[], format: string): ImportResult {
  const keys = Object.keys(records[0] ?? {});
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');
  const find = (...tests: ((k: string) => boolean)[]) => tests.map(t => keys.find(k => t(norm(k)))).find(Boolean);
  const date = find(k => k === 'date', k => k.includes('date') || k.includes('timestamp'));
  const gb = find(k => k.includes('gbsent'), k => k.includes('ingested') && k.includes('gb'), k => k.includes('sizegb'), k => k.endsWith('gb'));
  const units = find(k => k.includes('unit'));
  const tier = find(k => k.includes('priority'), k => k.includes('tier'));
  const entity = find(k => k.includes('entitytype'), k => k.includes('pillar'), k => k.includes('entity'));
  if (!gb) throw new Error('Could not find an "Ingested data (GB sent)" column. Export the Coralogix Data Usage Report with headers.');
  if (!entity) throw new Error('Could not find an Entity type or pillar column. Choose the Detailed report for the CX units tab.');
  const rows = records.map(r => ({
    date: date ? String(r[date] ?? '').slice(0, 10) : '',
    gb: num(r[gb]) ?? 0,
    units: units ? num(r[units]) : null,
    pillar: pillarOf(String(r[entity] ?? '')),
    tier: tierOf(tier ? String(r[tier] ?? '') : ''),
  }));
  return summarizeCoralogix(rows, format);
}

function coralogixApi(items: Record<string, unknown>[]): ImportResult {
  const rows = items.map(item => {
    const dims = Array.isArray(item.dimensions) ? item.dimensions.filter(isObject) : [];
    const pillar = dims.find(d => typeof d.pillar === 'string')?.pillar as string | undefined;
    const tier = dims.find(d => typeof d.tier === 'string')?.tier as string | undefined;
    return { date: String(item.timestamp ?? '').slice(0, 10), gb: num(item.sizeGb) ?? 0, units: num(item.units), pillar: pillarOf(pillar ?? ''), tier: tierOf(tier ?? '') };
  });
  return summarizeCoralogix(rows, 'Coralogix Data Usage API (JSON)');
}

function daysInMonth(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 30 : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

function datadogUsage(doc: Record<string, unknown>, current: Scenario): ImportResult {
  const months = (Array.isArray(doc.usage) ? doc.usage.filter(isObject) : []).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const month = months[months.length - 1];
  const pick = (monthly: string, total: string) => month ? num(month[monthly]) : num(doc[total]);
  const start = String(month?.date ?? doc.start_date ?? '');
  let days = daysInMonth(start);
  const end = typeof doc.end_date === 'string' ? new Date(doc.end_date) : null;
  if (end && start && months.length <= 1 && end.getUTCMonth() === new Date(start).getUTCMonth()) days = Math.min(days, Math.max(1, end.getUTCDate()));
  const hosts = pick('infra_host_top99p', 'infra_host_top99p_sum');
  const apmHosts = pick('apm_host_top99p', 'apm_host_top99p_sum');
  const logBytes = pick('ingested_events_bytes_sum', 'ingested_events_bytes_agg_sum');
  const spanBytes = pick('twol_ingested_events_bytes_sum', 'twol_ingested_events_bytes_agg_sum');
  const indexedLogs = pick('indexed_events_count_sum', 'indexed_events_count_agg_sum');
  const indexedSpans = pick('trace_search_indexed_events_count_sum', 'trace_search_indexed_events_count_agg_sum');
  const customMetrics = pick('custom_ts_avg', 'custom_ts_sum');
  const apiRuns = pick('synthetics_check_calls_count_sum', 'synthetics_check_calls_count_agg_sum');
  const browserRuns = pick('synthetics_browser_check_calls_count_sum', 'synthetics_browser_check_calls_count_agg_sum');
  const patch: Partial<Scenario> = { days: String(days) };
  const breakdown: ImportResult['breakdown'] = [];
  if (hosts !== null) { patch.hosts = String(Math.round(hosts)); breakdown.push({ label: 'Infrastructure hosts (p99)', value: patch.hosts }); }
  if (apmHosts !== null) { patch.apmHosts = String(Math.round(apmHosts)); breakdown.push({ label: 'APM hosts (p99)', value: patch.apmHosts }); }
  if (logBytes !== null) { patch.logsGB = fixed(logBytes / 1e9 / days); breakdown.push({ label: 'Ingested logs', value: `${patch.logsGB} GB/day` }); }
  if (spanBytes !== null) { patch.traceGB = fixed(spanBytes / 1e9 / days); breakdown.push({ label: 'Ingested spans', value: `${patch.traceGB} GB/day` }); }
  if (indexedLogs !== null && logBytes) {
    patch.indexPercent = fixed(Math.min(100, indexedLogs * Number(current.eventBytes || 1000) / logBytes * 100), 2);
    breakdown.push({ label: 'Indexed log events', value: `${fixed(indexedLogs / 1e6, 2)}M (≈${patch.indexPercent}% at ${current.eventBytes || 1000} bytes/event)` });
  }
  if (indexedSpans !== null) { patch.spanMillion = fixed(indexedSpans / 1e6, 3); breakdown.push({ label: 'Indexed spans', value: `${patch.spanMillion}M / month` }); }
  if (customMetrics !== null) { patch.indexedMetrics = String(Math.round(customMetrics)); breakdown.push({ label: 'Custom metrics (avg series)', value: patch.indexedMetrics }); }
  if ((apiRuns ?? 0) + (browserRuns ?? 0) > 0) {
    Object.assign(patch, { synthetic: true, apiRuns: String(Math.round(apiRuns ?? 0)), browserRuns: String(Math.round(browserRuns ?? 0)) });
    breakdown.push({ label: 'Synthetic API / browser runs', value: `${patch.apiRuns} / ${patch.browserRuns}` });
  }
  if (breakdown.length === 0) throw new Error('The Datadog usage summary has no recognizable usage fields.');
  return {
    vendor: 'Datadog', format: 'Datadog usage summary (JSON)', period: `${start.slice(0, 7) || 'Unknown month'} · ${days} days`, patch, breakdown,
    notes: [
      'Datadog does not report metric volume in GB. Metrics GB/day keeps its current value; adjust it if you know it.',
      ...(months.length > 1 ? [`${months.length} months found; the latest month is used.`] : []),
    ],
  };
}

function datadogCost(entries: Record<string, unknown>[]): ImportResult {
  const rows = entries.map(e => (isObject(e.attributes) ? e.attributes : {}));
  const latest = rows.map(r => String(r.date ?? '').slice(0, 7)).sort().pop() ?? '';
  const month = rows.filter(r => String(r.date ?? '').slice(0, 7) === latest);
  const products = new Map<string, number>();
  let total = 0;
  for (const r of month) {
    const charges = Array.isArray(r.charges) ? r.charges.filter(isObject) : [];
    const byProduct = new Map<string, { total: number | null; parts: number }>();
    for (const c of charges) {
      const name = String(c.product_name ?? 'other');
      const cost = num(c.cost) ?? 0;
      const entry = byProduct.get(name) ?? { total: null, parts: 0 };
      if (c.charge_type === 'total') entry.total = cost; else entry.parts += cost;
      byProduct.set(name, entry);
    }
    let orgSum = 0;
    for (const [name, entry] of byProduct) {
      const cost = entry.total ?? entry.parts;
      orgSum += cost;
      products.set(name, (products.get(name) ?? 0) + cost);
    }
    total += num(r.total_cost) ?? orgSum;
  }
  if (!latest || total <= 0) throw new Error('The Datadog cost export has no billed amount for its latest month.');
  const sorted = [...products.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const label = (name: string) => name.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const now = new Date();
  const partial = latest === `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    vendor: 'Datadog', format: 'Datadog cost export (JSON)', period: latest,
    patch: { ddContract: fixed(total, 2), discount: '0' },
    breakdown: [...sorted.map(([n, v]) => ({ label: label(n), value: usd(v) })), { label: 'Total billed', value: usd(total) }],
    notes: [
      'The billed total replaces estimated Datadog meters. Discount is reset to 0% because the bill already reflects it.',
      ...(month.length > 1 ? [`Summed across ${month.length} organizations.`] : []),
      ...(partial ? ['This month is still in progress, so the amount is month-to-date and likely understates the full bill.'] : []),
    ],
  };
}

function findArray(value: unknown, test: (item: Record<string, unknown>) => boolean, depth = 0): Record<string, unknown>[] | null {
  if (depth > 5) return null;
  if (Array.isArray(value)) {
    const items = value.filter(isObject);
    if (items.length && items.some(test)) return items;
    for (const v of value) { const found = findArray(v, test, depth + 1); if (found) return found; }
    return null;
  }
  if (isObject(value)) for (const v of Object.values(value)) { const found = findArray(v, test, depth + 1); if (found) return found; }
  return null;
}

export function parseVendorExport(text: string, fileName: string, current: Scenario): ImportResult {
  if (text.length > MAX_BYTES) throw new Error('File is too large; export a shorter date range (under 20 MB).');
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new Error('The file is empty.');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let doc: unknown;
    try { doc = JSON.parse(trimmed); } catch { throw new Error('The JSON file could not be read.'); }
    if (isObject(doc) && (Array.isArray(doc.usage) || 'infra_host_top99p_sum' in doc || 'ingested_events_bytes_agg_sum' in doc)) return datadogUsage(doc, current);
    const cost = findArray(doc, item => isObject(item.attributes) && Array.isArray(item.attributes.charges));
    if (cost) return datadogCost(cost);
    const api = findArray(doc, item => 'sizeGb' in item && 'dimensions' in item);
    if (api) return coralogixApi(api);
    const table = findArray(doc, item => Object.keys(item).some(k => /gb/i.test(k)) && Object.keys(item).some(k => /entity|pillar/i.test(k)));
    if (table) return coralogixTable(table.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))), 'Coralogix Data Usage Report (JSON)');
    throw new Error('Unrecognized JSON. Supported: Datadog usage summary, Datadog historical/estimated cost, Coralogix data usage report or API output.');
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  const delimiter = fileName.toLowerCase().endsWith('.tsv') || firstLine.includes('\t') ? '\t' : ',';
  const [header, ...body] = parseDelimited(trimmed, delimiter);
  if (!header || body.length === 0) throw new Error('The CSV has no data rows. Enable "Include headers" when exporting.');
  const records = body.map(cells => Object.fromEntries(header.map((h, i) => [h.trim(), cells[i] ?? ''])));
  return coralogixTable(records, `Coralogix Data Usage Report (${delimiter === '\t' ? 'TSV' : 'CSV'})`);
}

export function mergeImports(results: ImportResult[]): { vendor: ImportVendor; patch: Partial<Scenario> } {
  const vendors = new Set(results.map(r => r.vendor));
  if (vendors.size !== 1) throw new Error('Import files from one vendor at a time.');
  return { vendor: results[0].vendor, patch: Object.assign({}, ...results.map(r => r.patch)) };
}
