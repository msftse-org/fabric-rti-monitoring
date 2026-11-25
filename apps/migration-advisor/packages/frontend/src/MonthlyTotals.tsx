import { compareTotals } from './comparison';
import type { CostComparison } from './comparison';
import type { Vendor } from './catalog';

const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd = (value: number) => formatter.format(value);
export function MonthlyTotalInputs({ comparison, vendor, errors, onChange }: {
  comparison: CostComparison; vendor: Vendor;
  errors: Partial<Record<'sourceMonthly' | 'targetMonthly', string>>;
  onChange: (key: 'sourceMonthly' | 'targetMonthly', value: string) => void;
}) {
  return <>
    <p className="flow-help">Compare quoted or billed totals—not a GB-to-CUs estimate. Include comparable hosting, storage, Collector operations and notifications in both totals.</p>
    {(['sourceMonthly', 'targetMonthly'] as const).map(key => <label className="field quick-total" key={key} htmlFor={`comparison-${key}`}>
      <span>{key === 'sourceMonthly' ? `Current ${vendor} monthly bill (USD)` : 'Proposed Azure + Fabric monthly total (USD)'}</span>
      <input id={`comparison-${key}`} inputMode="decimal" value={comparison[key]} placeholder="Enter monthly total"
        aria-invalid={!!errors[key]} aria-describedby={`comparison-${key}-help${errors[key] ? ` comparison-${key}-error` : ''}`}
        onChange={event => onChange(key, event.target.value)} />
      <small id={`comparison-${key}-help`}>Blank means unknown. Enter 0 only for a confirmed zero cost.</small>
      {errors[key] && <small className="field-error" id={`comparison-${key}-error`}>{errors[key]}</small>}
    </label>)}
  </>;
}
export function MonthlyTotalsResult({ comparison, vendor }: { comparison: CostComparison; vendor: Vendor }) {
  const result = compareTotals(comparison);
  return <section aria-label="Monthly totals comparison">
    <div className="reconciliation-result"><strong>{result.difference === 0 ? 'Same proposed monthly cost' : `${usd(Math.abs(result.difference))} ${result.difference > 0 ? 'lower' : 'higher'} proposed monthly cost`}</strong>
      <p>{result.basis}</p></div>
    <dl className="totals-summary">
      <div><dt>Current {vendor}</dt><dd>{usd(result.source)} / month</dd></div>
      <div><dt>Proposed Azure + Fabric</dt><dd>{usd(result.target)} / month</dd></div>
      <div><dt>Monthly difference</dt><dd>{usd(result.difference)}{result.percent !== null ? ` (${result.percent.toFixed(1)}%)` : ' · percentage unavailable for a zero source bill'}</dd></div>
      <div><dt>Annualized difference</dt><dd>{usd(result.annualDifference)} · monthly × 12, not an annual quote</dd></div>
    </dl>
    <p className="warning"><strong>Match the scope before deciding.</strong> Totals are customer-entered, not independently verified savings. Use the same billing period and coverage; include specialists, support and operating costs. Fabric capacity and headroom must be sized separately.</p>
  </section>;
}
