import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Line, Stack } from './model';

type Money = (n: number) => string;

const fabricGroups: Record<string, string> = {
  fabric: 'Fabric capacity',
  storage: 'OneLake storage',
  grafana: 'Grafana hosting',
  users: 'Grafana users',
  runtime: 'OTel Collector',
  'rum-fabric': 'Browser capacity increment',
  'rum-storage': 'Browser OneLake storage',
  'rum-appinsights': 'Application Insights',
  'rum-eventhubs': 'Event Hubs throughput',
};

export function breakdownParts(lines: Line[], fabric = false) {
  const priced = lines.filter(line => (line.amount ?? 0) > 0);
  const total = priced.reduce((sum, line) => sum + (line.amount ?? 0), 0);
  return priced.map((line, index) => ({
    id: line.id,
    label: fabric ? fabricGroups[line.id] ?? line.label : line.label,
    amount: line.amount ?? 0,
    share: total > 0 ? (line.amount ?? 0) / total : 0,
    series: index % 6,
  }));
}

export function BreakdownBar({ lines, money, label, fabric = false }: { lines: Line[]; money: Money; label: string; fabric?: boolean }) {
  const parts = breakdownParts(lines, fabric);
  if (parts.length === 0) return null;
  return <figure className="breakdown" aria-label={label}>
    <div className="breakdown-bar" aria-hidden="true">
      {parts.map(part => <span key={part.id} data-series={part.series} style={{ flexGrow: part.share }} />)}
    </div>
    <figcaption>
      <ul className="breakdown-legend">
        {parts.map(part => <li key={part.id}><i data-series={part.series} aria-hidden="true" /><span>{part.label}</span><strong>{money(part.amount)}</strong><small>{part.share > 0 && part.share < .01 ? '<1' : Math.round(part.share * 100)}%</small></li>)}
      </ul>
    </figcaption>
  </figure>;
}

type Tone = 'saving' | 'cost' | 'pending';

export function savingsMessage(vendor: string, source: Stack, target: Stack, money: Money): { tone: Tone; eyebrow: string; headline: string; detail: string } {
  if (!target.complete) return { tone: 'pending', eyebrow: 'Savings pending', headline: 'Pilot sizing required', detail: target.lines.some(line => line.id === 'rum-eventhubs' && line.amount === null) ? 'The Event Hubs design requires separate sizing and pricing, so no savings figure is calculated.' : 'This workload is outside the supported Fabric reference range, so no savings figure is calculated.' };
  const difference = source.total - target.total;
  if (!source.complete) {
    const eyebrow = `Savings pending · ${source.missing} ${vendor} ${source.missing === 1 ? 'rate' : 'rates'} missing`;
    // Unknown source meters are non-negative, so a positive known gap is a floor on savings.
    return difference > 0
      ? { tone: 'saving', eyebrow, headline: `At least ${money(difference)}`, detail: `Your known ${vendor} subtotal already exceeds the Fabric reference. Missing rates can only increase this saving.` }
      : { tone: 'pending', eyebrow, headline: 'Add missing rates', detail: `Enter the missing ${vendor} rates to compare full monthly totals.` };
  }
  if (difference <= 0) return { tone: 'cost', eyebrow: 'No savings in this estimate', headline: `+${money(-difference)}`, detail: `The Fabric reference is ${money(-difference)} per month higher than your current ${vendor} estimate for these inputs.` };
  const percent = source.total > 0 ? Math.round(difference / source.total * 100) : 0;
  return { tone: 'saving', eyebrow: 'Estimated monthly savings', headline: money(difference), detail: `${percent}% lower than your current ${vendor} estimate · about ${money(difference * 12)} per year (monthly × 12).` };
}

function ComparisonBars({ vendor, source, target, money }: { vendor: string; source: Stack; target: Stack; money: Money }) {
  const max = Math.max(source.total, target.complete ? target.total : 0, 1);
  const fabricParts = breakdownParts(target.lines, true);
  return <dl className="savings-bars">
    <div>
      <dt>Today · {vendor}</dt>
      <dd><span className="bar-track"><span className="bar-fill source" style={{ inlineSize: `${source.total / max * 100}%` }} /></span><strong>{money(source.total)}{!source.complete && <small> known</small>}</strong></dd>
    </div>
    <div>
      <dt>With Fabric RTI</dt>
      <dd>{target.complete
        ? <><span className="bar-track"><span className="bar-fill fabric" style={{ inlineSize: `${target.total / max * 100}%` }}>{fabricParts.map(part => <span key={part.id} data-series={part.series} style={{ flexGrow: part.share }} />)}</span></span><strong>{money(target.total)}</strong></>
        : <strong>Pilot sizing required</strong>}</dd>
    </div>
  </dl>;
}

export function SavingsSummary({ vendor, source, target, lowerMonthly, money }: { vendor: string; source: Stack; target: Stack; lowerMonthly: number | null; money: Money }) {
  const { tone, eyebrow, headline, detail } = savingsMessage(vendor, source, target, money);
  const upside = tone === 'saving' && source.complete && lowerMonthly !== null && lowerMonthly < target.total ? source.total - lowerMonthly : null;
  const Icon = tone === 'cost' ? TrendingUp : TrendingDown;
  return <section className={`savings-hero ${tone}`} aria-label="Savings summary">
    <div className="savings-figure">
      <p className="savings-eyebrow"><Icon size={16} aria-hidden="true" />{eyebrow}</p>
      <p className="savings-amount">{headline}{tone !== 'pending' && <small>/ month</small>}</p>
      <p className="savings-detail">{detail}</p>
      {upside !== null && <p className="savings-upside">Up to <strong>{money(upside)}</strong> / month at lower query activity.</p>}
    </div>
    <ComparisonBars vendor={vendor} source={source} target={target} money={money} />
  </section>;
}
