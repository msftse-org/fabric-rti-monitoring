import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { formatDuration, formatStamp, type TraceSpan, type TraceSummary } from '@telemetry';
import { StatusCode, Segmented } from '../components/Badges';
import { Chart, Legend } from '../components/Chart';
import { FacetSidebar } from '../components/FacetSidebar';
import { FilterActions } from '../components/FilterActions';
import { FilterBar, type SuggestField } from '../components/FilterBar';
import { EmptyState } from '../components/States';
import { useView } from '../lib/data';
import { buildGroups, filterItems, onlyFacet, tokenize, toggleFacet, type FacetDef } from '../lib/facets';
import { derivedStatusCode, spanFieldResolver, spanText, traceFieldResolver, traceText, type SpanRow } from '../lib/fields';
import { useMediaQuery } from '../lib/hooks';
import { navigate, useSyncParams } from '../lib/router';
import { buildTraceCharts, type TimedRow } from '../lib/traceCharts';
import { workloadColor } from '../lib/palette';

const PAGE_SIZE = 200;
type Mode = 'span' | 'trace';
const MODES = [
  { id: 'span', label: 'Span View' },
  { id: 'trace', label: 'Trace View' },
] as const;

const statusFacet = {
  id: 'status',
  label: 'Status Code',
  keys: ['status_code', 'statuscode', 'code'],
  display: (value: string) => (value === '500' ? '500 - Error' : '200 - OK'),
  color: (value: string) => (value === '500' ? '#e0382f' : '#1f9d63'),
};

const spanFacets: FacetDef<SpanRow>[] = [
  { ...statusFacet, value: ({ span }) => String(derivedStatusCode(span.status).code) },
  { id: 'workload', label: 'Workload', keys: ['workload', 'service'], value: ({ span }) => span.service, color: (value) => workloadColor(value), searchable: true },
  { id: 'resource', label: 'Resource', keys: ['resource', 'name'], value: ({ span }) => span.name, searchable: true },
  { id: 'kind', label: 'Kind', keys: ['kind'], value: ({ span }) => span.kind },
  { id: 'source', label: 'Source', keys: ['source'], value: () => 'opentelemetry' },
  { id: 'scenario', label: 'Scenario', keys: ['scenario'], value: ({ span }) => span.scenario, collapsed: true },
  { id: 'outcome', label: 'Outcome', keys: ['outcome'], value: ({ span }) => span.outcome, collapsed: true },
];

const traceFacets: FacetDef<TraceSummary>[] = [
  { ...statusFacet, value: (trace) => String(derivedStatusCode(trace.status).code) },
  { id: 'workload', label: 'Workload', keys: ['workload', 'service'], value: (trace) => trace.rootService, color: (value) => workloadColor(value) },
  { id: 'resource', label: 'Resource', keys: ['resource', 'name'], value: (trace) => trace.rootName },
  { id: 'source', label: 'Source', keys: ['source'], value: () => 'opentelemetry' },
  { id: 'scenario', label: 'Scenario', keys: ['scenario'], value: (trace) => trace.scenario },
  { id: 'outcome', label: 'Outcome', keys: ['outcome'], value: (trace) => trace.outcome },
];

const distinct = (values: string[]) => [...new Set(values)].sort();

function ChartPanel({ title, info, children, legend }: { title: string; info: string; children: ReactNode; legend?: ReactNode }) {
  return (
    <div className="minichart">
      <div className="minichart__head">
        <strong>{title}</strong>
        <span className="muted">{info}</span>
        <Info size={12} aria-hidden="true" className="muted" />
        <div className="card__spacer" />
        {legend}
      </div>
      {children}
    </div>
  );
}

