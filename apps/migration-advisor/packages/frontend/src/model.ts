export type Term = 'annual' | 'monthly' | 'demand';
export const numericDefaults = {
  days:'30', hours:'720', grafanaHours:'720', logsGB:'10', eventBytes:'1000', indexPercent:'20',
  traceGB:'2', spanMillion:'2', metricGB:'1', hosts:'10', apmHosts:'5', indexedMetrics:'1000', ingestedMetrics:'0',
  ingestRate:'.10', indexRate:'1.70', hostRate:'15', apmRate:'31', traceRate:'.10', spanRate:'1.70', indexedMetricRate:'5', ingestedMetricRate:'.10',
  oncallSeats:'5', oncallRate:'20', rumSessions:'100000', rumRate:'.15', apiRuns:'10000', apiRate:'5', browserRuns:'1000', browserRate:'12',
  rumMonthlyGB:'', rumKBPerSession:'20', cxRumMonthlyGB:'', cxRumMonthlyCost:'',
  ddExtras:'', ddContract:'', discount:'0', cxDiscount:'0', targetDiscount:'0',
  logHigh:'100', logMedium:'0', logLow:'0', traceHigh:'100', traceMedium:'0', traceLow:'0',
  cxLogHigh:'', cxLogMedium:'', cxLogLow:'', cxTraceHigh:'', cxTraceMedium:'', cxTraceLow:'', cxMetricRate:'', cxContract:'', cxExtras:'',
  fabricRate:'', allocation:'100', storageGB:'0', storageRate:'', cacheGB:'0', cacheRate:'',
  grafanaRate:'', users:'5', userRate:'', collector:'', diagnostics:'', aks:'', aksShare:'100', notifications:'', targetExtras:'',
};
export type NumberKey = keyof typeof numericDefaults;
export type Scenario = Record<NumberKey,string> & {
  term: Term; infraTier:'pro'|'enterprise'; apmTier:'standard'|'pro'|'enterprise'; retention:'3'|'7'|'15'|'30';
  apmAllowance:boolean; metricAllowance:boolean; oncall:boolean; rum:boolean; cxRum:boolean; rumSharedEventHub:boolean; synthetic:boolean; ddExtrasEnabled:boolean; cxExtrasEnabled:boolean;
  storageEnabled:boolean; cacheEnabled:boolean; diagnosticsEnabled:boolean; notificationsEnabled:boolean; targetExtrasEnabled:boolean;
  fabricMode:'allocated'|'incremental'; grafanaSize:'X1'|'X2'; runtime:'collector'|'aks'; cxExample:boolean;
  fabricSKU:'F2'|'F4'|'F8'|'F16'|'F32'|'F64'|'F128'|'F256'|'F512'|'F1024'|'custom'; region:string; azureExample:boolean;
};
export function defaultScenario(): Scenario { return { ...numericDefaults,term:'annual',infraTier:'pro',apmTier:'standard',retention:'15',apmAllowance:true,metricAllowance:true,oncall:false,rum:false,cxRum:false,rumSharedEventHub:false,synthetic:false,ddExtrasEnabled:false,cxExtrasEnabled:false,storageEnabled:false,cacheEnabled:false,diagnosticsEnabled:false,notificationsEnabled:false,targetExtrasEnabled:false,fabricMode:'allocated',grafanaSize:'X1',runtime:'collector',cxExample:false,fabricSKU:'custom',region:'Customer region (quote required)',azureExample:false }; }
export function parseNumber(value: string): number|null {
  if (typeof value !== 'string') throw new Error('Enter a numeric value.');
  if (!value.trim()) return null;
  if (!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error('Use a finite, non-negative number.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new Error('Use a number between 0 and 1 trillion.');
  return n;
}
const optional = new Set<NumberKey>(['ingestRate','indexRate','hostRate','apmRate','traceRate','spanRate','indexedMetricRate','ingestedMetricRate','oncallRate','rumRate','rumMonthlyGB','rumKBPerSession','cxRumMonthlyGB','cxRumMonthlyCost','apiRate','browserRate','ddExtras','ddContract','cxLogHigh','cxLogMedium','cxLogLow','cxTraceHigh','cxTraceMedium','cxTraceLow','cxMetricRate','cxContract','cxExtras','fabricRate','storageRate','cacheRate','grafanaRate','userRate','collector','diagnostics','aks','notifications','targetExtras']);
const percents: NumberKey[] = ['indexPercent','discount','cxDiscount','targetDiscount','allocation','aksShare','logHigh','logMedium','logLow','traceHigh','traceMedium','traceLow'];
export function validateScenario(s: Scenario, vendor:'Datadog'|'Coralogix'='Datadog'): Partial<Record<NumberKey|'region',string>> {
  const errors: Partial<Record<NumberKey|'region',string>> = {};
  for (const key of Object.keys(numericDefaults) as NumberKey[]) {
    try { const n = parseNumber(s[key]); if (n === null && !optional.has(key)) errors[key]='Enter a value; use 0 for none.'; }
    catch(e) { errors[key]=(e as Error).message; }
  }
  for (const key of percents) if (Number(s[key])>100) errors[key]='Enter a percentage from 0 to 100.';
  if (!(Number(s.days)>=1 && Number(s.days)<=31)) errors.days='Billing days must be between 1 and 31.';
  if (!(Number(s.eventBytes)>0)) errors.eventBytes='Average event size must be greater than zero.';
  if (Number(s.hours)>Number(s.days)*24) errors.hours='Active hours cannot exceed billing days × 24.';
  if (Number(s.grafanaHours)>Number(s.days)*24) errors.grafanaHours='Grafana hosting hours cannot exceed billing days × 24.';
  for (const prefix of ['log','trace'] as const) {
    if (Math.abs(Number(s[`${prefix}High`])+Number(s[`${prefix}Medium`])+Number(s[`${prefix}Low`])-100)>1e-7) errors[`${prefix}High`]='Priority allocations must sum to 100%.';
  }
  if(vendor==='Datadog' && s.rum && !s.rumMonthlyGB.trim() && Number(s.rumSessions)>0 && !s.rumKBPerSession.trim())
    errors.rumKBPerSession='Enter an estimated KB per session or a measured source volume.';
  if(vendor==='Coralogix' && s.cxRum && !s.cxRumMonthlyGB.trim())
    errors.cxRumMonthlyGB='Enter current RUM GB/month; use 0 for none.';
  if(typeof s.region!=='string' || !s.region.trim() || s.region.length>100) errors.region='Enter a quote region or location (1–100 characters).';
  return errors;
}
export function ddRates(term:Term,infra:Scenario['infraTier'],apm:Scenario['apmTier'],retention:Scenario['retention']) {
  const t=term==='annual'?0:term==='monthly'?1:2;
  return [
    ({pro:[15,18,18],enterprise:[23,27,27]}[infra])[t],
    ({standard:[31,36,36],pro:[35,42,42],enterprise:[40,48,48]}[apm])[t],
    ({'3':[1.06,1.27,1.59],'7':[1.27,1.52,1.91],'15':[1.70,2.04,2.55],'30':[2.50,3,3.75]}[retention])[t],
    [20,24,29][t],[.15,.18,.22][t],[5,6,7.2][t],[12,15,18][t],
  ];
}
export function applyDDList(s:Scenario):Scenario {
  const [host,apm,index,oncall,rum,api,browser]=ddRates(s.term,s.infraTier,s.apmTier,s.retention);
  return {...s,hostRate:String(host),apmRate:String(apm),indexRate:String(index),oncallRate:String(oncall),rumRate:String(rum),apiRate:String(api),browserRate:String(browser),ingestRate:'.10',indexedMetricRate:'5',ingestedMetricRate:'.10'};
}
export function applyCXExample(s:Scenario):Scenario {
  return {...s,cxContract:'',cxExample:true,cxLogHigh:'1.125',cxLogMedium:'.48',cxLogLow:'.18',cxTraceHigh:'.75',cxTraceMedium:'.375',cxTraceLow:'.15',cxMetricRate:'.05'};
}
export function applyAzureExample(s:Scenario):Scenario {
  return {...s,azureExample:true,fabricSKU:'F2',region:'westus3',fabricRate:'.36',storageRate:'.023',cacheRate:'.266',userRate:'6',grafanaRate:'.0342'};
}
export function eventsMillion(gbDay:number,days:number,eventBytes:number,indexPercent:number) { return gbDay*days*1e9/eventBytes/1e6*indexPercent/100; }
export function roundMoney(n:number) { return Math.round((n+Number.EPSILON)*100)/100; }
export type Line = {id:string;label:string;quantity:number;rate:number|null;amount:number|null;formula:string;source:string};
export type Stack = {lines:Line[];total:number;complete:boolean;missing:number;discount:number};
function stack(lines:Line[],discount:number):Stack {
  const subtotal=lines.reduce((n,l)=>n+(l.amount??0),0);
  const missing=lines.filter(l=>l.amount===null).length;
  return {lines,total:subtotal*(1-discount/100),complete:missing===0,missing,discount};
}
export function calculate(s:Scenario,vendor:'Datadog'|'Coralogix'='Datadog') {
  if (Object.keys(validateScenario(s,vendor)).length) throw new Error('Correct invalid scenario values before calculation.');
  const n=(k:NumberKey)=>parseNumber(s[k])??0;
  const rate=(k:NumberKey)=>parseNumber(s[k]);
  const line=(id:string,label:string,q:number,k:NumberKey,formula:string,source:string):Line=>{
    const r=rate(k); return {id,label,quantity:q,rate:r,amount:q===0?0:r===null?null:q*r,formula,source};
  };
  const dd:Line[]=[
    line('logs-ingest','Uncompressed log ingestion',n('logsGB')*n('days'),'ingestRate',`${s.logsGB} GB/day × ${s.days} days × $${s.ingestRate||'?'}/GB`,'dd-pricing'),
    line('logs-index','Indexed log events',eventsMillion(n('logsGB'),n('days'),n('eventBytes'),n('indexPercent')),'indexRate',`GB × 10⁹ ÷ ${s.eventBytes} bytes ÷ 10⁶ × ${s.indexPercent}% × $${s.indexRate||'?'}/M (${s.retention}d retention)`,'dd-pricing'),
    line('hosts','Infrastructure hosts',n('hosts'),'hostRate',`${s.hosts} host-months × $${s.hostRate||'?'}`,'dd-pricing'),
    line('apm','APM hosts',n('apmHosts'),'apmRate',`${s.apmHosts} host-months × $${s.apmRate||'?'}`,'dd-pricing'),
    line('trace-ingest','APM ingestion over allowance',Math.max(0,n('traceGB')*n('days')-(s.apmAllowance?n('apmHosts')*150:0)),'traceRate',`max(0, ${s.traceGB} × ${s.days} GB − ${s.apmAllowance?`${s.apmHosts} × 150`:'0'} included GB) × $${s.traceRate||'?'}`,'dd-apm'),
    line('trace-index','APM indexed spans over allowance',Math.max(0,n('spanMillion')-(s.apmAllowance?n('apmHosts'):0)),'spanRate',`max(0, ${s.spanMillion}M monthly spans − ${s.apmAllowance?s.apmHosts:'0'}M included) × $${s.spanRate||'?'}/M`,'dd-apm'),
    line('metrics-index','Indexed custom metrics over allowance',Math.max(0,n('indexedMetrics')-(s.metricAllowance?n('hosts')*(s.infraTier==='pro'?100:200):0))/100,'indexedMetricRate',`max(0, ${s.indexedMetrics} series − ${s.metricAllowance?`${s.hosts} × ${s.infraTier==='pro'?100:200}`:'0'}) / 100 × $${s.indexedMetricRate||'?'} · pro-rata estimate; confirm contract rounding`,'dd-metrics'),
    line('metrics-ingest','Ingested custom metrics (explicit billable)',n('ingestedMetrics')/100,'ingestedMetricRate',`${s.ingestedMetrics} explicitly billable average series / 100 × $${s.ingestedMetricRate||'?'} · pro-rata estimate; confirm contract rounding`,'dd-metrics'),
  ];
  if(s.oncall) dd.push(line('oncall','On-Call seats',n('oncallSeats'),'oncallRate',`${s.oncallSeats} seats × $${s.oncallRate||'?'}`,'dd-pricing'));
  if(s.rum) dd.push(line('rum','RUM Measure only',n('rumSessions')/1000,'rumRate',`${s.rumSessions} sessions ÷ 1,000 × $${s.rumRate||'?'}`,'dd-pricing'));
  if(s.synthetic) dd.push(line('api','Synthetic API runs',n('apiRuns')/10000,'apiRate',`${s.apiRuns} runs ÷ 10,000 × $${s.apiRate||'?'}`,'dd-pricing'),line('browser','Synthetic browser runs',n('browserRuns')/1000,'browserRate',`${s.browserRuns} runs ÷ 1,000 × $${s.browserRate||'?'}`,'dd-pricing'));
  if(s.ddExtrasEnabled) dd.push(line('dd-extras','Other source products / container overage',1,'ddExtras','Customer quoted monthly amount','dd-pricing'));
  if(rate('ddContract')!==null) dd.splice(0,dd.length,line('dd-contract','Customer monthly bill (all-in)',1,'ddContract','Billed or contracted monthly amount; replaces all estimated Datadog meters','dd-cost-api'));
  const cx:Line[]=[];
  if(rate('cxContract')!==null) cx.push(line('cx-contract','Customer monthly contract (all-in)',1,'cxContract','Monthly contract override; replaces all volume and extra lines','cx-pricing'));
  else {
    for(const signal of ['log','trace'] as const) for(const tier of ['High','Medium','Low'] as const) {
      const q=n(signal==='log'?'logsGB':'traceGB')*n('days')*n(`${signal}${tier}`)/100;
      cx.push(line(`cx-${signal}-${tier}`,`${signal==='log'?'Logs':'Traces'} · ${tier.toLowerCase()} priority`,q,`cx${signal==='log'?'Log':'Trace'}${tier}`,`Daily GB × ${s.days} days × ${s[`${signal}${tier}`]}% × quoted $/GB`,'cx-units'));
    }
    cx.push(line('cx-metrics','Metrics volume',n('metricGB')*n('days'),'cxMetricRate',`${s.metricGB} GB/day × ${s.days} days × quoted $/GB`,'cx-units'));
    if(s.cxRum) {
      const quantity=n('cxRumMonthlyGB')>0 || rate('cxRumMonthlyCost')!==null ? 1 : 0;
      cx.push(line('cx-rum','RUM · customer-provided monthly amount',quantity,'cxRumMonthlyCost','Incremental RUM quote, excluding any amount already in other source lines','cx-pricing'));
    }
    if(s.cxExtrasEnabled) cx.push(line('cx-extras','Archive / quota overage / source extras',1,'cxExtras','Explicit monthly quote; do not also include in all-in contract','cx-pricing'));
  }
  const target:Line[]=[
    line('fabric',`Fabric capacity · ${s.fabricSKU}`,n('hours')*(s.fabricMode==='allocated'?n('allocation')/100:1),'fabricRate',`${s.hours} active hours × hourly SKU rate${s.fabricMode==='allocated'?` × ${s.allocation}% shared allocation`: ' (100% incremental capacity)'} · ${s.region}`,'fabric-price'),
    line('grafana','Grafana Standard hosting',n('grafanaHours')*(s.grafanaSize==='X1'?2:4),'grafanaRate',`${s.grafanaSize==='X1'?2:4} Standard Units × ${s.grafanaHours} hosting hours × unit-hour price`,'grafana-price'),
    line('users','Grafana active users',n('users'),'userRate',`${s.users} unique monthly users × user-month price`,'grafana-price'),
    s.runtime==='collector'?line('runtime','Collector runtime',1,'collector','Monthly Container Apps/runtime quote, after applicable grants','collector-price'):line('runtime','AKS collector baseline allocation',n('aksShare')/100,'aks',`AKS monthly quote × ${s.aksShare}% allocation; replaces collector runtime`,'collector-price'),
  ];
  if(s.storageEnabled) target.push(line('storage','Chargeable OneLake standard storage',n('storageGB'),'storageRate',`${s.storageGB} average retained GB-month × $/GB-month (only separately chargeable storage)`,'fabric-price'));
  if(s.cacheEnabled) target.push(line('cache','Chargeable cache (additional)',n('cacheGB'),'cacheRate',`${s.cacheGB} chargeable GB-month × rate; exclude included cache`,'fabric-consumption'));
  for(const [flag,key,label] of [['diagnosticsEnabled','diagnostics','Diagnostics & network'],['notificationsEnabled','notifications','Paging / notifications / integration'],['targetExtrasEnabled','targetExtras','Specialist products, support & security']] as const) if(s[flag]) target.push(line(key,label,1,key,'Explicit monthly quote, not included in platform subtotal','collector-price'));
  const datadog=stack(dd,n('discount')),coralogix=stack(cx,n('cxDiscount')),azure=stack(target,n('targetDiscount'));
  const source=vendor==='Datadog'?datadog:coralogix;
  return {datadog,coralogix,target:azure,comparisonVendor:vendor,savings:source.complete&&azure.complete?source.total-azure.total:null};
}
