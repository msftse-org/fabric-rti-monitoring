import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, ChartArea, ChartLine, Plus, Trash2, X } from 'lucide-react';
import { formatDuration } from '@telemetry';
import { useApp } from '../lib/app';
import { PALETTES } from '../lib/palette';
import { AGGREGATORS, METRIC_TAGS, evaluateQuery, unitLabel, type Aggregator, type EvaluatedQuery, type MetricQuery } from '../lib/metricsModel';
import { minuteGrid } from '../lib/series';
import { compact } from '../lib/time';
import { useInert } from '../lib/toast';
import { Dropdown, Select } from '../components/Select';
import { Segmented } from '../components/ui';
import { TimeSeriesChart, type ChartMode, type ChartSeries } from '../components/charts/TimeSeriesChart';

const LETTERS = 'abcdefgh';

const DEFAULT_QUERIES: MetricQuery[] = [
  { id: 'a', metric: 'demo.requests', from: '', agg: 'sum', by: ['service'] },
  { id: 'b', metric: 'demo.request.duration', from: '', agg: 'avg', by: ['service'] },
];

const MODES: { value: ChartMode; label: string; icon: ReactNode }[] = [
  { value: 'line', label: 'Line', icon: <ChartLine size={13} /> },
  { value: 'bars', label: 'Bars', icon: <BarChart3 size={13} /> },
  { value: 'area', label: 'Area', icon: <ChartArea size={13} /> },
];

const formatFor = (unit: string) => (unit === 'ms' ? (value: number) => formatDuration(value) : (value: number) => compact(value));

