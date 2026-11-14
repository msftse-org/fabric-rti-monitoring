import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Settings2, Save, Star } from 'lucide-react';
import { useApp, useShell } from '../lib/app';
import { replaceHash, paths } from '../lib/router';
import { COLOR } from '../lib/palette';
import { LOG_FIELDS, canonicalKey, compileLogQuery, facetCounts, facetSelection, isErrorLog, toggleFacet } from '../lib/logsModel';
import { bucketize, makeGrid } from '../lib/time';
import { useEscape, useIsMobile } from '../lib/hooks';
import { useInert } from '../lib/toast';
import { Dropdown } from '../components/Select';
import { Facets, type FacetGroupData } from '../components/Facets';
import { SearchBar } from '../components/SearchBar';
import { NoticeBar, Segmented } from '../components/ui';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { LogPanel } from './logs/LogPanel';
import { LogTable, type ColumnId, OPTIONAL_COLUMNS } from './logs/LogTable';
import { LogViz, PatternsView, type VizKind } from './logs/LogViz';

const VIZ_OPTIONS: { value: VizKind | 'treemap'; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'timeseries', label: 'Timeseries' },
  { value: 'toplist', label: 'Top List' },
  { value: 'table', label: 'Table' },
  { value: 'treemap', label: 'Tree Map' },
  { value: 'pie', label: 'Pie Chart' },
];

const PAGE = 200;

