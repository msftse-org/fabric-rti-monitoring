import { ArrowLeft, ChevronsDownUp, ChevronsUpDown, Copy, PanelRight, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDuration, type TraceSpan, type TraceSummary } from '@telemetry';
import { Chip } from '../components/Chips';
import { Segmented, Switch } from '../components/Controls';
import { TimeControls } from '../components/TimeControls';
import { EmptyState } from '../components/States';
import { useData } from '../lib/data';
import { shortId } from '../lib/format';
import { serviceColor } from '../lib/palette';
import { href, navigate, paths } from '../lib/router';
import { useToast } from '../lib/toast';
import { buildTree, keepMatching, visibleRows } from '../lib/traceTree';
import { formatTimestamp } from '../lib/time';
import { Flame } from './trace/Flame';
import { Gantt } from './trace/Gantt';
import { SpanPanel } from './trace/SpanPanel';

type View = 'gantt' | 'flame';

function Overview({ spans, totalMs, selectedId }: { spans: TraceSpan[]; totalMs: number; selectedId: string | null }) {
  const depth = Math.max(0, ...spans.map((span) => span.depth)) + 1;
  return (
    <svg className="trace-overview" viewBox={`0 0 1000 ${depth * 6 + 4}`} preserveAspectRatio="none" role="img" aria-label="Overview of the trace timeline">
      {spans.map((span) => (
        <rect
          key={span.spanId}
          x={(span.offsetMs / totalMs) * 1000}
          y={span.depth * 6 + 2}
          width={Math.max(2, (span.durationMs / totalMs) * 1000)}
          height={4}
          fill={span.status === 'error' ? '#e5384e' : serviceColor(span.service)}
          opacity={span.spanId === selectedId ? 1 : 0.65}
        />
      ))}
    </svg>
  );
}

function CalledBy({ spans, span }: { spans: TraceSpan[]; span: TraceSpan }) {
  const parent = spans.find((candidate) => candidate.spanId === span.parentId);
  return (
    <footer className="trace-foot">
      <span className="trace-foot-tag">{parent ? 'Called by' : 'Entry span'}</span>
      {parent && (
        <>
          <strong>{parent.service}</strong>
          <span aria-hidden>→</span>
        </>
      )}
      <strong>{span.service}</strong>
      <Chip>{span.name}</Chip>
      <Chip tone={span.status === 'error' ? 'bad' : 'ok'}>{span.status === 'error' ? 'Error' : span.status === 'ok' ? 'OK' : 'Unset'}</Chip>
      <span className="muted">{formatDuration(span.durationMs)}</span>
    </footer>
  );
}

