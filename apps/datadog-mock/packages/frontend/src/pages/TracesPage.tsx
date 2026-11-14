import { useCallback, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Save, Star } from 'lucide-react';
import { useApp } from '../lib/app';
import { replaceHash, navigate, paths } from '../lib/router';
import { COLOR } from '../lib/palette';
import { facetSelection, toggleFacet } from '../lib/logsModel';
import { TRACE_FIELDS, compileTraceQuery, durationBins, traceFacetCounts, traceKey } from '../lib/tracesModel';
import { bucketize, makeGrid } from '../lib/time';
import { useIsMobile } from '../lib/hooks';
import { useInert } from '../lib/toast';
import { Facets, type FacetGroupData } from '../components/Facets';
import { SearchBar } from '../components/SearchBar';
import { NoticeBar, Segmented, ServiceDot } from '../components/ui';
import { Histogram } from '../components/charts/Histogram';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { TraceTable, type TraceSortKey } from '../components/TraceTable';

const PAGE = 100;
const FACET_KEYS = TRACE_FIELDS.filter((field) => field.key !== 'trace_id');
const DURATION_TERMS = /\s*-?@?duration:\S+/gi;

export function TracesPage({ initialQuery }: { initialQuery: string }) {
  const data = useApp();
  const inert = useInert();
  const mobile = useIsMobile();
  const [q, setQ] = useState(initialQuery);
  const [limit, setLimit] = useState(PAGE);
  const [facetsOpen, setFacetsOpen] = useState(!mobile);
  const [sort, setSort] = useState<{ key: TraceSortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  const commit = useCallback((text: string) => {
    setQ(text);
    setLimit(PAGE);
    replaceHash(paths.traces(text));
  }, []);

  const compiled = useMemo(() => compileTraceQuery(q), [q]);
  const filtered = useMemo(() => {
    const pick = { date: (t: (typeof data.traces)[number]) => t.ms, duration: (t: (typeof data.traces)[number]) => t.durationMs, spans: (t: (typeof data.traces)[number]) => t.spanCount }[sort.key];
    return data.traces.filter(compiled.test).sort((a, b) => (pick(a) - pick(b)) * sort.dir);
  }, [data.traces, compiled, sort]);
  const counts = useMemo(() => traceFacetCounts(data.traces, q), [data.traces, q]);
  const bins = useMemo(() => durationBins(filtered), [filtered]);
  const grid = useMemo(() => makeGrid(data.start, data.until, 60), [data.start, data.until]);
  const timeline = useMemo(() => {
    const [ok, error] = bucketize(grid, filtered, (trace) => (trace.status === 'error' ? 1 : 0), (trace) => trace.ms, 2);
    return [
      { key: 'ok', label: 'Ok', color: COLOR.hits, values: ok },
      { key: 'error', label: 'Error', color: COLOR.errors, values: error },
    ];
  }, [grid, filtered]);

  const groups = useMemo<FacetGroupData[]>(
    () =>
      FACET_KEYS.map((field) => {
        const { include, exclude } = facetSelection(compiled.parsed, field.key, traceKey);
        return {
          key: field.key,
          label: field.label,
          counts: counts[field.key] ?? new Map(),
          include,
          exclude,
          swatch: field.key === 'service' ? (value) => <ServiceDot name={value} /> : field.key === 'status' ? (value) => <span className="sev-swatch" style={{ background: value === 'error' ? COLOR.error : COLOR.info }} /> : undefined,
        };
      }),
    [compiled.parsed, counts],
  );

  const valuesFor = useCallback((key: string) => {
    const canonical = traceKey(key);
    return canonical && counts[canonical] ? [...counts[canonical].keys()] : [];
  }, [counts]);

  const onSort = (key: TraceSortKey) => setSort((current) => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : -1 }));
  const errors = filtered.filter((trace) => trace.status === 'error').length;
  const onBin = (index: number) => {
    const bin = bins[index];
    const base = q.replace(DURATION_TERMS, '').trim();
    const range = Number.isFinite(bin.to) ? `@duration:>=${bin.from}ms @duration:<${bin.to}ms` : `@duration:>=${bin.from}ms`;
    commit(`${base} ${range}`.trim());
  };

  return (
    <div className="logs">
      <div className="logs__controls">
        <div className="logs__row">
          <span className="logs__label">Search for</span>
          <div className="grow">
            <SearchBar value={q} onCommit={commit} keys={[...FACET_KEYS.map((field) => field.key), 'trace_id']} valuesFor={valuesFor} ariaLabel="Search traces" placeholder="Search traces, e.g. service:payment status:error @duration:>200ms" />
          </div>
          <button type="button" className="btn logs__hide-sm" onClick={inert}>
            <Star size={14} /> Views
          </button>
          <button type="button" className="btn btn--primary logs__hide-sm" onClick={inert}>
            <Save size={14} /> Save
          </button>
        </div>
        <div className="logs__row logs__row--wrap">
          <span className="logs__label">Show</span>
          <Segmented
            label="Show"
            value="traces"
            options={[
              { value: 'spans', label: 'Spans' },
              { value: 'traces', label: 'Traces' },
            ]}
            onChange={(value) => value === 'spans' && inert()}
          />
          <span className="logs__label logs__label--gap">Visualize as</span>
          <Segmented
            label="Visualize as"
            value="list"
            options={[
              { value: 'list', label: 'List' },
              { value: 'timeseries', label: 'Timeseries' },
              { value: 'toplist', label: 'Top List' },
              { value: 'table', label: 'Table' },
            ]}
            onChange={(value) => value !== 'list' && inert()}
          />
          <span className="grow" />
          <button type="button" className="btn btn--ghost" aria-expanded={facetsOpen} onClick={() => setFacetsOpen((open) => !open)}>
            {facetsOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            {facetsOpen ? 'Hide controls' : 'Show controls'}
          </button>
        </div>
      </div>
      <div className="logs__body">
        {facetsOpen && (
          <aside className="logs__facets" aria-label="Facets">
            <Facets groups={groups} onToggle={(key, value) => commit(toggleFacet(q, key, value, false, traceKey))} />
          </aside>
        )}
        <section className="logs__main logs__main--scroll">
          <div className="traces__charts">
            <div className="traces__chart">
              <div className="logs__histo-head">
                <b>Duration distribution</b>
                <span className="grow" />
                <span className="legend-item">
                  <span className="sev-swatch" style={{ background: COLOR.hits }} />
                  Ok
                </span>
                <span className="legend-item">
                  <span className="sev-swatch" style={{ background: COLOR.errors }} />
                  Error
                </span>
              </div>
              <Histogram
                bins={bins.map((bin) => ({ key: String(bin.from), label: bin.label, counts: [bin.ok, bin.error] }))}
                colors={[COLOR.hits, COLOR.errors]}
                segmentLabels={['Ok', 'Error']}
                ariaLabel="Trace duration distribution"
                onSelect={onBin}
              />
            </div>
            <div className="traces__chart">
              <div className="logs__histo-head">
                <b>{filtered.length.toLocaleString()}</b> traces
                <span className="muted"> · {errors.toLocaleString()} errors</span>
              </div>
              <TimeSeriesChart grid={grid} series={timeline} mode="stacked" height={130} ariaLabel="Traces over time" />
            </div>
          </div>
          <div className="traces__note">
            <NoticeBar>
              The bundle retains {data.bundle.traces.length.toLocaleString()} of {data.bundle.totals.traces.toLocaleString()} traces: the most recent, every error and the slowest. Older minutes therefore skew towards errors and slow requests.
            </NoticeBar>
          </div>
          <div className="logs__toolbar">
            <span className="muted">
              Showing {Math.min(limit, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} traces
            </span>
          </div>
          <TraceTable rows={filtered.slice(0, limit)} total={filtered.length} spans={data.bundle.spans} sort={sort} onSort={onSort} onOpen={(traceId) => navigate(paths.trace(traceId))} onLoadMore={() => setLimit((value) => value + PAGE)} />
          {filtered.length === 0 && (
            <div className="logs__empty">
              <NoticeBar>No traces match “{q || '*'}” in the selected window.</NoticeBar>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
