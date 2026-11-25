import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Cable, Check, Download, FileUp, ListFilter, Map, Menu, Moon, Printer, Save, Search, Scale, Sun, X } from 'lucide-react';
import { features, featuresForVendor, filterFeatures, initialPlan, planCounts } from './catalog';
import type { Choice, Plan, Vendor } from './catalog';
import { applyCXExample, applyDDList, defaultScenario, roundMoney } from './model';
import { calculateAutomatic, rumProvisioningAssumption, validateAutomaticScenario } from './automaticTarget';
import type { NumberKey, Scenario, Stack } from './model';
import { exportDocument, restoreDocument } from './persistence';
import { checked, sourceById, sources } from './sources';
import { FeatureInspector } from './FeatureInspector';
import { OtelConfiguration, OtelPrintReport } from './OtelConfiguration';
import { defaultOtel } from './otel';
import type { OtelSettings } from './otel';
import { validateOtel } from './otel';
import { defaultComparison, validateComparison } from './comparison';
import type { CostComparison } from './comparison';
import { MonthlyTotalsResult } from './MonthlyTotals';
import { useFlowRoute } from './useFlowRoute';
import { BreakdownBar, SavingsSummary } from './SavingsSummary';
import { focusInvalid } from './flow';
import { VendorImport } from './VendorImport';