function LoadedTrace({ trace, spans, spanId }: { trace: TraceSummary; spans: TraceSpan[]; spanId: string | null }) {
  const { bundle } = useData();
  const { notify } = useToast();
  const tree = useMemo(() => buildTree(spans), [spans]);
  const [view, setView] = useState<View>('gantt');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);

  const selectedId = spans.some((span) => span.spanId === spanId) ? spanId : (tree.roots[0]?.spanId ?? null);
  const selected = spans.find((span) => span.spanId === selectedId) ?? null;
  const select = useCallback((id: string) => {
    setPanelOpen(true);
    navigate(paths.trace(trace.traceId, id), { replace: true });
  }, [trace.traceId]);

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!errorsOnly && !needle) return { keep: null, matches: spans.length };
    return keepMatching(tree, spans, (span) => (!errorsOnly || span.status === 'error') && (!needle || `${span.name} ${span.service} ${span.kind} ${span.status} ${span.pod} ${span.spanId}`.toLowerCase().includes(needle)));
  }, [errorsOnly, needle, spans, tree]);
  const rows = useMemo(() => visibleRows(tree, collapsed, filtered.keep), [tree, collapsed, filtered.keep]);

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const parents = useMemo(() => spans.filter((span) => tree.children.has(span.spanId)).map((span) => span.spanId), [spans, tree]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const relatedLogs = useMemo(() => (selected ? bundle.logs.filter((log) => log.spanId === selected.spanId) : []), [bundle.logs, selected]);
  const copyId = () => void navigator.clipboard?.writeText(trace.traceId).then(() => notify('Trace ID copied to clipboard'));
  const failed = trace.status === 'error';

  return (
    <div className="page trace-page">
      <header className="trace-head">
        <a className="crumb-link" href={href(paths.tracing())}>
          <ArrowLeft size={14} aria-hidden /> Explore · Spans
        </a>
        <div className="trace-title">
          <h1>{trace.rootService}</h1>
          <Chip>{trace.rootName}</Chip>
          <Chip tone={failed ? 'bad' : 'ok'}>{failed ? 'Error' : 'OK'}</Chip>
          <span className="card-spacer" />
          <TimeControls />
        </div>
        <ul className="trace-meta" aria-label="Trace summary">
          <li>
            <span>root</span> {trace.rootService}
          </li>
          <li>{formatDuration(trace.durationMs)}</li>
          <li className="mono">
            {shortId(trace.traceId, 16)}
            <button type="button" className="icon-btn icon-btn--small" aria-label="Copy trace ID" onClick={copyId}>
              <Copy size={12} />
            </button>
          </li>
          <li>{trace.services.length} services</li>
          <li>{trace.spanCount} spans</li>
          <li>Depth: {tree.maxDepth}</li>
          <li>{formatTimestamp(Date.parse(trace.start))}</li>
        </ul>
      </header>

      <div className="trace-toolbar" role="toolbar" aria-label="Trace controls">
        <Segmented<View>
          ariaLabel="Trace view"
          value={view}
          onChange={setView}
          options={[
            { id: 'flame', label: 'Flame' },
            { id: 'gantt', label: 'Gantt' },
          ]}
        />
        <Switch checked={errorsOnly} onChange={setErrorsOnly} label="Errors" />
        <label className="search-box trace-search">
          <Search size={14} aria-hidden />
          <input type="search" placeholder="Search for any key or value" aria-label="Search spans" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <span className="muted trace-count">
          {filtered.matches}/{spans.length}
        </span>
        <span className="card-spacer" />
        <button type="button" className="icon-btn" aria-label="Collapse all" title="Collapse all" onClick={() => setCollapsed(new Set(parents))}>
          <ChevronsDownUp size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Expand all" title="Expand all" onClick={() => setCollapsed(new Set())}>
          <ChevronsUpDown size={15} />
        </button>
        <button type="button" className={`icon-btn${panelOpen ? ' icon-btn--accent' : ''}`} aria-label="Toggle span details" aria-pressed={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
          <PanelRight size={15} />
        </button>
      </div>

      <div className={`trace-body${panelOpen && selected ? ' has-side' : ''}`}>
        <div className="trace-main">
          <Overview spans={spans} totalMs={tree.totalMs} selectedId={selectedId} />
          {rows.length === 0 ? (
            <EmptyState title="No span matches" hint="Clear the search or switch off the Errors filter." />
          ) : view === 'gantt' ? (
            <Gantt rows={rows} totalMs={tree.totalMs} selectedId={selectedId} onSelect={select} onToggle={toggle} />
          ) : (
            <Flame spans={rows.map((row) => row.span)} totalMs={tree.totalMs} selectedId={selectedId} onSelect={select} />
          )}
        </div>
        {panelOpen && selected && <SpanPanel key={selected.spanId} trace={trace} span={selected} logs={relatedLogs} onClose={() => setPanelOpen(false)} />}
      </div>
      {selected && <CalledBy spans={spans} span={selected} />}
    </div>
  );
}

export function TraceView({ traceId, spanId }: { traceId: string; spanId: string | null }) {
  const { bundle } = useData();
  const trace = bundle.traces.find((candidate) => candidate.traceId === traceId);
  const spans = bundle.spans[traceId];

  if (!trace || !spans?.length) {
    return (
      <div className="page">
        <EmptyState
          title="This trace is not in the telemetry bundle"
          hint="The bundle keeps the newest, the failed and the slowest traces only. Pick a trace from the Spans list."
          action={
            <a className="btn" href={href(paths.tracing())}>
              Back to Explore
            </a>
          }
        />
      </div>
    );
  }
  return <LoadedTrace key={traceId} trace={trace} spans={spans} spanId={spanId} />;
}
