import { ArrowLeft, X } from 'lucide-react';
import type { RefObject } from 'react';
import { parseInventoryCount } from './catalog';
import type { Choice, Feature, Vendor } from './catalog';
import { checked, sourceById } from './sources';

export function FeatureInspector({ feature, vendor, choice, onChange, onClose, headingRef }: {
  feature: Feature; vendor: Vendor; choice: Choice; onChange: (update: Partial<Choice>) => void; onClose: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const capability = feature.capabilities[vendor];
  return <aside className="inspector" id="feature-inspector" aria-label={`${feature.name} mapping detail`}>
    <header><button onClick={onClose}><ArrowLeft size={16}/>Back to feature map</button><button className="icon-button" aria-label="Close feature inspector" onClick={onClose}><X size={18}/></button></header>
    <h2 ref={headingRef} tabIndex={-1}>{feature.name}</h2><div className="inspector-disposition"><span className={`status ${feature.status.toLowerCase()}`}>{feature.status}</span><span>{feature.category}</span></div>
    <p><strong>{capability.support}</strong> · {capability.description}</p>
    <p>{feature.rationale}</p>
    <label className="check"><input type="checkbox" checked={choice.needed} onChange={e=>onChange({needed:e.target.checked})}/>Include in migration scope</label>
    <div className="field-grid">
      <label className="field"><span>Inventory count</span><input type="number" min="0" max="1000000" step="1" value={choice.count} onChange={e=>{
        const count=parseInventoryCount(e.target.value);
        if(count!==null)onChange({count});
      }}/></label>
      <label className="field"><span>Priority</span><select value={choice.priority} onChange={e=>onChange({priority:e.target.value as Choice['priority']})}>{['Must','Should','Could'].map(p=><option key={p}>{p}</option>)}</select></label>
    </div>
    <fieldset className="targets"><legend>Proposed target option</legend>{feature.targets.map(target=><label key={target}><input type="radio" name="target-option" checked={choice.target===target} onChange={()=>onChange({target})}/><span>{target}</span></label>)}</fieldset>
    <h3>Repository readiness</h3><p>{feature.shipment}. Validate in your environment before approving this change.</p>
    <h3>Source capability evidence</h3><ul className="evidence">{capability.evidence.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{vendor}: {capability.name}</a><small>Reviewed {source.reviewed}</small></li>)}</ul>
    <h3>Migration & target evidence</h3><ul className="evidence">{feature.sources.map(id=><li key={id}><a href={sourceById(id)?.url} target="_blank" rel="noreferrer">{sourceById(id)?.title}</a><small>Checked {checked}</small></li>)}</ul>
  </aside>;
}
