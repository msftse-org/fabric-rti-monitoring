import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, WrapText, X } from 'lucide-react';
import { formatCount, formatDuration, formatStamp, type LogEntry } from '@telemetry';
import { Chart, Legend } from '../components/Chart';
import { DetailPanel, type DetailField } from '../components/DetailPanel';
import { FacetSidebar } from '../components/FacetSidebar';
import { FilterActions } from '../components/FilterActions';
import { FilterBar, type SuggestField } from '../components/FilterBar';
import { EmptyState } from '../components/States';
import { useView } from '../lib/data';
import { addToken, buildGroups, filterItems, onlyFacet, tokenize, toggleFacet, type FacetDef } from '../lib/facets';
import { logFieldResolver, logText } from '../lib/fields';
import { logHistogram } from '../lib/histogram';
import { useMediaQuery } from '../lib/hooks';
import { SEVERITY_COLOR } from '../lib/palette';
import { href, useSyncParams } from '../lib/router';

const PAGE_SIZE = 200;

const logFacets = (environment: string): FacetDef<LogEntry>[] => [
  { id: 'level', label: 'Level', keys: ['level', 'severity'], value: (log) => log.severity, color: (value) => SEVERITY_COLOR[value as LogEntry['severity']] },
  { id: 'format', label: 'Format', keys: ['format'], value: () => 'otel' },
  { id: 'environment', label: 'Environment', keys: ['environment', 'env'], value: () => environment },
  { id: 'host', label: 'Host', keys: ['host', 'node'], value: (log) => log.node, searchable: true },
  { id: 'workload', label: 'Workload', keys: ['workload', 'service'], value: (log) => log.service, searchable: true },
  { id: 'pod', label: 'Pod', keys: ['pod', 'instance'], value: (log) => log.pod, searchable: true, collapsed: true },
  { id: 'version', label: 'Version', keys: ['version'], value: (log) => log.version, collapsed: true },
  { id: 'scenario', label: 'Scenario', keys: ['scenario'], value: (log) => log.scenario, collapsed: true },
  { id: 'outcome', label: 'Outcome', keys: ['outcome'], value: (log) => log.outcome, collapsed: true },
];

const distinct = (values: string[]) => [...new Set(values)].sort();

