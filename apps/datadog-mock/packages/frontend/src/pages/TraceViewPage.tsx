import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, FileText, Search, ZoomOut } from 'lucide-react';
import { formatDuration, formatAgo } from '@telemetry';
import { useApp } from '../lib/app';
import { navigate, paths, replaceHash } from '../lib/router';
import { selfTimes, serviceSelfTimes, spanService } from '../lib/derive';
import { serviceColor } from '../lib/palette';
import { formatStampMs } from '../lib/time';
import { useInert } from '../lib/toast';
import { CopyButton, EmptyState, PageTabs, ServiceDot } from '../components/ui';
import { Select } from '../components/Select';
import { FlameGraph } from './trace/FlameGraph';
import { SpanList } from './trace/SpanList';
import { SpanPanel } from './trace/SpanPanel';
import { Waterfall } from './trace/Waterfall';
import { SpanTip, type ColorBy, type Hover, type Range } from './trace/shared';

type View = 'flame' | 'waterfall' | 'list';

const VIEWS: View[] = ['flame', 'waterfall', 'list'];

interface Props {
  traceId: string;
  view: string;
  span: string;
}

export function TraceViewPage({ traceId, view, span }: Props) {
  const data = useApp();
  const inert = useInert();
  const summary = useMemo(() => data.bundle.traces.find((trace) => trace.traceId === traceId), [data.bundle.traces, traceId]);
  const spans = data.bundle.spans[traceId];

  const root = useMemo(() => spans?.find((candidate) => !candidate.parentId) ?? spans?.[0], [spans]);
  const total = useMemo(() => Math.max(summary?.durationMs ?? 0, ...(spans ?? []).map((candidate) => candidate.offsetMs + candidate.durationMs), 0.1), [summary, spans]);

  const [current, setCurrent] = useState<View>(VIEWS.includes(view as View) ? (view as View) : 'flame');
  const [selectedId, setSelectedId] = useState<string | null>(span || root?.spanId || null);
  const [colorBy, setColorBy] = useState<ColorBy>('service');
  const [legend, setLegend] = useState(true);
  const [filter, setFilter] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [range, setRange] = useState<Range>({ from: 0, to: total });
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    setCurrent(VIEWS.includes(view as View) ? (view as View) : 'flame');
  }, [view]);

  const sync = useCallback(
    (nextView: View, nextSpan: string | null) => replaceHash(paths.trace(traceId, nextSpan ?? '', nextView === 'flame' ? '' : nextView)),
    [traceId],
  );
  const select = useCallback(
    (spanId: string | null) => {
      setSelectedId(spanId);
      sync(current, spanId);
    },
    [current, sync],
  );

  const ordered = useMemo(() => [...(spans ?? [])].sort((a, b) => a.offsetMs - b.offsetMs || a.depth - b.depth), [spans]);
  const selectedSpan = spans?.find((candidate) => candidate.spanId === selectedId) ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, [role="tablist"], [role="menu"]')) return;
      if (event.key === 'Escape') return select(null);
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const index = ordered.findIndex((candidate) => candidate.spanId === selectedId);
      const next = ordered[Math.max(0, Math.min(ordered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) select(next.spanId);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ordered, selectedId, select]);

  const shares = useMemo(() => {
    const times = serviceSelfTimes(spans ?? []);
    const sum = [...times.values()].reduce((a, b) => a + b, 0) || 1;
    return [...times.entries()].map(([name, ms]) => ({ name, share: ms / sum })).sort((a, b) => b.share - a.share);
  }, [spans]);
  const self = useMemo(() => selfTimes(spans ?? []), [spans]);
  const traceLogs = useMemo(() => data.bundle.logs.filter((log) => log.traceId === traceId), [data.bundle.logs, traceId]);

  const needle = filter.trim().toLowerCase();
  const faded = useCallback(
    (candidate: (typeof ordered)[number]) =>
      (errorsOnly && candidate.status !== 'error') ||
      (highlight !== null && spanService(candidate) !== highlight) ||
      (needle !== '' && !`${spanService(candidate)} ${candidate.name} ${candidate.scenario} ${candidate.pod}`.toLowerCase().includes(needle)),
    [errorsOnly, highlight, needle],
  );

  if (!summary || !spans || !root) {
    return (
      <EmptyState
        title="Trace not available"
        action={
          <a className="btn btn--primary" href={`#${paths.traces()}`}>
            Back to Trace Explorer
          </a>
        }
      >
        Trace {traceId} is not part of the {data.bundle.traces.length} traces retained in this bundle.
      </EmptyState>
    );
  }

  const zoomed = range.from > 0 || range.to < total;
  const zoom = (target: (typeof spans)[number]) => setRange({ from: target.offsetMs, to: target.offsetMs + Math.max(target.durationMs, total / 200) });
  const failed = summary.status === 'error';
  const viewProps = { spans, range, colorBy, selected: selectedId ?? '', faded, onSelect: select, onZoom: zoom, onHover: setHover };
  const switchView = (id: string) => {
    if (id === 'map') return inert();
    setCurrent(id as View);
    sync(id as View, selectedId);
  };

  return (
    <div className="tv">
      <header className="tv__head">
        <span className="tv__glyph" style={{ background: serviceColor(summary.rootService) }} aria-hidden="true" />
        <h1 className="tv__title">
          <b>{summary.rootService}</b>
          <span className="tv__resource mono">{summary.rootName}</span>
        </h1>
        <span className="tv__id mono">
          trace_id <b>{traceId}</b>
        </span>
        <CopyButton value={traceId} label="Copy trace ID" />
        <span className="grow" />
        <button type="button" className="btn" onClick={() => navigate(paths.logs(`trace_id:${traceId}`))}>
          <FileText size={14} /> View related logs{traceLogs.length ? ` (${traceLogs.length})` : ''}
        </button>
      </header>
      <div className="tv__meta">
        <span className="chip chip--soft tv__dur">
          <Clock size={12} /> {formatDuration(summary.durationMs)}
        </span>
        <span className={`chip ${failed ? 'chip--alert' : 'chip--ok'}`}>{failed ? 'ERROR' : 'OK'}</span>
        <span className="chip chip--soft">scenario:{summary.scenario}</span>
        <span className="chip chip--soft">{summary.services.length} services</span>
        <span className="tv__when muted">
          {formatStampMs(Date.parse(summary.start))} UTC ({formatAgo(summary.start)})
        </span>
      </div>
      <div className="tv__tabs">
        <span className="tv__tabs-label">Trace:</span>
        <PageTabs
          tabs={[
            { id: 'flame', label: 'Flame Graph' },
            { id: 'waterfall', label: 'Waterfall' },
            { id: 'list', label: `Span List (${spans.length})` },
            { id: 'map', label: 'Map', badge: 'New' },
          ]}
          current={current}
          onSelect={switchView}
        />
      </div>
      <div className="tv__filter">
        <div className="input-wrap tv__search">
          <Search size={13} />
          <input className="input" placeholder="Filter spans by any attribute" aria-label="Filter spans" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </div>
        <label className="tv__check">
          <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} /> Errors
        </label>
        {zoomed && (
          <button type="button" className="btn" onClick={() => setRange({ from: 0, to: total })}>
            <ZoomOut size={14} /> Reset zoom
          </button>
        )}
        <span className="grow" />
        <span className="tv__color muted">Color by</span>
        <Select
          label="Color by"
          value={colorBy}
          options={[
            { value: 'service', label: 'Service' },
            { value: 'status', label: 'Status' },
          ]}
          onChange={setColorBy}
          align="right"
        />
        <button type="button" className="link-btn" onClick={() => setLegend((value) => !value)}>
          {legend ? 'Hide Legend' : 'Show Legend'}
        </button>
      </div>
      <div className="tv__main">
        <div className="tv__view">
          {current === 'flame' && <FlameGraph {...viewProps} />}
          {current === 'waterfall' && (
            <Waterfall
              {...viewProps}
              collapsed={collapsed}
              onToggle={(spanId) =>
                setCollapsed((previous) => {
                  const next = new Set(previous);
                  if (!next.delete(spanId)) next.add(spanId);
                  return next;
                })
              }
            />
          )}
          {current === 'list' && <SpanList spans={spans} total={total} selected={selectedId ?? ''} faded={faded} onSelect={select} />}
        </div>
        {legend && (
          <aside className="tv__legend" aria-label="Legend">
            <div className="tv__legend-head">{colorBy === 'service' ? '% Exec Time' : 'Status'}</div>
            {colorBy === 'service' ? (
              shares.map((entry) => (
                <button key={entry.name} type="button" className="tv__legend-row" aria-pressed={highlight === entry.name} onClick={() => setHighlight((value) => (value === entry.name ? null : entry.name))}>
                  <ServiceDot name={entry.name} size={12} />
                  <span className="truncate grow">{entry.name}</span>
                  <span className="tv__legend-pct">{(entry.share * 100).toFixed(entry.share < 0.1 ? 2 : 1)}%</span>
                  <span className="tv__legend-bar">
                    <span style={{ width: `${entry.share * 100}%` }} />
                  </span>
                </button>
              ))
            ) : (
              <>
                {[
                  ['ok', 'var(--ok)'],
                  ['error', 'var(--sev-error)'],
                  ['unset', 'var(--sev-debug)'],
                ].map(([name, color]) => (
                  <div key={name} className="tv__legend-row">
                    <span className="service-dot" style={{ background: color, width: 12, height: 12 }} />
                    <span className="grow">{name}</span>
                    <span className="tv__legend-pct">{spans.filter((candidate) => candidate.status === name).length}</span>
                  </div>
                ))}
              </>
            )}
          </aside>
        )}
      </div>
      {selectedSpan && <SpanPanel key={selectedSpan.spanId} span={selectedSpan} traceId={traceId} selfMs={self[selectedSpan.spanId]} totalMs={total} logs={traceLogs.filter((log) => log.spanId === selectedSpan.spanId)} data={data} onClose={() => select(null)} onZoom={zoom} />}
      {hover && <SpanTip hover={hover} total={total} />}
    </div>
  );
}
