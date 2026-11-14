import { useMemo, useState } from 'react';
import { formatDuration, formatCount } from '@telemetry';
import { Segmented } from '../components/Badges';
import { Card } from '../components/Card';
import { Chart, Legend } from '../components/Chart';
import { FilterBar, type SuggestField } from '../components/FilterBar';
import { EmptyState } from '../components/States';
import { useView } from '../lib/data';
import { tokenize } from '../lib/facets';
import {
  AGG_LABEL,
  aggregationsFor,
  defaultAggregation,
  GROUP_LABEL,
  runMetricQuery,
  type Aggregation,
  type GroupBy,
} from '../lib/metrics';
import { useSyncParams, type Route } from '../lib/router';

type ChartKind = 'line' | 'area' | 'bar';
const DISPLAYS = [
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'bar', label: 'Bar' },
] as const;

const isGroupBy = (value: string | null): value is GroupBy => value === 'none' || value === 'service' || value === 'scenario' || value === 'outcome';
const isChartKind = (value: string | null): value is ChartKind => value === 'line' || value === 'area' || value === 'bar';

export function MetricsPage({ route }: { route: Route }) {
  const view = useView();
  const first = view.metrics[0];
  const [metricName, setMetricName] = useState(() => {
    const requested = route.params.get('metric');
    return view.metrics.some((series) => series.name === requested) ? (requested as string) : (first?.name ?? '');
  });
  const metric = view.metrics.find((series) => series.name === metricName);
  const allowed = aggregationsFor(metric);
  const [agg, setAgg] = useState<Aggregation>(() => {
    const requested = route.params.get('agg') as Aggregation | null;
    return requested && allowed.includes(requested) ? requested : defaultAggregation(metric);
  });
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const requested = route.params.get('by');
    return isGroupBy(requested) ? requested : 'service';
  });
  const [display, setDisplay] = useState<ChartKind>(() => {
    const requested = route.params.get('chart');
    return isChartKind(requested) ? requested : 'line';
  });
  const [tokens, setTokens] = useState(() => tokenize(route.params.get('q') ?? ''));
  useSyncParams('metrics', { metric: metricName, agg, by: groupBy, chart: display, q: tokens.join(' ') });

  const result = useMemo(() => runMetricQuery(view, { metric: metricName, agg, groupBy, tokens }), [view, metricName, agg, groupBy, tokens]);
  const fields = useMemo<SuggestField[]>(() => {
    const points = view.metrics.flatMap((series) => series.points);
    const distinct = (pick: (point: (typeof points)[number]) => string) => [...new Set(points.map(pick))].sort();
    return [
      { key: 'workload', values: distinct((point) => point.service) },
      { key: 'scenario', values: distinct((point) => point.scenario) },
      { key: 'outcome', values: distinct((point) => point.outcome) },
    ];
  }, [view.metrics]);

  if (!metric) {
    return <div className="page"><EmptyState title="No metrics in this time range">The telemetry bundle holds no metric points for the selected window.</EmptyState></div>;
  }

  const isDuration = metric.unit === 'ms';
  const formatValue = isDuration ? formatDuration : formatCount;
  const step = 60_000;

  const changeMetric = (name: string) => {
    const next = view.metrics.find((series) => series.name === name);
    setMetricName(name);
    if (!aggregationsFor(next).includes(agg)) setAgg(defaultAggregation(next));
  };

  return (
    <div className="page">
      <section className="card metric-builder">
        <div className="card__head card__head--tight">
          <h2 className="card__title card__title--sm">Metrics Explorer</h2>
          <span className="tag">Type: Time Series</span>
          <div className="card__spacer" />
          <Segmented options={DISPLAYS} value={display} onChange={setDisplay} label="Display type" />
        </div>
        <div className="query-row">
          <span className="query-row__letter" aria-hidden="true">A</span>
          <label className="query-row__field">
            <span>Metrics</span>
            <select className="select select--mono" value={metricName} onChange={(event) => changeMetric(event.target.value)} aria-label="Metric">
              {view.metrics.map((series) => <option key={series.name} value={series.name}>{series.name}</option>)}
            </select>
          </label>
          <label className="query-row__field">
            <span>Aggregation</span>
            <select className="select" value={agg} onChange={(event) => setAgg(event.target.value as Aggregation)} aria-label="Aggregation">
              {allowed.map((option) => <option key={option} value={option}>{AGG_LABEL[option]}</option>)}
            </select>
          </label>
          <label className="query-row__field">
            <span>Group by</span>
            <select className="select" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)} aria-label="Group by">
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((option) => <option key={option} value={option}>{GROUP_LABEL[option]}</option>)}
            </select>
          </label>
        </div>
        <FilterBar tokens={tokens} onChange={setTokens} fields={fields} label="Filter metric" placeholder="Type / to filter by workload, scenario, outcome" />
        <p className="muted metric-builder__note">{metric.description || metric.name} · unit {metric.unit || 'count'} · 1-minute points · only request counts and durations exist in this mock, there are no CPU or memory metrics.</p>
      </section>
      <Card title={`${AGG_LABEL[agg]}(${metric.name})${groupBy === 'none' ? '' : ` by ${GROUP_LABEL[groupBy]}`}`} right={<Legend items={result.series} max={8} />}>
        {result.series.length === 0 ? (
          <EmptyState title="No data for this query">Nothing matches the current filters in this time range.</EmptyState>
        ) : (
          <Chart
            axis={view.minuteAxis}
            step={step}
            series={result.series}
            kind={display}
            stacked={display === 'bar' && metric.aggregation === 'sum' && agg === 'sum'}
            height={280}
            label={`${metric.name} over time`}
            formatValue={formatValue}
            formatTick={formatValue}
          />
        )}
      </Card>
      {result.series.length > 0 && (
        <Card title="Series">
          <div className="table-scroll">
            <table className="table table--compact">
              <thead><tr><th>{groupBy === 'none' ? 'Series' : GROUP_LABEL[groupBy]}</th><th className="num">Min</th><th className="num">Avg</th><th className="num">Max</th><th className="num">Last</th></tr></thead>
              <tbody>
                {result.series.map((series) => (
                  <tr key={series.id}>
                    <td><span className="wl-name"><i style={{ background: series.color }} aria-hidden="true" />{series.label}</span></td>
                    <td className="num">{formatValue(series.stats.min)}</td>
                    <td className="num">{formatValue(series.stats.avg)}</td>
                    <td className="num">{formatValue(series.stats.max)}</td>
                    <td className="num">{formatValue(series.stats.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