export function LogsPage({ initialQuery }: { initialQuery: string }) {
  const view = useView();
  const env = view.bundle.environment;
  const mobile = useMediaQuery('(max-width: 900px)');
  const [tokens, setTokens] = useState(() => tokenize(initialQuery));
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [facetsOpen, setFacetsOpen] = useState(!mobile);
  const [wrap, setWrap] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const tableRef = useRef<HTMLTableSectionElement>(null);
  useSyncParams('logs', { q: tokens.join(' ') });

  useEffect(() => setLimit(PAGE_SIZE), [tokens, range]);

  const resolve = useMemo(() => logFieldResolver(env), [env]);
  const facetDefs = useMemo(() => logFacets(env.environment), [env.environment]);

  const scoped = useMemo(
    () => (range ? view.logs.filter((log) => Date.parse(log.ts) >= range.from && Date.parse(log.ts) < range.to) : view.logs),
    [view.logs, range],
  );
  const filtered = useMemo(() => filterItems(scoped, tokens, resolve, logText), [scoped, tokens, resolve]);
  const groups = useMemo(() => buildGroups(scoped, facetDefs, tokens, resolve, logText), [scoped, facetDefs, tokens, resolve]);
  const histogram = useMemo(() => {
    const matching = filterItems(view.logs, tokens, resolve, logText);
    const first = view.logs.length ? Date.parse(view.logs[view.logs.length - 1].ts) : view.since;
    return logHistogram(matching, Math.max(view.since, first), view.newest);
  }, [view, tokens, resolve]);

  const fields = useMemo<SuggestField[]>(
    () => [
      { key: 'level', values: distinct(view.logs.map((log) => log.severity)) },
      { key: 'workload', values: distinct(view.logs.map((log) => log.service)) },
      { key: 'pod', values: distinct(view.logs.map((log) => log.pod)) },
      { key: 'host', values: distinct(view.logs.map((log) => log.node)) },
      { key: 'version', values: distinct(view.logs.map((log) => log.version)) },
      { key: 'scenario', values: distinct(view.logs.map((log) => log.scenario)) },
      { key: 'outcome', values: distinct(view.logs.map((log) => log.outcome)) },
      { key: 'resource', values: distinct(view.logs.map((log) => log.spanName).filter(Boolean)) },
      { key: 'format', values: ['otel'] },
      { key: 'environment', values: [env.environment] },
      { key: 'cluster', values: [env.cluster] },
      { key: 'namespace', values: [env.namespace] },
      { key: 'trace_id', values: [] },
      { key: 'span_id', values: [] },
    ],
    [view.logs, env],
  );

  const visible = filtered.slice(0, limit);
  const selected = filtered.find((log) => log.id === selectedId) ?? null;

  const moveSelection = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = visible.findIndex((log) => log.id === selectedId);
    const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    setSelectedId(next.id);
    tableRef.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  };

  const detailFields = (log: LogEntry): DetailField[] => [
    { label: 'Message', value: log.body },
    { label: 'Timestamp', value: log.ts, display: formatStamp(log.ts) },
    { label: 'Level', value: log.severity, filterKey: 'level', display: <span className="lvl" style={{ color: SEVERITY_COLOR[log.severity] }}>{log.severity}</span> },
    { label: 'Workload', value: log.service, filterKey: 'workload' },
    { label: 'Pod', value: log.pod, filterKey: 'pod' },
    { label: 'Host', value: log.node, filterKey: 'host' },
    { label: 'Version', value: log.version, filterKey: 'version' },
    { label: 'Scenario', value: log.scenario, filterKey: 'scenario' },
    { label: 'Outcome', value: log.outcome, filterKey: 'outcome' },
    { label: 'Resource', value: log.spanName || '(none)', filterKey: log.spanName ? 'resource' : undefined },
    { label: 'Span duration', value: log.durationMs === null ? '–' : formatDuration(log.durationMs) },
    { label: 'trace_id', value: log.traceId, filterKey: 'trace_id', display: <span className="mono">{log.traceId}</span> },
    { label: 'span_id', value: log.spanId, filterKey: 'span_id', display: <span className="mono">{log.spanId}</span> },
    { label: 'run_id', value: log.runId, display: <span className="mono">{log.runId}</span> },
    { label: 'Environment', value: env.environment, filterKey: 'environment' },
    { label: 'Cluster', value: env.cluster, filterKey: 'cluster' },
    { label: 'Namespace', value: env.namespace, filterKey: 'namespace' },
    { label: 'Format', value: 'otel', filterKey: 'format' },
  ];

  const traceKnown = selected ? Boolean(view.bundle.spans[selected.traceId]) : false;
  const sampled = view.fullCoverage && view.bundle.totals.logs > view.bundle.logs.length;

  return (
    <div className="page page--logs">
      <FilterBar
        tokens={tokens}
        onChange={setTokens}
        fields={fields}
        label="Filter logs"
        placeholder="Type / to filter by levels, formats, pods and more"
        actions={<FilterActions />}
      />
      <section className="card histogram">
        <div className="histogram__head">
          <span className="histogram__title">{filtered.length.toLocaleString('en-US')} logs</span>
          <Legend items={histogram.series} />
          <div className="card__spacer" />
          {range ? (
            <button type="button" className="chip-btn chip-btn--accent" onClick={() => setRange(null)}>
              {formatStamp(new Date(range.from).toISOString(), false)} → {formatStamp(new Date(range.to).toISOString(), false)}
              <X size={12} aria-hidden="true" />
            </button>
          ) : (
            <span className="muted">Drag across the chart to zoom</span>
          )}
        </div>
        <Chart
          axis={histogram.axis}
          step={histogram.step}
          series={histogram.series}
          kind="bar"
          stacked
          height={92}
          label="Logs over time by level"
          compact
          onBrush={(from, to) => setRange({ from, to })}
        />
      </section>
      <div className={`explorer${facetsOpen ? '' : ' explorer--closed'}`}>
        {facetsOpen && (
          <>
            {mobile && <div className="scrim" onClick={() => setFacetsOpen(false)} aria-hidden="true" />}
            <div className={`explorer__facets${mobile ? ' explorer__facets--drawer' : ''}`}>
              <FacetSidebar
                groups={groups}
                matched={filtered.length}
                noun="results"
                onToggle={(group, value) => setTokens(toggleFacet(tokens, group, value))}
                onOnly={(group, value) => setTokens(onlyFacet(tokens, group, value))}
              />
            </div>
          </>
        )}
        <div className="explorer__main">
          <div className="explorer__toolbar">
            <button type="button" className="btn btn--ghost" aria-expanded={facetsOpen} onClick={() => setFacetsOpen((open) => !open)}>
              {facetsOpen ? <ChevronLeft size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {facetsOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            <div className="card__spacer" />
            <label className="switch">
              <input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />
              <WrapText size={14} aria-hidden="true" />
              Text Wrap
            </label>
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No logs match" action={<button type="button" className="btn" onClick={() => { setTokens([]); setRange(null); }}>Clear filters</button>}>
              Nothing in this time range matches the current filters.
            </EmptyState>
          ) : (
            <div className="table-scroll explorer__table">
              <table className={`table table--logs${wrap ? ' table--wrap' : ''}`}>
                <thead>
                  <tr>
                    <th className="logrow__level" aria-label="Level" />
                    <th>timestamp ↓</th>
                    <th>instance</th>
                    <th>Log</th>
                  </tr>
                </thead>
                <tbody ref={tableRef} onKeyDown={moveSelection}>
                  {visible.map((log) => (
                    <tr
                      key={log.id}
                      data-id={log.id}
                      className="row--link"
                      aria-selected={log.id === selectedId}
                      tabIndex={0}
                      onClick={() => setSelectedId(log.id === selectedId ? null : log.id)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(log.id); } }}
                    >
                      <td className="logrow__level"><i style={{ background: SEVERITY_COLOR[log.severity] }} title={log.severity} /></td>
                      <td className="mono nowrap">{formatStamp(log.ts)}</td>
                      <td className="mono muted nowrap">{log.pod}</td>
                      <td className="mono logrow__msg">
                        <span>{log.body}</span>{' '}
                        <span className="kv"><i>workload</i>={log.service}</span>{' '}
                        <span className="kv"><i>scenario</i>={log.scenario}</span>{' '}
                        <span className="kv"><i>outcome</i>={log.outcome}</span>
                        {log.spanName && <>{' '}<span className="kv"><i>resource</i>={log.spanName}</span></>}
                        {log.durationMs !== null && <>{' '}<span className="kv"><i>duration</i>={formatDuration(log.durationMs)}</span></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-foot">
                <span className="muted">
                  Showing {formatCount(visible.length)} of {filtered.length.toLocaleString('en-US')}
                  {sampled && ` · the bundle keeps the newest ${view.bundle.logs.length.toLocaleString('en-US')} of ${view.bundle.totals.logs.toLocaleString('en-US')} log lines`}
                </span>
                {visible.length < filtered.length && (
                  <button type="button" className="btn" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Load more</button>
                )}
              </div>
            </div>
          )}
        </div>
        {selected && (
          <DetailPanel
            title="Log"
            subtitle={<span className="muted">{selected.service} · {formatStamp(selected.ts)}</span>}
            fields={detailFields(selected)}
            onClose={() => setSelectedId(null)}
            onFilter={(key, value, negate) => setTokens(addToken(tokens, key, value, negate))}
            actions={
              traceKnown ? (
                <a className="btn btn--primary" href={href(`traces/${selected.traceId}`, { span: selected.spanId })}>Open trace</a>
              ) : (
                <button type="button" className="btn" disabled title="This trace is not in the sampled traces held by the bundle">Open trace</button>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
