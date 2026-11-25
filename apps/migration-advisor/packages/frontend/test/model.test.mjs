import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, defaultScenario, eventsMillion, parseNumber, ddRates, validateScenario, roundMoney, applyAzureExample } from '../src/model.ts';
import { features, initialPlan, filterFeatures, planCounts, validPlan, parseInventoryCount } from '../src/catalog.ts';
import { exportDocument, restoreDocument } from '../src/persistence.ts';
test('rates follow billing term and retention, not a single generic host price', () => {
  assert.equal(ddRates('annual', 'pro', 'standard', '15')[0],15);
  assert.equal(ddRates('monthly', 'enterprise', 'pro', '30')[2],3);
  assert.equal(ddRates('demand', 'pro', 'enterprise', '7')[2],1.91);
});
test('decimal uncompressed GB to million events uses average event bytes', () => {
  assert.equal(eventsMillion(10, 30, 1000, 50),150);
});
test('blank is unknown, explicit zero is valid, malformed numbers rejected', () => {
  assert.equal(parseNumber(''),null); assert.equal(parseNumber('0'),0);
  for (const n of ['-1','Infinity','NaN','1e999','abc','1000000000001']) assert.throws(() => parseNumber(n));
});
test('inventory parsing preserves blank as invalid rather than silently selecting zero', () => {
  assert.equal(parseInventoryCount(''),null);assert.equal(parseInventoryCount(' '),null);
  assert.equal(parseInventoryCount('0'),0);assert.equal(parseInventoryCount('42'),42);
  for(const value of ['Infinity','NaN','-1','1.5','1000001'])assert.equal(parseInventoryCount(value),null);
});
test('Datadog days scaling and stable unrounded summation', () => {
  const s=defaultScenario(); s.days='15'; s.hours='360'; s.grafanaHours='360'; s.logsGB='10'; s.indexPercent='0'; s.hosts='0'; s.apmHosts='0'; s.indexedMetrics='0'; s.traceGB='0'; s.spanMillion='0';
  const c=calculate(s); assert.equal(c.datadog.total,15);
  assert.equal(roundMoney(.105+.105),.21);
});
test('APM allowances can be disabled and zero rate does not become missing', () => {
  const s=defaultScenario(); s.apmHosts='1'; s.traceGB='5'; s.spanMillion='1'; s.hosts='0'; s.logsGB='0'; s.indexPercent='0'; s.indexedMetrics='0';
  let c=calculate(s); assert.equal(c.datadog.lines.find(l=>l.id==='trace-ingest').amount,0);
  s.apmAllowance=false; c=calculate(s); assert.equal(c.datadog.lines.find(l=>l.id==='trace-ingest').amount,15);
  s.traceRate=''; assert.equal(calculate(s).datadog.complete,false);
  s.traceRate='0'; assert.equal(calculate(s).datadog.complete,true);
});
test('custom metric per-100 rates are pro-rata, without invented block rounding', () => {
  const s=defaultScenario();s.hosts='10';s.indexedMetrics='1001';s.indexedMetricRate='5';s.ingestedMetrics='1';s.ingestedMetricRate='.10';
  const lines=calculate(s).datadog.lines;
  assert.equal(lines.find(l=>l.id==='metrics-index').amount,.05);
  assert.equal(lines.find(l=>l.id==='metrics-ingest').amount,.001);
  assert.match(lines.find(l=>l.id==='metrics-index').formula,/pro-rata estimate; confirm contract rounding/);
});
test('Coralogix quote omission, zero-volume skip and mutually exclusive contract override', () => {
  const s=defaultScenario(); assert.equal(calculate(s).coralogix.complete,false);
  s.cxContract='1234'; assert.equal(calculate(s).coralogix.total,1234);
  assert.equal(calculate(s).coralogix.lines.length,1);
  s.cxContract=''; s.logsGB='0'; s.traceGB='0'; s.metricGB='0'; assert.equal(calculate(s).coralogix.complete,true);
});
test('target capacity allocation and incremental capacity exclusive; unknown suppresses savings', () => {
  const s=defaultScenario(); s.fabricRate='2'; s.hours='100'; s.allocation='25';
  assert.equal(calculate(s).target.lines[0].amount,50);
  s.fabricMode='incremental'; assert.equal(calculate(s).target.lines[0].amount,200);
  assert.equal(calculate(s).savings,null);
  s.grafanaRate='0'; s.userRate='0'; s.collector='0'; assert.notEqual(calculate(s).savings,null);
});
test('Fabric pause does not reduce independently hosted Grafana hours', () => {
  const s=defaultScenario();s.hours='100';s.grafanaHours='720';s.fabricRate='2';s.grafanaRate='.05';
  const before=calculate(s).target;
  assert.equal(before.lines.find(l=>l.id==='fabric').amount,200);
  assert.equal(before.lines.find(l=>l.id==='grafana').amount,2*720*.05);
  s.hours='0';const after=calculate(s).target;
  assert.equal(after.lines.find(l=>l.id==='fabric').amount,0);
  assert.equal(after.lines.find(l=>l.id==='grafana').amount,before.lines.find(l=>l.id==='grafana').amount);
  s.grafanaHours='721';assert.ok(validateScenario(s).grafanaHours);
  s.grafanaHours='-1';assert.ok(validateScenario(s).grafanaHours);
});
test('storage optional and collector/AKS explicit allocation prevents accidental duplicate runtime', () => {
  const s=defaultScenario(); s.storageEnabled=false; s.storageGB='100'; s.storageRate='';
  assert.ok(!calculate(s).target.lines.some(l=>l.id==='storage'));
  s.runtime='aks'; s.collector='400'; s.aks='25'; s.aksShare='20';
  assert.equal(calculate(s).target.lines.find(l=>l.id==='runtime').amount,5);
  assert.ok(!calculate(s).target.lines.some(l=>l.id==='collector'));
});
test('invalid allocation, hours, proportions and discounts return errors, not NaN', () => {
  for (const [key,value] of [['discount','101'],['hours','745'],['days','0'],['eventBytes','0'],['logHigh','90']]) {
    const s=defaultScenario(); s[key]=value; assert.ok(Object.keys(validateScenario(s)).length); assert.throws(()=>calculate(s));
  }
});
test('optional meters toggle safely and discounts cannot create negative costs', () => {
  const s=defaultScenario(); s.oncall=true; s.rum=true; s.synthetic=true; s.discount='100';
  const c=calculate(s); assert.equal(c.datadog.total,0); assert.ok(c.target.lines.every(l=>l.amount===null || Number.isFinite(l.amount)));
});
test('Azure illustration prices F2 and Grafana but leaves collector runtime unknown', () => {
  const s=applyAzureExample(defaultScenario());const c=calculate(s);
  assert.equal(s.fabricRate,'.36');assert.equal(s.grafanaRate,'.0342');assert.equal(s.userRate,'6');
  assert.equal(c.target.lines[0].amount,259.2);
  assert.ok(Math.abs(c.target.lines.find(l=>l.id==='grafana').amount-49.248)<1e-10);
  assert.equal(c.target.missing,1);assert.equal(c.target.lines.find(l=>l.id==='runtime').amount,null);
  assert.equal(c.target.lines.filter(l=>l.id==='fabric').length,1);
  s.collector='0';assert.equal(calculate(s).target.complete,true);
});
test('Coralogix export comparisons use selected vendor, not a Datadog savings figure', () => {
  const s=applyAzureExample(defaultScenario());s.cxContract='500';s.grafanaRate='0';s.collector='0';
  assert.equal(calculate(s,'Coralogix').savings,500-289.2);
  assert.equal(exportDocument('Coralogix',initialPlan(),s).calculation.comparisonVendor,'Coralogix');
});
test('catalog filtering, status counts and strict versioned safe export', () => {
  const p=initialPlan(); assert.equal(features.length,27); assert.equal(planCounts(p).selected,6);
  assert.equal(filterFeatures('Datadog','not-real','All','All',false,p).length,0);
  assert.equal(validPlan(p),true);
  const d=exportDocument('Datadog',p,defaultScenario()); assert.equal(restoreDocument(JSON.stringify(d)).vendor,'Datadog');
  assert.throws(()=>restoreDocument(JSON.stringify({...d,version:99})));
  assert.throws(()=>restoreDocument(JSON.stringify({...d,scenario:{...d.scenario,discount:'101'}})));
  assert.throws(()=>restoreDocument(JSON.stringify({...d,plan:{...p,logs:{...p.logs,target:'javascript:alert(1)'}}})));
});