export function TracesPage({ initialQuery, initialView }: { initialQuery: string; initialView: string | null }) {
  const view = useView();
  const env = view.bundle.environment;
  const mobile = useMediaQuery('(max-width: 900px)');
  const [tokens, setTokens] = useState(() => tokenize(initialQuery));
  const [mode, setMode] = useState<Mode>(initialView === 'trace' ? 'trace' : 'span');
  const [facetsOpen, setFacetsOpen] = useState(!mobile);
  const [limit, setLimit] = useState(PAGE_SIZE);
  useSyncParams('traces', { q: tokens.join(' '), view: mode === 'trace' ? 'trace' : null });

  const spanRows = useMemo<SpanRow[]>(
    () =>
      view.traces
        .flatMap((trace) => (view.bundle.spans[trace.traceId] ?? []).map((span) => ({ span, trace })))
        .sort((a, b) => Date.parse(b.span.start) - Date.parse(a.span.start)),
    [view.traces, view.bundle.spans],
  );
  const traceRows = view.traces;
  const spanResolve = useMemo(() => spanFieldResolver(env), [env]);
  const traceResolve = useMemo(() => traceFieldResolver(env), [env]);

  const filteredSpans = useMemo(() => filterItems(spanRows, tokens, spanResolve, spanText), [spanRows, tokens, spanResolve]);
  const filteredTraces = useMemo(() => filterItems(traceRows, tokens, traceResolve, traceText), [traceRows, tokens, traceResolve]);
  const spanGroups = useMemo(() => (mode === 'span' ? buildGroups(spanRows, spanFacets, tokens, spanResolve, spanText) : []), [mode, spanRows, tokens, spanResolve]);
  const traceGroups = useMemo(() => (mode === 'trace' ? buildGroups(traceRows, traceFacets, tokens, traceResolve, traceText) : []), [mode, traceRows, tokens, traceResolve]);
  const groups = mode === 'span' ? spanGroups : traceGroups;
  const matched = mode === 'span' ? filteredSpans.length : filteredTraces.length;

  const timed = useMemo<TimedRow[]>(
    () =>
      mode === 'span'
        ? filteredSpans.map(({ span }) => ({ time: Date.parse(span.start), durationMs: span.durationMs, failed: span.status === 'error', group: span.service }))
        : filteredTraces.map((trace) => ({ time: Date.parse(trace.start), durationMs: trace.durationMs, failed: trace.status === 'error', group: trace.scenario })),
    [mode, filteredSpans, filteredTraces],
  );
  const charts = useMemo(() => {
    const first = traceRows.length ? Math.min(...traceRows.map((trace) => Date.parse(trace.start))) : view.since;
    return buildTraceCharts(timed, Math.max(view.since, first), view.newest);
  }, [timed, traceRows, view.since, view.newest]);

  const fields = useMemo<SuggestField[]>(
    () => [
      { key: 'status_code', values: ['200', '500'] },
      { key: 'workload', values: distinct(view.workloads.map((workload) => workload.name)) },
      { key: 'resource', values: distinct(spanRows.map(({ span }) => span.name)) },
      { key: 'kind', values: distinct(spanRows.map(({ span }) => span.kind)) },
      { key: 'scenario', values: distinct(traceRows.map((trace) => trace.scenario)) },
      { key: 'outcome', values: distinct(traceRows.map((trace) => trace.outcome)) },
      { key: 'source', values: ['opentelemetry'] },
      { key: 'pod', values: distinct(spanRows.map(({ span }) => span.pod)) },
      { key: 'trace_id', values: [] },
      { key: 'span_id', values: [] },
    ],
    [view.workloads, spanRows, traceRows],
  );

  const noun = mode === 'span' ? 'spans' : 'traces';
  const sampled = view.fullCoverage && view.bundle.totals.traces > view.bundle.traces.length;
  const total = mode === 'span' ? filteredSpans.length : filteredTraces.length;
  const open = (traceId: string, span?: TraceSpan) => navigate(`traces/${traceId}`, { span: span?.spanId });
  const reset = () => { setTokens([]); setLimit(PAGE_SIZE); };

  return (
    <div className="page page--traces">
      <FilterBar
        tokens={tokens}
        onChange={(next) => { setTokens(next); setLimit(PAGE_SIZE); }}
        fields={fields}
        label="Filter traces"
        placeholder="Type / to filter by status, workload, resource and more"
        actions={
          <>
            <Segmented options={MODES} value={mode} onChange={(next) => { setMode(next); setLimit(PAGE_SIZE); }} label="Trace view" />
            <FilterActions />
          </>
        }
      />
      <section className="minicharts">
        <ChartPanel title="Requests" info={`${total.toLocaleString('en-US')} ${noun}`}>
          <Chart axis={charts.axis} step={charts.step} series={charts.requests} kind="bar" height={104} compact label="Requests over time" />
        </ChartPanel>
        <ChartPanel title="Errors" info={mode === 'span' ? 'by workload' : 'by scenario'} legend={<Legend items={charts.errors} max={3} />}>
          <Chart axis={charts.axis} step={charts.step} series={charts.errors} kind="bar" stacked height={104} compact label="Errors over time" />
        </ChartPanel>
        <ChartPanel title="Latencies" info={mode === 'span' ? 'per span' : 'per trace'} legend={<Legend items={charts.latency} />}>
          <Chart axis={charts.axis} step={charts.step} series={charts.latency} kind="line" height={104} compact label="Latency over time" formatValue={formatDuration} formatTick={formatDuration} />
        </ChartPanel>
      </section>
      <div className={`explorer${facetsOpen ? '' : ' explorer--closed'}`}>
        {facetsOpen && (
          <>
            {mobile && <div className="scrim" onClick={() => setFacetsOpen(false)} aria-hidden="true" />}
            <div className={`explorer__facets${mobile ? ' explorer__facets--drawer' : ''}`}>
              <FacetSidebar
                groups={groups}
                matched={matched}
                noun="results"
                onToggle={(group, value) => setTokens(toggleFacet(tokens, group, value))}
                onOnly={(group, value) => setTokens(onlyFacet(tokens, group, value))}
              />
            </div>
          </>
        )}
        <div className="explorer__main">
          <div className="explorer__toolbar">
            <button type="button" className="btn btn--ghost" aria-expanded={facetsOpen} onClick={() => setFacetsOpen((value) => !value)}>
              {facetsOpen ? <ChevronLeft size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {facetsOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            <div className="card__spacer" />
            <span className="muted">Status codes are derived from span status (error → 500, otherwise 200)</span>
          </div>
          {total === 0 ? (
            <EmptyState title="No traces match" action={<button type="button" className="btn" onClick={reset}>Clear filters</button>}>
              Nothing in this time range matches the current filters.
            </EmptyState>
          ) : (
            <div className="table-scroll explorer__table">
              {mode === 'span' ? (
                <table className="table table--traces">
                  <thead>
                    <tr><th className="logrow__level" aria-label="Status" /><th>Time</th><th>Workload</th><th>Resource</th><th>Status Code</th><th className="num">Latency</th><th>Source</th></tr>
                  </thead>
                  <tbody>
                    {filteredSpans.slice(0, limit).map(({ span, trace }) => (
                      <tr key={`${trace.traceId}-${span.spanId}`} className="row--link" tabIndex={0} onClick={() => open(trace.traceId, span)} onKeyDown={(event) => { if (event.key === 'Enter') open(trace.traceId, span); }}>
                        <td className="logrow__level"><i style={{ background: span.status === 'error' ? '#e0382f' : '#1f9d63' }} /></td>
                        <td className="mono nowrap">{formatStamp(span.start)}</td>
                        <td>{span.service}</td>
                        <td className="mono">{span.name}</td>
                        <td><StatusCode status={span.status} /></td>
                        <td className="num">{formatDuration(span.durationMs)}</td>
                        <td className="muted">opentelemetry</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="table table--traces">
                  <thead>
                    <tr><th className="logrow__level" aria-label="Status" /><th>Time</th><th>Workload</th><th>Resource</th><th>Status Code</th><th className="num">Latency</th><th className="num">Spans</th><th>Workloads in trace</th><th>Source</th></tr>
                  </thead>
                  <tbody>
                    {filteredTraces.slice(0, limit).map((trace) => (
                      <tr key={trace.traceId} className="row--link" tabIndex={0} onClick={() => open(trace.traceId)} onKeyDown={(event) => { if (event.key === 'Enter') open(trace.traceId); }}>
                        <td className="logrow__level"><i style={{ background: trace.status === 'error' ? '#e0382f' : '#1f9d63' }} /></td>
                        <td className="mono nowrap">{formatStamp(trace.start)}</td>
                        <td>{trace.rootService}</td>
                        <td className="mono">{trace.rootName}</td>
                        <td><StatusCode status={trace.status} /></td>
                        <td className="num">{formatDuration(trace.durationMs)}</td>
                        <td className="num">{trace.spanCount}</td>
                        <td className="dots">{trace.services.map((name) => <i key={name} title={name} style={{ background: workloadColor(name) }} />)}</td>
                        <td className="muted">opentelemetry</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="table-foot">
                <span className="muted">
                  Showing {Math.min(limit, total).toLocaleString('en-US')} of {total.toLocaleString('en-US')} {noun}
                  {sampled && ` · the bundle holds ${view.bundle.traces.length.toLocaleString('en-US')} sampled traces out of ${view.bundle.totals.traces.toLocaleString('en-US')} requests`}
                </span>
                {limit < total && <button type="button" className="btn" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Load more</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