function QueryRow({ query, metrics, removable, onChange, onRemove }: { query: MetricQuery; metrics: { name: string; description: string }[]; removable: boolean; onChange: (next: MetricQuery) => void; onRemove: () => void }) {
  const free = METRIC_TAGS.filter((tag) => !query.by.includes(tag));
  return (
    <div className="mx__query" role="group" aria-label={`Query ${query.id}`}>
      <span className="mx__badge" aria-hidden="true">
        {query.id}
      </span>
      <span className="mx__kw">Metric</span>
      <Select label={`Metric for query ${query.id}`} value={query.metric} options={metrics.map((metric) => ({ value: metric.name, label: metric.name }))} onChange={(metric) => onChange({ ...query, metric })} />
      <span className="mx__kw">from</span>
      <input className="input mx__from" aria-label={`Filter for query ${query.id}`} placeholder="everywhere, or e.g. service:checkout outcome:error" value={query.from} onChange={(event) => onChange({ ...query, from: event.target.value })} />
      <Select label={`Aggregation for query ${query.id}`} value={query.agg} options={AGGREGATORS.map((agg) => ({ value: agg, label: agg }))} onChange={(agg: Aggregator) => onChange({ ...query, agg })} />
      <span className="mx__kw">by</span>
      <span className="mx__tags">
        {query.by.map((tag) => (
          <span key={tag} className="mx__tag">
            {tag}
            <button type="button" aria-label={`Remove ${tag} grouping`} onClick={() => onChange({ ...query, by: query.by.filter((item) => item !== tag) })}>
              <X size={11} />
            </button>
          </span>
        ))}
        {free.length > 0 && (
          <Dropdown label={`Group query ${query.id} by`} triggerClassName="btn btn--icon mx__add" trigger={<Plus size={13} />}>
            {(close) =>
              free.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="menu__item"
                  onClick={() => {
                    onChange({ ...query, by: [...query.by, tag] });
                    close();
                  }}
                >
                  {tag}
                </button>
              ))
            }
          </Dropdown>
        )}
      </span>
      <span className="grow" />
      {removable && (
        <button type="button" className="icon-btn" aria-label={`Delete query ${query.id}`} onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export function MetricsPage() {
  const data = useApp();
  const inert = useInert();
  const [queries, setQueries] = useState<MetricQuery[]>(DEFAULT_QUERIES);
  const [mode, setMode] = useState<ChartMode>('line');
  const [palette, setPalette] = useState('classic');

  const grid = useMemo(() => minuteGrid(data), [data]);
  const pods = useMemo(() => Object.fromEntries(data.stats.map((stat) => [stat.name, stat.pods[0] ?? ''])), [data.stats]);
  const evaluated = useMemo<EvaluatedQuery[]>(() => queries.map((query) => evaluateQuery(query, data.metrics, grid, pods)), [queries, data.metrics, grid, pods]);

  const colors = PALETTES[palette];
  const groups = useMemo(() => {
    const byUnit = new Map<string, { query: EvaluatedQuery; series: ChartSeries[] }[]>();
    let index = 0;
    for (const result of evaluated) {
      const series = result.series.map<ChartSeries>((entry) => ({ key: `${result.query.id}:${entry.key}`, label: `${evaluated.length > 1 ? `${result.query.id} · ` : ''}${entry.label}`, color: colors[index++ % colors.length], values: entry.values }));
      const list = byUnit.get(result.unit) ?? [];
      list.push({ query: result, series });
      byUnit.set(result.unit, list);
    }
    return [...byUnit.entries()];
  }, [evaluated, colors]);

  const update = (next: MetricQuery) => setQueries((current) => current.map((query) => (query.id === next.id ? next : query)));
  const addQuery = () =>
    setQueries((current) => {
      const id = [...LETTERS].find((letter) => !current.some((query) => query.id === letter));
      return id ? [...current, { id, metric: data.metrics[0]?.name ?? '', from: '', agg: 'sum', by: [] }] : current;
    });

  return (
    <div className="mx">
      <div className="mx__panel">
        <h2 className="mx__heading">Graph</h2>
        {queries.map((query) => (
          <QueryRow key={query.id} query={query} metrics={data.metrics} removable={queries.length > 1} onChange={update} onRemove={() => setQueries((current) => current.filter((item) => item.id !== query.id))} />
        ))}
        {evaluated.map((result) => result.error && <div key={result.query.id} className="mx__error" role="alert">{`Query ${result.query.id}: ${result.error}`}</div>)}
        <div className="mx__actions">
          <button type="button" className="btn" onClick={addQuery} disabled={queries.length >= LETTERS.length}>
            <Plus size={14} /> Add Query
          </button>
          <button type="button" className="btn" onClick={inert}>
            <Plus size={14} /> Add Formula
          </button>
          <span className="grow" />
          <Segmented label="Display as" value={mode} options={MODES} onChange={setMode} />
          <Select label="Palette" prefix="Palette:" value={palette} options={Object.keys(PALETTES).map((name) => ({ value: name, label: name }))} onChange={setPalette} align="right" />
        </div>
      </div>
      <div className="mx__graphs">
        {groups.map(([unit, entries]) => {
          const series = entries.flatMap((entry) => entry.series);
          const format = formatFor(unit);
          return (
            <section key={unit} className="mx__graph">
              <header className="mx__graph-head">
                <b>{entries.map((entry) => `${entry.query.query.agg}:${entry.query.query.metric}`).join(', ') || 'No metric'}</b>
                <span className="muted"> · {unitLabel(unit) || 'no unit'} · 1 minute resolution</span>
              </header>
              <TimeSeriesChart grid={grid} series={series} mode={mode} height={230} yFormat={format} valueFormat={format} ariaLabel={`Metrics graph in ${unitLabel(unit)}`} />
              <div className="scroll-x">
                <table className="table mx__legend">
                  <thead>
                    <tr>
                      <th>Tags</th>
                      <th className="num">Avg</th>
                      <th className="num">Min</th>
                      <th className="num">Max</th>
                      <th className="num">Sum</th>
                      <th className="num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.flatMap((entry) =>
                      entry.query.series.map((row, i) => {
                        const swatch = entry.series[i];
                        return (
                          <tr key={swatch.key}>
                            <td>
                              <span className="service-dot" style={{ background: swatch.color }} /> <span className="mono">{swatch.label}</span>
                            </td>
                            <td className="num">{format(row.avg)}</td>
                            <td className="num">{format(row.min)}</td>
                            <td className="num">{format(row.max)}</td>
                            <td className="num">{format(row.sum)}</td>
                            <td className="num">{format(row.last)}</td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {!groups.length && <p className="muted">Choose a metric to start graphing.</p>}
      </div>
    </div>
  );
}
