import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeImports, parseVendorExport } from '../src/vendorExport.ts';
import { calculate, defaultScenario } from '../src/model.ts';
import { exportDocument, restoreDocument } from '../src/persistence.ts';
import { initialPlan } from '../src/catalog.ts';
import { defaultOtel } from '../src/otel.ts';
import { defaultComparison } from '../src/comparison.ts';

const scenario = defaultScenario();

test('Coralogix detailed CSV is read by header name, excludes blocked data and averages per day', () => {
  const csv = [
    'Date,Application,Subsystem,Env,Env_type,Service_name,TCO priority,Entity type,Dataset,Dataspace,Ingested data (GB sent),Unit consumption',
    '2026-10-01,"shop, prod",api,prod,k8s,api,High,Logs,logs,default,6,4.5',
    '2026-10-01,shop,api,prod,k8s,api,Low,Logs,logs,default,2,0.24',
    '2026-10-01,shop,api,prod,k8s,api,Blocked,Logs,logs,default,10,0.8',
    '2026-10-01,shop,api,prod,k8s,api,Medium,Spans,spans,default,1,0.25',
    '2026-10-02,shop,api,prod,k8s,api,Medium,Logs,logs,default,4,1.28',
    '2026-10-02,shop,api,prod,k8s,api,High,Metrics,metrics,default,3,0.1',
  ].join('\r\n');
  const r = parseVendorExport(csv, 'usage.csv', scenario);
  assert.equal(r.vendor, 'Coralogix');
  assert.equal(r.period, '2026-10-01 to 2026-10-02');
  assert.equal(r.patch.logsGB, '6');
  assert.equal(r.patch.traceGB, '0.5');
  assert.equal(r.patch.metricGB, '1.5');
  assert.deepEqual([r.patch.logHigh, r.patch.logMedium, r.patch.logLow], ['50', '33.33', '16.67']);
  assert.deepEqual([r.patch.traceHigh, r.patch.traceMedium, r.patch.traceLow], ['0', '100', '0']);
  assert.ok(r.notes.some(n => n.includes('blocked')));
});

test('Coralogix TSV and data usage API JSON are recognized', () => {
  const tsv = 'Date\tTCO priority\tEntity type\tIngested data (GB sent)\n2026-10-01\tHigh\tLogs\t5\n';
  assert.equal(parseVendorExport(tsv, 'u.tsv', scenario).patch.logsGB, '5');
  const api = { entries: [
    { timestamp: '2026-10-01T00:00:00Z', sizeGb: 8, units: 6, dimensions: [{ tier: 'TCO_TIER_HIGH' }, { pillar: 'PILLAR_LOGS' }] },
    { timestamp: '2026-10-01T00:00:00Z', sizeGb: 2, units: 0.5, dimensions: [{ tier: 'TCO_TIER_MEDIUM' }, { pillar: 'PILLAR_SPANS' }] },
  ] };
  const r = parseVendorExport(JSON.stringify(api), 'api.json', scenario);
  assert.equal(r.format, 'Coralogix Data Usage API (JSON)');
  assert.equal(r.patch.logsGB, '8');
  assert.equal(r.patch.traceMedium, '100');
});

test('Datadog usage summary maps the latest month to hosts, volumes, indexing and synthetics', () => {
  const doc = { start_date: '2026-09-01T00:00:00Z', end_date: '2026-10-31T23:00:00Z', usage: [
    { date: '2026-09-01T00:00:00Z', infra_host_top99p: 1, ingested_events_bytes_sum: 1 },
    { date: '2026-10-01T00:00:00Z', infra_host_top99p: 42, apm_host_top99p: 12, ingested_events_bytes_sum: 310e9, twol_ingested_events_bytes_sum: 62e9,
      indexed_events_count_sum: 62e6, trace_search_indexed_events_count_sum: 3.5e6, custom_ts_avg: 2400.4, synthetics_check_calls_count_sum: 50000, synthetics_browser_check_calls_count_sum: 0 },
  ] };
  const r = parseVendorExport(JSON.stringify(doc), 'usage.json', scenario);
  assert.equal(r.vendor, 'Datadog');
  assert.deepEqual(
    [r.patch.days, r.patch.hosts, r.patch.apmHosts, r.patch.logsGB, r.patch.traceGB, r.patch.indexPercent, r.patch.spanMillion, r.patch.indexedMetrics, r.patch.synthetic, r.patch.apiRuns],
    ['31', '42', '12', '10', '2', '20', '3.5', '2400', true, '50000']);
  assert.equal(r.patch.metricGB, undefined);
});

test('Datadog cost export de-duplicates total charges, sums organizations and becomes the all-in bill', () => {
  const doc = { data: [
    { type: 'cost_by_org', attributes: { org_name: 'parent', date: '2026-10-01T00:00:00Z', total_cost: 1500, charges: [
      { product_name: 'logs', charge_type: 'committed', cost: 600 }, { product_name: 'logs', charge_type: 'on_demand', cost: 400 }, { product_name: 'logs', charge_type: 'total', cost: 1000 },
      { product_name: 'infra_host', charge_type: 'committed', cost: 500 } ] } },
    { type: 'cost_by_org', attributes: { org_name: 'child', date: '2026-10-01T00:00:00Z', charges: [{ product_name: 'apm_host', charge_type: 'on_demand', cost: 250 }] } },
    { type: 'cost_by_org', attributes: { org_name: 'parent', date: '2026-09-01T00:00:00Z', total_cost: 9999, charges: [] } },
  ] };
  const r = parseVendorExport(JSON.stringify(doc), 'cost.json', scenario);
  assert.equal(r.period, '2026-10');
  assert.equal(r.patch.ddContract, '1750');
  assert.equal(r.breakdown.find(b => b.label === 'Logs')?.value, '$1,000.00');
  const cost = calculate({ ...scenario, ...r.patch }, 'Datadog').datadog;
  assert.deepEqual(cost.lines.map(l => l.id), ['dd-contract']);
  assert.equal(cost.total, 1750);
});

test('unrecognized or incomplete exports fail with guidance, and mixed vendors are rejected', () => {
  assert.throws(() => parseVendorExport('{"foo":1}', 'x.json', scenario), /Unrecognized JSON/);
  assert.throws(() => parseVendorExport('Date,Ingested data (GB sent)\n2026-10-01,4\n', 'x.csv', scenario), /Entity type/);
  assert.throws(() => parseVendorExport('', 'x.csv', scenario), /empty/);
  const cx = parseVendorExport('Date,Entity type,Ingested data (GB sent)\n2026-10-01,Logs,1\n', 'a.csv', scenario);
  const dd = parseVendorExport('{"usage":[{"date":"2026-10-01","infra_host_top99p":3}]}', 'b.json', scenario);
  assert.throws(() => mergeImports([cx, dd]), /one vendor/);
});

test('plan files saved before the Datadog bill override still restore', () => {
  const doc = exportDocument('Datadog', initialPlan(), defaultScenario(), defaultOtel(), defaultComparison());
  delete doc.scenario.ddContract;
  assert.equal(restoreDocument(JSON.stringify(doc)).scenario.ddContract, '');
});
