import { features, featuresForVendor, restorePlan, validPlan } from './catalog.ts';
import type { Vendor, Plan } from './catalog.ts';
import { defaultScenario, validateScenario, calculate } from './model.ts';
import type { Scenario } from './model.ts';
import { checked, sources } from './sources.ts';
import { defaultOtel, restoreOtel } from './otel.ts';
import type { OtelSettings } from './otel.ts';
import { compareTotals, defaultComparison, restoreComparison, validateComparison } from './comparison.ts';
import type { CostComparison } from './comparison.ts';
import { calculateAutomatic, normalizedAutomaticScenario, validateAutomaticScenario } from './automaticTarget.ts';
function restoreComparisonDraft(value: unknown): CostComparison {
  if(!value || typeof value!=='object' || Array.isArray(value)) return restoreComparison(value);
  const draft=value as Record<string,unknown>;
  for(const key of ['sourceMonthly','targetMonthly']) {
    if(typeof draft[key]!=='string' || draft[key].length>100) throw new Error('Invalid comparison amount.');
  }
  // Draft strings are not results. Keep an invalid edit restorable without blocking
  // an unrelated module; the strict model validates every submitted comparison.
  const schema=restoreComparison({...draft,sourceMonthly:'',targetMonthly:''});
  return {...schema,sourceMonthly:draft.sourceMonthly as string,targetMonthly:draft.targetMonthly as string};
}
export function exportDocument(vendor:Vendor,plan:Plan,scenario:Scenario,otel:OtelSettings=defaultOtel(),comparison:CostComparison=defaultComparison()) {
  const automatic = comparison.method === 'usage';
  if(!validPlan(plan) || Object.keys(automatic ? validateAutomaticScenario(scenario,vendor) : validateScenario(scenario,vendor)).length) throw new Error('Correct the plan and scenario before export.');
  const savedScenario = automatic ? normalizedAutomaticScenario(scenario) : scenario;
  const projection=automatic ? calculateAutomatic(savedScenario,vendor) : null;
  const calculation=projection ?? calculate(scenario,vendor);
  const source=vendor==='Datadog'?calculation.datadog:calculation.coralogix;
  const complete=source.complete&&calculation.target.complete;
  const comparisonResult=comparison.method==='totals'
    ? Object.keys(validateComparison(comparison)).length?null:compareTotals(comparison)
    : {source:source.total,target:calculation.target.complete?calculation.target.total:null,difference:complete?source.total-calculation.target.total:null,complete,indicative:true,
      basis:'Automatic planning projection from source usage, not a sizing guarantee or quote; source quote omissions remain unknown.',
      targetRange:projection ? {lowerMonthly:projection.automatic.lowerMonthly,upperMonthly:projection.automatic.upperMonthly} : null};
  return {version:1,kind:'manual-observability-plan',created:new Date().toISOString(),vendor,plan,scenario:savedScenario,otel:restoreOtel(otel),comparison:{...comparison},comparisonResult,pricingChecked:checked,
    scope:'Manual planning only; not executable migration or a pricing quote. Unpriced specialists and equivalence gaps must be reconciled.',
    mappings:featuresForVendor(vendor).map(f=>({
      id:f.id, category:f.category, name:f.name, status:f.status, targets:f.targets,
      rationale:f.rationale, shipment:f.shipment, sources:f.sources,
      capability:f.capabilities[vendor], choice:plan[f.id],
    })), calculation,sources};
}
export function restoreDocument(text:string):{vendor:Vendor;plan:Plan;scenario:Scenario;otel:OtelSettings;comparison:CostComparison} {
  if(text.length>1e6) throw new Error('File is too large; choose a planner JSON file under 1 MB.');
  const d=JSON.parse(text);
  const plan=restorePlan(d.plan);
  if(d.version!==1 || d.kind!=='manual-observability-plan' || !['Datadog','Coralogix'].includes(d.vendor) || !plan) throw new Error('Unsupported or invalid plan file (version 1 required).');
  const defaults=defaultScenario();
  // Version 1 predates the bill override and RUM inputs. Only these known
  // additions receive defaults; unknown properties and malformed values still fail.
  if(d.scenario && typeof d.scenario==='object' && !Array.isArray(d.scenario)) {
    for(const key of ['ddContract','rumMonthlyGB','rumKBPerSession','cxRum','cxRumMonthlyGB','cxRumMonthlyCost','rumSharedEventHub'] as const)
      if(!Object.hasOwn(d.scenario,key)) d.scenario[key]=defaults[key];
  }
  if(!d.scenario || Object.keys(d.scenario).length!==Object.keys(defaults).length) throw new Error('Scenario schema does not match this version.');
  for(const [key,value] of Object.entries(defaults)) {
    if(typeof d.scenario[key]!==typeof value) throw new Error('Invalid scenario value.');
  }
  const choices = {term:['annual','monthly','demand'],infraTier:['pro','enterprise'],apmTier:['standard','pro','enterprise'],retention:['3','7','15','30'],fabricMode:['allocated','incremental'],fabricSKU:['F2','F4','F8','F16','F32','F64','F128','F256','F512','F1024','custom'],grafanaSize:['X1','X2'],runtime:['collector','aks']};
  for(const [key,allowed] of Object.entries(choices)) if(!allowed.includes(d.scenario[key])) throw new Error('Invalid scenario option.');
  if(!d.scenario.region.trim() || d.scenario.region.length>100) throw new Error('Region must be 1–100 characters.');
  const comparison=Object.hasOwn(d,'comparison')?restoreComparisonDraft(d.comparison):defaultComparison();
  if(Object.keys(comparison.method==='usage'?validateAutomaticScenario(d.scenario,d.vendor):validateScenario(d.scenario,d.vendor)).length) throw new Error('The file contains invalid numbers. Correct them in the original scenario.');
  return {vendor:d.vendor,plan:Object.fromEntries(features.map(f=>[f.id,{...plan[f.id]}])),scenario:comparison.method==='usage'?normalizedAutomaticScenario(d.scenario):{...d.scenario},otel:Object.hasOwn(d,'otel')?restoreOtel(d.otel):defaultOtel(),comparison};
}