const moneyFormatter=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const money=(n:number)=>moneyFormatter.format(roundMoney(n));
const labels:Record<NumberKey,string> = {
  days:'Billing days / month',hours:'Fabric active hours/month',grafanaHours:'Grafana hosting hours/month',logsGB:'Logs · uncompressed GB/day',eventBytes:'Average log event size · bytes',indexPercent:'Logs indexed · %',traceGB:'Traces · GB/day',spanMillion:'Indexed spans · million/month',metricGB:'Metrics · GB/day',hosts:'Infrastructure · host-months',apmHosts:'APM · host-months',indexedMetrics:'Indexed custom metrics · avg series',ingestedMetrics:'Explicit billable ingested metrics · avg series',
  ingestRate:'Logs ingest · USD/GB',indexRate:'Indexed logs · USD/million events',hostRate:'Infrastructure · USD/host-month',apmRate:'APM · USD/host-month',traceRate:'Overage spans ingest · USD/GB',spanRate:'Overage indexed spans · USD/million',indexedMetricRate:'Indexed metrics · USD/100 series',ingestedMetricRate:'Ingested metrics · USD/100 series',
  ddContract:'Monthly Datadog bill (all-in) · USD',oncallSeats:'On-Call · seat-months',oncallRate:'On-Call · USD/seat-month',rumSessions:'RUM Measure · sessions/month',rumRate:'RUM Measure · USD/1,000 sessions',rumMonthlyGB:'RUM · measured source GB/month (optional)',rumKBPerSession:'Estimated source RUM · KB/session',cxRumMonthlyGB:'RUM · source GB/month',cxRumMonthlyCost:'RUM · incremental source USD/month',apiRuns:'Synthetic API · runs/month',apiRate:'API · USD/10,000 runs',browserRuns:'Synthetic browser · runs/month',browserRate:'Browser · USD/1,000 runs',ddExtras:'Other source products · USD/month',discount:'Datadog discount · %',cxDiscount:'Coralogix discount · %',targetDiscount:'Target discount · %',
  logHigh:'Logs high · %',logMedium:'Logs medium · %',logLow:'Logs low · %',traceHigh:'Traces high · %',traceMedium:'Traces medium · %',traceLow:'Traces low · %',
  cxLogHigh:'Logs high · quoted USD/GB',cxLogMedium:'Logs medium · quoted USD/GB',cxLogLow:'Logs low · quoted USD/GB',cxTraceHigh:'Traces high · quoted USD/GB',cxTraceMedium:'Traces medium · quoted USD/GB',cxTraceLow:'Traces low · quoted USD/GB',cxMetricRate:'Metrics · quoted USD/GB',cxContract:'All-in customer contract · USD/month',cxExtras:'Archive / quota overage · USD/month',
  fabricRate:'Fabric selected SKU · USD/hour',allocation:'Shared capacity allocation · %',storageGB:'Separately chargeable storage · avg GB',storageRate:'Storage · USD/GB-month',cacheGB:'Additional chargeable cache · avg GB',cacheRate:'Cache · USD/GB-month',grafanaRate:'Grafana · USD/Standard Unit-hour',users:'Grafana · unique monthly active users',userRate:'Grafana · USD/user-month',collector:'Collector runtime quote · USD/month',diagnostics:'Diagnostics / network · USD/month',aks:'AKS baseline quote · USD/month',aksShare:'AKS collector allocation · %',notifications:'Paging / integrations · USD/month',targetExtras:'Specialists / support / security · USD/month',
};
function Citation({id}:{id:string}) {
  const s=sourceById(id);
  return s?<a className="citation" href={s.url} target="_blank" rel="noreferrer" title={`${s.title}; checked ${s.checked}`}>Source<span className="sr-only">: {s.title}, checked {s.checked} (new tab)</span></a>:null;
}
function rateField(id:string):NumberKey|undefined {
  const keys:Record<string,NumberKey> = {
    'logs-ingest':'ingestRate','logs-index':'indexRate',hosts:'hostRate',apm:'apmRate',
    'trace-ingest':'traceRate','trace-index':'spanRate','metrics-index':'indexedMetricRate','metrics-ingest':'ingestedMetricRate',
    oncall:'oncallRate',rum:'rumRate',api:'apiRate',browser:'browserRate','dd-extras':'ddExtras','dd-contract':'ddContract',
    'cx-contract':'cxContract','cx-log-High':'cxLogHigh','cx-log-Medium':'cxLogMedium','cx-log-Low':'cxLogLow',
    'cx-trace-High':'cxTraceHigh','cx-trace-Medium':'cxTraceMedium','cx-trace-Low':'cxTraceLow',
    'cx-metrics':'cxMetricRate','cx-extras':'cxExtras','cx-rum':'cxRumMonthlyCost',
  };
  return keys[id];
}
function StackBreakdown({name,data,projection}:{name:string;data:Stack;projection:boolean}) {
  if(projection&&!data.complete)return null;
  return <BreakdownBar lines={data.lines} money={money} fabric={projection} label={projection?'Fabric cost breakdown':`${name} cost breakdown`}/>;
}
function CostStack({name,data,onEditRate,projection=false}:{name:string;data:Stack;onEditRate?:(id:string)=>void;projection?:boolean}) {
  return <section className="cost-stack" aria-label={`${name} cost ledger`}>
    <header className="stack-head"><h3>{name}</h3><span>{projection?'Illustrative reference · not a complete bill':data.complete?'Estimated monthly':'Known subtotal only'}</span><strong>{projection&&!data.complete?'Pilot sizing required':money(data.total)}</strong></header>
    <StackBreakdown name={name} data={data} projection={projection}/>
    {!data.complete&&<p className="warning">{projection?'Outside planning range; pilot sizing required. No target rate entry can resolve this sizing uncertainty.':`${data.missing} active ${data.missing===1?'meter needs':'meters need'} a rate: ${data.lines.filter(l=>l.amount===null).map(l=>l.label).join('; ')}. This subtotal is not the full cost.`}</p>}
    <dl className="cost-lines">{data.lines.map(l=><div key={l.id}><dt>{l.label} <Citation id={l.source}/><small>{l.formula}</small></dt><dd>{l.amount===null?<><span className="unknown">{projection?'Pilot required':'Quote needed'}</span>{onEditRate&&<button type="button" className="rate-return" onClick={()=>onEditRate(l.id)} aria-label={`Enter rate for ${l.label}`}>Enter rate</button>}</>:money(l.amount)}</dd></div>)}</dl>
    <footer>{projection?'Continuous-query reference from automatic assumptions. Not a customer quote or validated sizing.':<>Discount: {data.discount}%. Totals calculated before line rounding.<br/>Annualized: {data.complete?money(data.total*12):'Unavailable'}{data.complete?' (monthly × 12; not an annual quote)':''}</>}</footer>
  </section>;
}
export function App({telemetryConfigured=false}:{telemetryConfigured?:boolean}={}) {
  const {route,navigate}=useFlowRoute();
  const view=route.view;
  const setView=(view:typeof route.view)=>{
    navigate({view,step:'input'});
    requestAnimationFrame(()=>(document.querySelector<HTMLElement>('[data-flow-heading]')??document.querySelector<HTMLElement>('.workspace-head h1'))?.focus({preventScroll:true}));
  };
  const [vendor,setVendorState]=useState<Vendor>('Datadog');
  const [plan,setPlan]=useState<Plan>(initialPlan);
  const [scenario,setScenario]=useState<Scenario>(defaultScenario);
  const [otelSettings,setOtelSettings]=useState<OtelSettings>(defaultOtel);
  const [comparison,setComparison]=useState<CostComparison>(defaultComparison);
  const [legacyTotals,setLegacyTotals]=useState(false);
  const [costSnapshot,setCostSnapshot]=useState<string|null>(null);
  const [otelSnapshot,setOtelSnapshot]=useState<OtelSettings|null>(null);
  const [costAttempted,setCostAttempted]=useState(false);
  const [theme,setTheme]=useState<'light'|'dark'>(()=>{
    try{const saved=localStorage.getItem('migration-advisor-theme');if(saved==='light'||saved==='dark')return saved;}catch{/* Browser storage is optional. */}
    return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  });
  const [navOpen,setNavOpen]=useState(false);
  const railRef=useRef<HTMLElement>(null);
  const menuRef=useRef<HTMLButtonElement>(null);
  function closeNavigation(){
    setNavOpen(false);
    requestAnimationFrame(()=>menuRef.current?.focus());
  }
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('migration-advisor-theme',theme);}catch{/* Theme still works without storage. */}
  },[theme]);
  useEffect(()=>{
    if(!navOpen)return;
    const rail=railRef.current;
    rail?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeNavigation();}
      if(event.key==='Tab'&&rail){
        const controls=Array.from(rail.querySelectorAll<HTMLElement>('a,button')).filter(el=>el.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',onKey);
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return ()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=previous;};
  },[navOpen]);
  const inventoryAllowed=useRef(true);
  const [query,setQuery]=useState(''),[category,setCategory]=useState('All'),[status,setStatus]=useState('All'),[selectedOnly,setSelectedOnly]=useState(false);
  const [isMobile,setIsMobile]=useState(()=>window.matchMedia('(max-width: 700px)').matches);
  const [inspector,setInspector]=useState<string|null>(()=>window.matchMedia('(max-width: 700px)').matches?null:'monitors'),[message,setMessage]=useState('');
  const upload=useRef<HTMLInputElement>(null);
  const inspectorHeading=useRef<HTMLHeadingElement>(null);
  const registerRef=useRef<HTMLElement>(null);
  const originRow=useRef<HTMLButtonElement|null>(null);
  const userOpenedInspector=useRef(false);
  const pendingInspectorFocus=useRef(false);
  const pendingOriginFocus=useRef(false);
  const pendingRateFocus=useRef<NumberKey|null>(null);
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 700px)');
    const onChange=()=>{
      setIsMobile(media.matches);
      if(!media.matches)setNavOpen(false);
      if(media.matches&&!userOpenedInspector.current)setInspector(null);
    };
    media.addEventListener('change',onChange);
    return ()=>media.removeEventListener('change',onChange);
  },[]);
  useLayoutEffect(()=>{
    if(view!=='map')return;
    if(inspector&&pendingInspectorFocus.current&&inspectorHeading.current){
      pendingInspectorFocus.current=false;
      inspectorHeading.current.focus({preventScroll:true});
      if(isMobile)inspectorHeading.current.closest('aside')?.scrollIntoView({block:'start'});
    }
    if(!inspector&&pendingOriginFocus.current){
      pendingOriginFocus.current=false;
      const target=originRow.current?.isConnected?originRow.current:registerRef.current;
      target?.focus({preventScroll:true});
      if(isMobile)target?.scrollIntoView({block:'center'});
    }
  },[inspector,view,isMobile]);
  function openInspector(id:string,row:HTMLButtonElement){
    originRow.current=row;
    userOpenedInspector.current=true;
    if(inspector===id&&inspectorHeading.current){
      inspectorHeading.current.focus({preventScroll:true});
      if(isMobile)inspectorHeading.current.closest('aside')?.scrollIntoView({block:'start'});
    }else{
      pendingInspectorFocus.current=true;
      setInspector(id);
    }
  }
  function closeInspector(){
    userOpenedInspector.current=false;
    pendingOriginFocus.current=true;
    setInspector(null);
  }
  function setVendor(next:Vendor){
    if(inspector&&!featuresForVendor(next).some(f=>f.id===inspector)){
      userOpenedInspector.current=false;
      pendingInspectorFocus.current=false;
      setInspector(null);
    }
    setVendorState(next);
  }
  const errors=validateAutomaticScenario(scenario,vendor);
  const valid=Object.keys(errors).length===0;
  const comparisonErrors=validateComparison(comparison);
  const costValid=comparison.method==='totals'?Object.keys(comparisonErrors).length===0:valid;
  const costKey=JSON.stringify({vendor,comparison,scenario:comparison.method==='usage'?scenario:null});
  const costReady=costValid&&costSnapshot===costKey;
  const otelReady=!!otelSnapshot&&JSON.stringify(otelSnapshot)===JSON.stringify(otelSettings)&&Object.keys(validateOtel(otelSnapshot)).length===0;
  const resultReady=view==='cost'?costReady:view==='otel'?otelReady:false;
  const showResults=route.step==='results'&&resultReady;
  useEffect(()=>{
    if((view==='cost'||view==='otel')&&route.step==='results'&&!resultReady) navigate({view,step:'input'},true);
  },[view,route.step,resultReady,navigate]);
  useLayoutEffect(()=>{
    if(view!=='cost'&&view!=='otel')return;
    window.scrollTo({top:0,behavior:'instant'});
    document.querySelector<HTMLElement>('[data-flow-heading]')?.focus({preventScroll:true});
    if(view==='cost'&&!showResults&&pendingRateFocus.current){
      focusInvalid(`input-${pendingRateFocus.current}`);
      pendingRateFocus.current=null;
    }
  },[view,showResults]);
  function continueCost(){
    setCostAttempted(true);
    if(!costValid){
      const key=Object.keys(comparison.method==='totals'?comparisonErrors:errors)[0];
      focusInvalid(comparison.method==='totals'?`comparison-${key}`:`input-${key}`);
      return;
    }
    setCostSnapshot(costKey);
    navigate({view:'cost',step:'results'});
  }
  const costs=valid?calculateAutomatic(scenario,vendor):null;
  const rows=filterFeatures(vendor,query,category,status,selectedOnly,plan);
  const activeFeatures=featuresForVendor(vendor);
  const omittedFeatures=features.filter(f=>f.capabilities[vendor].support==='Not verified');
  const counts=planCounts(plan,vendor);
  const selected=activeFeatures.find(f=>f.id===inspector);
  const setChoice=(id:string,update:Partial<Choice>)=>setPlan(p=>({...p,[id]:{...p[id],...update}}));
  const update=<K extends keyof Scenario>(key:K,value:Scenario[K])=>setScenario(s=>({...s,[key]:value}));
  const field=(key:NumberKey,hint?:string,prefix='input')=><label className="field" key={key} htmlFor={`${prefix}-${key}`}><span>{labels[key]}</span><input id={`${prefix}-${key}`} inputMode="decimal" type="text" value={scenario[key]} placeholder={key==='rumMonthlyGB'?'Optional · estimate from sessions':'Quote required'} aria-invalid={costAttempted&&!!errors[key]} aria-describedby={costAttempted&&errors[key]?`${prefix}-error-${key}`:hint?`hint-${key}`:undefined} onChange={e=>update(key,e.target.value)}/>{costAttempted&&errors[key]?<small className="field-error" id={`${prefix}-error-${key}`}>{errors[key]}</small>:hint?<small id={`hint-${key}`}>{hint}</small>:null}</label>;
  const toggle=(key:keyof Scenario,label:string)=> <label className="check" key={key}><input type="checkbox" checked={scenario[key]===true} onChange={e=>setScenario(s=>({...s,[key]:e.target.checked}))}/>{label}</label>;
  const select=(key:keyof Scenario,label:string,options:[string,string][],list=false)=><label className="field"><span>{label}</span><select value={String(scenario[key])} onChange={e=>setScenario(s=>{
    const next={...s,[key]:e.target.value};
    if(key==='apmTier'&&e.target.value!=='standard')next.apmAllowance=false;
    return list?applyDDList(next):next;
  })}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
  function exportJSON() {
    try { const blob=new Blob([JSON.stringify(exportDocument(vendor,plan,scenario,otelSettings,comparison),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='observability-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('Plan, comparison and OTel settings exported. No data was sent to a vendor.'); }
    catch(e){setMessage((e as Error).message);}
  }
  function restore(text:string) { try{const d=restoreDocument(text);inventoryAllowed.current=false;setVendor(d.vendor);setPlan(d.plan);setScenario(d.scenario);setComparison(d.comparison);setLegacyTotals(d.comparison.method==='totals'||!!d.comparison.sourceMonthly||!!d.comparison.targetMonthly);setOtelSettings(d.otel);setCostSnapshot(null);setOtelSnapshot(null);setCostAttempted(false);navigate({view,step:'input'},true);setMessage('Version 1 plan and drafts restored locally. Review inputs to generate new results.');}catch(e){setMessage(`Cannot restore: ${(e as Error).message}`);} }
  function applyImport(next:Vendor,patch:Partial<Scenario>,summary:string) {
    if(next!==vendor){setVendor(next);setOtelSnapshot(null);}
    setScenario(s=>({...s,...patch}));setCostSnapshot(null);setCostAttempted(false);setMessage(summary);
  }
  function save() {try{localStorage.setItem('migration-advisor-v1',JSON.stringify(exportDocument(vendor,plan,scenario,otelSettings,comparison)));setMessage('Saved on this browser only. Shared-device users should clear the saved plan.');}catch(e){setMessage(`Save failed: ${(e as Error).message}`);} }
  const sourceCost=costs?(vendor==='Datadog'?costs.datadog:costs.coralogix):null;
  const editRate=(id:string)=>{pendingRateFocus.current=rateField(id)??null;navigate({view:'cost',step:'input'});};
  return <div className="app" id="map">
    <a href="#main" className="skip" onClick={event=>{event.preventDefault();document.getElementById('main')?.focus();}}>Skip to workspace</a>
    {navOpen&&<button className="nav-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={closeNavigation}/>}
    <aside ref={railRef} id="workspace-navigation" className={`sidebar${navOpen?' sidebar-open':''}`} role={navOpen?'dialog':undefined} aria-modal={navOpen?true:undefined} aria-label="RTI navigation">
      <a className="brand" href="#map" aria-label="RTI Migration advisor, migration map" onClick={()=>{setNavOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLElement>('.workspace-head h1')?.focus({preventScroll:true}));}}><span className="brand-mark"><Map size={22}/></span><span>RTI</span></a>
      <button className="drawer-close icon-button" aria-label="Close navigation" onClick={closeNavigation}><X size={18}/></button>
      <nav aria-label="Workspace">{([['map','Migration map',Map],['cost','Cost comparison',Scale],['otel','OTel configuration',Cable],['sources','Sources & scope',BookOpen]] as const).map(([id,label,Icon])=><button key={id} id={`nav-${id}`} title={label} className={view===id?'nav-button active':'nav-button'} aria-current={view===id?'page':undefined} onClick={()=>{setNavOpen(false);setView(id);}}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-note">Local<br/>planner</div>
    </aside>
    <div className="workspace" inert={navOpen?true:undefined}>
      <header className="topbar">
        <button ref={menuRef} className="icon-button menu-toggle" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={navOpen} onClick={()=>setNavOpen(true)}><Menu size={18}/></button>
        <nav aria-label="Breadcrumb"><ol className="breadcrumb"><li>RTI Migration advisor</li><li aria-current="page">{view==='map'?'Migration map':view==='cost'?'Cost comparison':view==='otel'?'OTel configuration':'Sources & scope'}</li></ol></nav>
        <span className="topbar-status"><Check size={13}/>{telemetryConfigured?'Browser telemetry configured':'Local-only'}</span>
        <button className="icon-button theme-toggle" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} title={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>
      </header>
      <main id="main" tabIndex={-1}>
      <p className="app-disclaimer">Planning tool · no systems are changed. Cost projections are illustrative, not quotes or validated capacity sizing. {telemetryConfigured?'Browser telemetry is configured: fixed page views and load timings are sent, never calculator inputs or files.':'Browser telemetry is off unless configured at build time.'}</p>
      <header className="workspace-head"><div><h1 tabIndex={-1}>{view==='map'?'Migration map':view==='cost'?'Cost comparison':view==='otel'?'OTel configuration':'Sources & scope'}</h1><p>{view==='map'?'Record what needs to move. Decide what needs to change.':view==='cost'?'Estimate monthly costs from source usage.':view==='otel'?'Prepare a Collector configuration for Fabric.':'Evidence, assumptions and boundaries of this planning tool.'}</p></div>{(view==='map'||showResults)&&<div className="toolbar"><button onClick={exportJSON}><Download size={16}/>Export JSON</button><button onClick={()=>window.print()}><Printer size={16}/>Print report</button></div>}</header>
      <div className="context-bar"><div className="vendor-switch" role="group" aria-label="Source vendor">{(['Datadog','Coralogix'] as Vendor[]).map(v=><button key={v} aria-pressed={vendor===v} onClick={()=>{if(v!==vendor){setVendor(v);setCostSnapshot(null);setOtelSnapshot(null);setCostAttempted(false);setView(view);}}}>{v}</button>)}</div><span className="context-target"><ArrowRight size={16}/>Azure Managed Grafana + Fabric Eventhouse</span><span className="manual-label">Stage 1 · manual plan</span></div>
      {view==='otel'&&<OtelConfiguration settings={otelSettings} onChange={next=>{inventoryAllowed.current=false;setOtelSettings(next);setOtelSnapshot(null);}} vendor={vendor} results={showResults} snapshot={otelSnapshot} onGenerate={()=>{setOtelSnapshot({...otelSettings});navigate({view:'otel',step:'results'});}} onEdit={()=>navigate({view:'otel',step:'input'})} inventoryAllowed={inventoryAllowed}/>}
      {view==='map'&&<>
        <div className="register-summary" aria-live="polite"><strong>{counts.selected} / {activeFeatures.length} features in scope</strong><span className="status translate">{counts.Translate} translate</span><span className="status redesign">{counts.Redesign} redesign</span><span className="status specialist">{counts.Specialist} specialist</span></div>
        <details className="capability-scope"><summary>Capability scope{omittedFeatures.length?` · ${omittedFeatures.length} category not verified`:''}</summary><p>27 migration categories, not the full vendor portfolio or customer licensing. Native means vendor-owned documented capability, not included entitlement. Integration, Limited scope and Separate offering identify dependencies or narrower coverage.</p>{omittedFeatures.map(f=><p key={f.id}><strong>{f.capabilities[vendor].name}</strong>: {f.capabilities[vendor].description} Omitted from this vendor map; saved selections remain in the plan. {f.capabilities[vendor].evidence.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">Official index · reviewed {source.reviewed}</a>)}</p>)}</details>
        <div className="filters"><label className="search"><span className="sr-only">Search source or target features</span><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search source or target…"/></label><label><span className="sr-only">Category</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="All">All categories</option>{[...new Set(activeFeatures.map(f=>f.category))].map(c=><option key={c}>{c}</option>)}</select></label><label><span className="sr-only">Mapping status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="All">All dispositions</option>{[...new Set(activeFeatures.map(f=>f.status))].map(s=><option key={s}>{s}</option>)}</select></label><label className="check"><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/><ListFilter size={16}/>In scope only</label></div>
        <div className={`register-layout ${selected?'with-inspector':''}`}>
          <section className="register" aria-label="Source feature mapping" ref={registerRef} tabIndex={-1}><div className="register-labels"><span>Scope / source feature</span><span>Proposed destination</span><span>Disposition</span></div>
            {rows.map(f=><div className={`feature-row ${f.id===inspector?'inspected':''}`} key={f.id}><label className="scope-check"><input type="checkbox" checked={plan[f.id].needed} onChange={e=>setChoice(f.id,{needed:e.target.checked})}/><span className="sr-only">Include {f.name} in scope</span></label><button className="row-main" aria-expanded={inspector===f.id} aria-controls="feature-inspector" onClick={e=>openInspector(f.id,e.currentTarget)}><span className="feature-source"><strong>{f.name}</strong><small className="capability-kind">{f.capabilities[vendor].support}</small></span><span className="feature-target">{plan[f.id].target}<small>{f.shipment}</small></span><span className={`status ${f.status.toLowerCase()}`}>{f.status}</span></button></div>)}
            {!rows.length&&<div className="empty"><h3>No matching features</h3><p>Try a broader search or include features outside your current scope.</p><button onClick={()=>{setQuery('');setCategory('All');setStatus('All');setSelectedOnly(false);}}>Clear filters</button></div>}
            <footer className="register-foot">{rows.length} features shown · Translate means manual rebuild, not automatic conversion.</footer>
          </section>
          {selected&&<FeatureInspector feature={selected} vendor={vendor} choice={plan[selected.id]} headingRef={inspectorHeading} onChange={update=>setChoice(selected.id,update)} onClose={closeInspector}/>}
        </div>
      </>}
      {view==='cost'&&<>
        <div className="flow-page">
          {!showResults?<form className="inputs flow-inputs" aria-label="Customer cost inputs" onSubmit={event=>{event.preventDefault();continueCost();}}>
            <h2 data-flow-heading tabIndex={-1}>{comparison.method==='usage'?'Estimate from usage':'Saved monthly totals'}</h2>
            {legacyTotals&&<fieldset className="method-choice"><legend>Restored comparison method</legend>{([['totals','Use saved monthly totals'],['usage','Estimate from usage']] as const).map(([method,label])=><label className="check" key={method}><input type="radio" name="comparison-method" checked={comparison.method===method} onChange={()=>{setComparison(c=>({...c,method}));setCostAttempted(false);}}/>{label}</label>)}</fieldset>}
            {comparison.method==='totals'?<><p className="flow-help">Legacy monthly totals are preserved for viewing only. Switch to usage for a new automatic planning estimate.</p><dl className="totals-summary"><div><dt>{vendor} saved monthly total</dt><dd>{comparison.sourceMonthly||'Unknown'} USD</dd></div><div><dt>Saved target monthly total</dt><dd>{comparison.targetMonthly||'Unknown'} USD</dd></div></dl></>:<>
            <VendorImport vendor={vendor} scenario={scenario} onApply={applyImport}/>
            <p className="flow-help">Enter your current source usage. We automatically project an Azure + Fabric planning range from these volumes. No Fabric sizing or target rates to enter.</p>
            <div className="field-grid">{field('logsGB')}{field('traceGB')}{field('metricGB')}{vendor==='Datadog'&&<>{field('hosts')}{field('apmHosts')}</>}</div>
            <details className="rum-usage"><summary>Real user monitoring (optional)</summary>
              {toggle(vendor==='Datadog'?'rum':'cxRum',`Include ${vendor} RUM usage`)}
              {(vendor==='Datadog'?scenario.rum:scenario.cxRum)&&<>
                <p className="hint">Enter source usage separately from the logs, traces and metrics above to avoid counting the same browser data twice. Coralogix browser logs can be included in log usage.</p>
                <div className="field-grid">{vendor==='Datadog'?<>
                  {field('rumSessions')}{field('rumMonthlyGB','Prefer measured source browser telemetry. If blank, the editable KB/session estimate below is used.')}
                </>:<>
                  {field('cxRumMonthlyGB','Source browser telemetry volume; enter 0 only for confirmed zero.')}{field('cxRumMonthlyCost','Optional incremental quote, excluding other source lines. Blank is unknown unless usage is zero or an all-in contract is supplied.')}
                </>}</div>
                <details><summary>RUM pricing &amp; sizing assumptions</summary>
                  {vendor==='Datadog'&&<div className="field-grid">{field('rumKBPerSession','Unvalidated 20 KB/session placeholder; replace with your estimate. Decimal KB; used only when measured source GB is blank.')}{field('rumRate','Datadog RUM Measure only; full RUM and replay may cost more.')}</div>}
                  {toggle('rumSharedEventHub','Credit one already-paid TU in an alternative existing SAS-compatible namespace')}
                  <p className="hint">The included infra/optional/rum.bicep creates a dedicated Event Hubs namespace; it does not provision a shared namespace or connection. Use this credit only for an existing SAS-compatible connection with confirmed spare capacity.</p>
                  <p className="hint">{rumProvisioningAssumption}</p>
                  <p className="hint">Source GB is an estimated 1:1 proxy for Application Insights and Fabric; exported JSON can differ from billed ingestion. Application Insights Analytics: $2.30/GB with no free grant assumed. Event Hubs Standard: $0.03/TU-hour × 730 hours, with a minimum of one TU even at zero traffic; only additional TUs are charged when the shared alternative is selected. Actual SDK volume and peak throughput require measurement. <Citation id="appinsights-pricing"/> <Citation id="eventhubs-pricing"/></p>
                  <p className="hint">RUM storage uses {vendor==='Datadog'?`the selected Datadog log retention (${scenario.retention} days)`:'an assumed 30 days for Coralogix'}. The shipped fabric/rum.kql defaults RUMEnvelopes to 7-day retention. Review like-for-like retention before comparing costs.</p>
                </details>
                <p className="hint">Browser SDK → Application Insights → Azure Monitor diagnostic settings → Event Hubs → Fabric Eventhouse. This is browser telemetry, not full RUM or session replay. The five assumed Application Insights categories currently have no separate export charge; variable Event Hubs ingress event charges are excluded. <Citation id="appinsights-export"/> <Citation id="appinsights-export-categories"/></p>
              </>}
            </details>
            <p className="warning">The target range uses illustrative Microsoft workload examples, not a validated GB-to-Fabric sizing formula. Actual costs can fall outside the range; validate with a representative workload.</p>
            <details className="advanced-assumptions"><summary>Advanced source assumptions</summary>
            <div className="field-grid">{field('days')}</div>
            <h3>Billing basis</h3>{select('term','Comparison term (Datadog list basis)',[['annual','Annual commitment'],['monthly','Month-to-month'],['demand','On-demand']],true)}<p className="hint">All outputs are USD per selected billing month. Azure and Coralogix quotes must match this term and region. Host/user/seat-months are monthly quantities, not day-prorated.</p>
            {vendor==='Datadog'?<>
              <h3>Datadog modular meters <Citation id="dd-pricing"/></h3><div className="field-grid">{field('ddContract','Optional. A billed or contracted monthly total replaces every estimated Datadog meter below.')}</div><div className="field-grid">{select('infraTier','Infrastructure tier',[['pro','Pro'],['enterprise','Enterprise']],true)}{select('apmTier','APM tier',[['standard','Standard'],['pro','Pro'],['enterprise','Enterprise']],true)}{select('retention','Indexed logs retention',[['3','3 days'],['7','7 days'],['15','15 days'],['30','30 days']],true)}{field('eventBytes','Decimal GB; average uncompressed bytes/event is a sizing assumption.')}{field('indexPercent')}{field('spanMillion')}{field('indexedMetrics','Hourly-average distinct timeseries, not datapoints.')}{field('ingestedMetrics','Enter billable series after your confirmed contract allowance; no ingested allowance assumed.')}</div>
              {toggle('apmAllowance','Apply standard-host span allowances (confirm contract)')}<p className="hint">150 GB ingested + 1M indexed spans per APM host-month. Disable for custom/nonstandard deployments. The .10/GB and 1.70/M overage defaults are annual 15-day examples; adjust for other terms/contracts. <Citation id="dd-apm"/></p>
              {toggle('metricAllowance','Apply indexed metric host allowances')}<p className="hint">Pro 100 / Enterprise 200 indexed series per infrastructure host; explicit billable ingested series remain separate. Rates per 100 series use a pro-rata estimate; confirm contract rounding. <Citation id="dd-metrics"/></p>
              <details><summary>Public / negotiated unit rates</summary><p className="hint">Changing term or tier loads the matching core list rates. Overages remain customer-adjustable. Checked {checked}.</p><button type="button" onClick={()=>{setScenario(applyDDList(scenario));setMessage('Datadog core public list rates loaded; verify APM overages separately.');}}>Reload selected public list rates</button><div className="field-grid">{(['ingestRate','indexRate','hostRate','apmRate','traceRate','spanRate','indexedMetricRate','ingestedMetricRate'] as NumberKey[]).map(k=>field(k))}</div></details>
              <details><summary>Optional source products & adjustments</summary>{toggle('oncall','Include Datadog On-Call')}{scenario.oncall&&<div className="field-grid">{field('oncallSeats')}{field('oncallRate')}</div>}{toggle('synthetic','Include synthetic API/browser runs')}{scenario.synthetic&&<div className="field-grid">{field('apiRuns')}{field('apiRate')}{field('browserRuns')}{field('browserRate')}</div>}{toggle('ddExtrasEnabled','Include containers, archive, security or other products')}{scenario.ddExtrasEnabled&&field('ddExtras')}{field('discount')}</details>
            </>:<>
              <h3>Coralogix quoted meters <Citation id="cx-pricing"/></h3>{field('cxContract','Optional all-in override replaces every Coralogix volume/extra line. Leave blank to price signals.')}{field('cxDiscount')}
              {scenario.cxContract.trim()===''&&<><div className="warning">No quote is assumed. Headline logs .42/traces .16/metrics .06 USD/GB and FAQ examples do not reconcile with the official unit-table illustration.</div><button type="button" onClick={()=>{setScenario(applyCXExample(scenario));setMessage('Loaded published unit illustration — not a customer quote.');}}>Load published unit illustration</button>{scenario.cxExample&&<p className="warning">Published unit illustration active ($1.50/unit), not your contract. Replace rates with equivalent-workload quotes.</p>}<h4>Priority allocation</h4><p className="hint">Each signal must sum to 100%. Low priority loses alerts/custom dashboards. Unmatched data defaults high; blocked logs are excluded from this equivalent-workload model. <Citation id="cx-tco"/></p><div className="field-grid">{(['logHigh','logMedium','logLow','traceHigh','traceMedium','traceLow'] as NumberKey[]).map(k=>field(k))}</div><h4>Per-priority quote rates</h4><div className="field-grid">{(['cxLogHigh','cxLogMedium','cxLogLow','cxTraceHigh','cxTraceMedium','cxTraceLow','cxMetricRate'] as NumberKey[]).map(k=>field(k))}</div>{toggle('cxExtrasEnabled','Include customer-owned archive / daily quota overage')}{scenario.cxExtrasEnabled&&field('cxExtras')}</>}
            </>}
            {costAttempted&&!valid&&<details open><summary>Correct invalid assumptions</summary><p className="hint">Includes saved values for disabled options or the other vendor.</p>{Object.keys(errors).filter(key=>key!=='region').map(key=>field(key as NumberKey,undefined,'correction'))}</details>}
            </details></>}
            {costAttempted&&!costValid&&<p className="field-error" role="alert">Check the highlighted inputs before continuing. Any invalid advanced assumptions have been expanded.</p>}
            <div className="flow-next"><button id="cost-next" className="primary-button" type="submit">View comparison <ArrowRight size={16}/></button></div>
          </form>:<section className="reconciliation flow-results" aria-label="Submitted cost comparison">
            <button id="cost-edit" className="edit-inputs" onClick={()=>navigate({view:'cost',step:'input'})}>Edit inputs</button>
            <header className="reconciliation-head"><h2 data-flow-heading tabIndex={-1}>Monthly cost comparison</h2><span>{comparison.method==='totals'?'Entered monthly totals':`Usage estimate · ${scenario.days} billing days`}</span></header>
            {comparison.method==='totals'?<MonthlyTotalsResult comparison={comparison} vendor={vendor}/>:costs&&sourceCost&&<>
              {costs.automatic.rum.eventHubsLimitExplanation&&<p className="warning" role="status">{costs.automatic.rum.eventHubsLimitExplanation} <Citation id="eventhubs-limits"/></p>}
              <SavingsSummary vendor={vendor} source={sourceCost} target={costs.target} lowerMonthly={costs.automatic.lowerMonthly} money={money}/>
              <div className="result-split">
                <div className="split-column current"><p className="split-label">Today · current observability</p><CostStack name={vendor} data={sourceCost} onEditRate={editRate}/></div>
                <div className="split-column proposed">
                  <p className="split-label">With Fabric RTI · projected</p>
                  <p className="sizing-reference">Sized for {costs.automatic.dailyGB.toLocaleString()} GB/day{costs.automatic.rum.enabled?` including ${costs.automatic.rum.monthlyGB.toLocaleString()} GB/month RUM proxy`:''} · {costs.automatic.capacitySKU} · {costs.automatic.hours} h/month · {costs.automatic.region}</p>
                  <CostStack name="Azure + Fabric continuous-query reference" data={costs.target} projection/>
                </div>
              </div>
              <details className="automatic-details"><summary>Automatic target assumptions &amp; limitations</summary>
                <p>{costs.automatic.lowerMonthly===null||costs.automatic.upperMonthly===null?'The workload is outside the reference sizing range; pilot sizing is required.':`Sensitivity references: ${money(costs.automatic.lowerMonthly)}–${money(costs.automatic.upperMonthly)} / month. The lower-activity and continuous-query examples are illustrative, not confidence bounds or a complete bill.`}</p>
                {costs.automatic.lowerMonthly!==null&&costs.automatic.lowerMonthly===costs.automatic.upperMonthly&&<p>Both references use the same minimum always-on capacity baseline. Equal amounts do not eliminate sizing uncertainty.</p>}
                <p className="warning">This is not a validated GB-to-Fabric sizing formula. Actual cost may fall outside this range. No guaranteed savings or equivalent-coverage promise; benchmark ingestion, queries and concurrency before sizing.</p>
                <p>{costs.automatic.basis}</p>
                <h3>Read-only planning assumptions</h3><ul>{costs.automatic.assumptions.map(item=><li key={item}>{item}</li>)}</ul>
                <h3>Limitations &amp; excluded costs</h3><ul>{costs.automatic.limitations.map(item=><li key={item}>{item}</li>)}</ul>
              </details>
            </>}
            <details className="responsibilities"><summary>Review feature scope &amp; operating responsibilities</summary>
              <p>{counts.selected} features selected; {counts.Specialist} specialist and {counts.Redesign} redesign decisions. Quote coverage gaps before approval.</p>
              {comparison.method==='usage'&&vendor==='Datadog'&&(scenario.oncall||scenario.synthetic)&&!scenario.targetExtrasEnabled&&!scenario.notificationsEnabled&&<p className="warning">Source optional products are enabled, but target specialist/paging costs are excluded. This is not like-for-like.</p>}
              {comparison.method==='usage'&&costs?.automatic.rum.enabled&&<p className="warning">Application Insights browser telemetry does not provide full RUM or session replay parity. Validate coverage and quote excluded, variable Event Hubs ingress event charges.</p>}
              <p>Plan Collector operations, capacity headroom, schemas, retention, access, alert rules and incident ownership. Baseline dashboards do not replace paging, RUM, synthetics or security.</p><button onClick={()=>setView('map')}>Review feature scope <ArrowRight size={16}/></button>
            </details>
          </section>}
        </div>
      </>}
      {view==='sources'&&<section className="sources"><h2>Official source register</h2><p>Checked {checked}. List prices and documentation are evidence, not binding quotes. Target projections use automatic, read-only West US 3 planning assumptions and illustrative workload examples. They are not validated capacity sizing. Coralogix examples use differing scopes and must not be silently substituted for quotes.</p>{sources.map(s=><article key={s.id}><div><h3><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h3><p>{s.note}</p><small>Checked {s.checked} · {new URL(s.url).hostname}</small></div></article>)}<h2>What this stage does not do</h2><p>No vendor login, customer-data upload, API discovery, query conversion, deployment or migration execution. Customer inputs stay in memory unless you choose browser save or export. Protected Fabric hosting uses platform authentication; this planner does not ask for credentials.</p><h3>Optional browser telemetry</h3><p>{telemetryConfigured?'Configured for this build.':'Off for this build.'} A build-time Application Insights connection string enables fixed page-route views and a navigation load / first-contentful-paint timing event. Calculator inputs, imported files, query strings, referrers, request/dependency data and automatic exception details are not collected. SDK cookies, storage, remote configuration and SDK stats are disabled. The network connection still exposes an IP address and user agent to Azure. The connection string is public in the browser bundle, not a secret.</p><h3>Repository shipment boundary</h3><p>Three-signal OTLP ingestion, raw tables/views, Grafana metrics/logs/traces and native Fabric dashboards are the sample foundation. Optional RTI OnCall supports real alert authoring; baseline alert rules, comprehensive automation and production responder schedules are not shipped. Validate every proposed option in your own tenant.</p><h3>Licenses</h3><p>IBM Plex Sans is self-hosted under the <a href="./licenses/ibm-plex-sans.txt" target="_blank" rel="noreferrer">complete SIL Open Font License and copyright notice</a>.</p><p><a href="./licenses/application-insights-sdk.txt" target="_blank" rel="noreferrer">Application Insights SDK and NevWare license notices</a>.</p></section>}
      <details className="plan-actions"><summary>Plan actions · save, restore &amp; import</summary>
      <footer className="local-actions"><span><Check size={15}/>Inputs stay local · no vendor connection</span><button onClick={save}><Save size={16}/>Save in this browser</button><button onClick={()=>{try{const text=localStorage.getItem('migration-advisor-v1');text?restore(text):setMessage('No saved plan in this browser.');}catch{setMessage('Browser storage is unavailable. Use a JSON file instead.');}}}>Restore saved</button><button onClick={()=>{try{localStorage.removeItem('migration-advisor-v1');setMessage('Saved browser plan cleared. Current work remains in memory.');}catch{setMessage('Browser storage unavailable.');}}}>Clear saved</button><button onClick={()=>upload.current?.click()}><FileUp size={16}/>Import JSON</button><input className="sr-only" ref={upload} type="file" accept=".json,application/json" aria-label="Import planner JSON file" tabIndex={-1} onChange={async e=>{const f=e.target.files?.[0];if(f){if(f.size>1e6)setMessage('File must be under 1 MB.');else restore(await f.text());}e.target.value='';}}/></footer>
      </details>
      <div className="message" role="status">{message}</div>
      {(view==='map'||showResults)&&<section className="print-report"><h1>Observability migration plan</h1><p>Manual planning only · {vendor} → Azure Managed Grafana + Fabric Eventhouse · pricing checked {checked}</p><h2>Feature scope · {counts.selected} / {activeFeatures.length}</h2><p>27 migration categories, not full vendor portfolio or licensing. Native means vendor-owned documented capability, not entitlement.</p>{omittedFeatures.map(f=><p key={f.id}>{f.capabilities[vendor].name}: Not verified in reviewed documentation; omitted from this vendor report.</p>)}{activeFeatures.filter(f=>plan[f.id].needed).map(f=><article key={f.id}><h3>{f.name} · {plan[f.id].priority} · count {plan[f.id].count}</h3><p>{f.capabilities[vendor].support} · {f.capabilities[vendor].description}</p><p>{plan[f.id].target} · {f.status}</p><p>{f.rationale}</p><p>Repository: {f.shipment}</p>{f.capabilities[vendor].evidence.map(source=><p key={source.url}>{source.url} · reviewed {source.reviewed}</p>)}{f.sources.map(id=><p key={id}>{sourceById(id)?.url}</p>)}</article>)}
        {comparison.method==='totals'?<><h2>Saved legacy monthly totals (USD)</h2>{Object.keys(comparisonErrors).length===0?<MonthlyTotalsResult comparison={comparison} vendor={vendor}/>:<p>Monthly totals are incomplete. No comparison or savings calculated.</p>}</>:costs&&sourceCost&&<><h2>Planning estimate (USD)</h2><p>Illustrative range: {costs.automatic.lowerMonthly===null||costs.automatic.upperMonthly===null?'Outside planning range; pilot sizing required':`${money(costs.automatic.lowerMonthly)} – ${money(costs.automatic.upperMonthly)} / month`}. Actual cost may be outside this range. Not a validated GB-to-Fabric sizing formula or complete bill.</p><CostStack name={vendor} data={sourceCost}/><CostStack name="Azure + Fabric continuous-query reference" data={costs.target} projection/><h3>Automatic assumptions and limitations</h3>{[costs.automatic.basis,...costs.automatic.assumptions,...costs.automatic.limitations].map(item=><p key={item}>{item}</p>)}<h2>Source usage inputs</h2><dl>{([...(['logsGB','traceGB','metricGB','hosts','apmHosts','days'] as NumberKey[]),...(costs.automatic.rum.enabled?(vendor==='Datadog'?['rumSessions','rumMonthlyGB','rumKBPerSession','rumRate']:['cxRumMonthlyGB','cxRumMonthlyCost']) as NumberKey[]:[])]).map(k=><div key={k}><dt>{labels[k]}</dt><dd>{scenario[k]||'Unknown'}</dd></div>)}</dl></>}
        <OtelPrintReport settings={otelReady?otelSnapshot:null}/><h2>Sources</h2>{sources.map(s=><p key={s.id}>{s.title}: {s.url} (checked {s.checked})</p>)}</section>}
      <footer className="app-footer"><span>RTI Migration advisor · local-first</span><span>USD · sources checked {checked}</span></footer>
    </main></div>
  </div>;
}