export function LogsPage({ initialQuery }: { initialQuery: string }) {
  const data = useApp();
  const { source } = useShell();
  const inert = useInert();
  const mobile = useIsMobile();
  const env = data.bundle.environment.environment;

  const [q, setQ] = useState(initialQuery);
  const [viz, setViz] = useState<VizKind>('list');
  const [grouping, setGrouping] = useState<'fields' | 'patterns'>('fields');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [ascending, setAscending] = useState(false);
  const [columns, setColumns] = useState<ColumnId[]>([]);
  const [facetsOpen, setFacetsOpen] = useState(!mobile);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  const commit = useCallback((text: string) => {
    setQ(text);
    setLimit(PAGE);
    replaceHash(paths.logs(text));
  }, []);

  const compiled = useMemo(() => compileLogQuery(q, env), [q, env]);
  const filtered = useMemo(() => {
    const rows = data.logs.filter(compiled.test);
    return ascending ? [...rows].reverse() : rows;
  }, [data.logs, compiled, ascending]);
  const counts = useMemo(() => facetCounts(data.logs, q, env), [data.logs, q, env]);

  // Highlights rows that arrived in the latest live refresh.
  useEffect(() => {
    const ids = new Set(data.bundle.logs.map((log) => log.id));
    const previous = seen.current;
    seen.current = ids;
    if (!previous || source.mode !== 'live') return undefined;
    const added = [...ids].filter((id) => !previous.has(id));
    if (!added.length) return undefined;
    setFresh(new Set(added));
    const timer = window.setTimeout(() => setFresh(new Set()), 4000);
    return () => window.clearTimeout(timer);
  }, [data.bundle.logs, source.mode]);

  const selected = useMemo(() => filtered.find((log) => log.id === selectedId) ?? null, [filtered, selectedId]);
  const traceIds = useMemo(() => new Set(Object.keys(data.bundle.spans)), [data.bundle.spans]);
  useEscape(selected !== null, () => setSelectedId(null));

  const groups = useMemo<FacetGroupData[]>(
    () =>
      LOG_FIELDS.map((field) => {
        const { include, exclude } = facetSelection(compiled.parsed, field.key);
        return {
          key: field.key,
          label: field.label,
          counts: counts[field.key] ?? new Map(),
          include,
          exclude,
          swatch: field.key === 'status' ? (value) => <span className="sev-swatch" style={{ background: value === 'error' ? COLOR.error : COLOR.info }} /> : undefined,
        };
      }),
    [compiled.parsed, counts],
  );

  const grid = useMemo(() => makeGrid(data.start, data.until, 60), [data.start, data.until]);
  const histogram = useMemo(() => {
    const [info, error] = bucketize(grid, filtered, (log) => (isErrorLog(log) ? 1 : 0), (log) => log.ms, 2);
    return [
      { key: 'info', label: 'Info', color: COLOR.info, values: info },
      { key: 'error', label: 'Error', color: COLOR.error, values: error },
    ];
  }, [grid, filtered]);

  const keys = useMemo(() => [...LOG_FIELDS.map((field) => field.key), 'trace_id', 'span_id'], []);
  const valuesFor = useCallback(
    (key: string) => {
      const canonical = canonicalKey(key);
      return canonical && counts[canonical] ? [...counts[canonical].keys()] : [];
    },
    [counts],
  );

  const errorCount = histogram[1].values.reduce((sum, value) => sum + (value ?? 0), 0);
  const move = (delta: number) => {
    const index = filtered.findIndex((log) => log.id === selectedId);
    const next = filtered[index + delta];
    if (next) setSelectedId(next.id);
  };

  const onViz = (value: VizKind | 'treemap') => (value === 'treemap' ? inert() : setViz(value));

  return (
    <div className="logs">
      <div className="logs__controls">
        <div className="logs__row">
          <span className="logs__label">Search for</span>
          <div className="grow">
            <SearchBar value={q} onCommit={commit} keys={keys} valuesFor={valuesFor} ariaLabel="Search logs" placeholder="Search your logs, e.g. service:checkout status:error" />
          </div>
          <button type="button" className="btn logs__hide-sm" onClick={inert}>
            <Star size={14} /> Views
          </button>
          <button type="button" className="btn btn--primary logs__hide-sm" onClick={inert}>
            <Save size={14} /> Save
          </button>
        </div>
        <div className="logs__row logs__row--wrap">
          <span className="logs__label">Group into</span>
          <Segmented
            label="Group into"
            value={grouping}
            options={[
              { value: 'fields', label: 'Fields' },
              { value: 'patterns', label: 'Patterns' },
              { value: 'transactions', label: 'Transactions' },
            ]}
            onChange={(value) => (value === 'transactions' ? inert() : setGrouping(value === 'patterns' ? 'patterns' : 'fields'))}
          />
          <span className="logs__label logs__label--gap">Visualize as</span>
          <Segmented label="Visualize as" value={viz} options={VIZ_OPTIONS} onChange={onViz} />
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
            <Facets groups={groups} onToggle={(key, value) => commit(toggleFacet(q, key, value))} />
          </aside>
        )}
        <section className="logs__main">
          {grouping === 'fields' && viz === 'list' && (
            <>
              <div className="logs__histo">
                <div className="logs__histo-head">
                  <b>{filtered.length.toLocaleString()}</b> logs
                  <span className="muted"> · {errorCount.toLocaleString()} errors</span>
                  <span className="grow" />
                  <span className="legend-item">
                    <span className="sev-swatch" style={{ background: COLOR.info }} />
                    Info
                  </span>
                  <span className="legend-item">
                    <span className="sev-swatch" style={{ background: COLOR.error }} />
                    Error
                  </span>
                </div>
                <TimeSeriesChart grid={grid} series={histogram} mode="stacked" height={92} ariaLabel="Log volume by status" footer={(i) => <TipTotal values={histogram.map((s) => s.values[i] ?? 0)} />} />
              </div>
              <div className="logs__toolbar">
                <span className="muted">
                  Showing {Math.min(limit, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} logs
                </span>
                <span className="grow" />
                <Dropdown
                  label="Table options"
                  align="right"
                  triggerClassName="btn"
                  trigger={
                    <>
                      <Settings2 size={14} /> Options <ChevronDown size={13} />
                    </>
                  }
                >
                  {() => (
                    <>
                      <div className="menu__caption">Columns</div>
                      {OPTIONAL_COLUMNS.map((column) => (
                        <label key={column.id} className="menu__item">
                          <input
                            type="checkbox"
                            checked={columns.includes(column.id)}
                            onChange={() => setColumns((current) => (current.includes(column.id) ? current.filter((id) => id !== column.id) : [...current, column.id]))}
                          />
                          {column.label}
                        </label>
                      ))}
                    </>
                  )}
                </Dropdown>
              </div>
              <LogTable
                rows={filtered.slice(0, limit)}
                total={filtered.length}
                env={env}
                selectedId={selectedId}
                fresh={fresh}
                columns={columns}
                ascending={ascending}
                onSort={() => setAscending((value) => !value)}
                onSelect={setSelectedId}
                onMove={move}
                onLoadMore={() => setLimit((value) => value + PAGE)}
              />
            </>
          )}
          {grouping === 'patterns' && <PatternsView logs={filtered} onFilter={(text) => commit(`${q} "${text}"`.trim())} />}
          {grouping === 'fields' && viz !== 'list' && <LogViz key={viz} kind={viz} logs={filtered} grid={grid} env={env} />}
          {filtered.length === 0 && (
            <div className="logs__empty">
              <NoticeBar>No logs match “{q || '*'}” in {data.logs.length.toLocaleString()} logs of the selected window.</NoticeBar>
            </div>
          )}
        </section>
        {selected && (
          <LogPanel
            log={selected}
            env={env}
            traceAvailable={traceIds.has(selected.traceId)}
            onClose={() => setSelectedId(null)}
            onMove={move}
            onFilter={(key, value, exclude) => commit(toggleFacet(q, key, value, exclude))}
          />
        )}
      </div>
    </div>
  );
}

function TipTotal({ values }: { values: number[] }) {
  return (
    <div className="chart__tip-row chart__tip-total">
      <span className="grow">Total</span>
      <b>{values.reduce((a, b) => a + b, 0)}</b>
    </div>
  );
}
