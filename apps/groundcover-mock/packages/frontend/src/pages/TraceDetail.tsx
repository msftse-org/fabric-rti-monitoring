import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { formatDuration, formatStamp, type LogEntry, type TraceSpan } from '@telemetry';
import { StatusCode, Tabs } from '../components/Badges';
import { FieldList, type DetailField } from '../components/DetailPanel';
import { FlameChart } from '../components/FlameChart';
import { EmptyState } from '../components/States';
import { Waterfall } from '../components/Waterfall';
import { useView } from '../lib/data';
import { derivedStatusCode } from '../lib/fields';
import { SEVERITY_COLOR, workloadColor } from '../lib/palette';
import { href, navigate, useSyncParams } from '../lib/router';
import { buildTree, traceExtent, visibleSpans } from '../lib/traceTree';

const MAIN_TABS = [
  { id: 'waterfall', label: 'Waterfall' },
  { id: 'flame', label: 'Flame Chart' },
  { id: 'map', label: 'Service Map' },
  { id: 'spans', label: 'Spans' },
  { id: 'logs', label: 'Logs' },
] as const;
type MainTab = (typeof MAIN_TABS)[number]['id'];

const SIDE_TABS = [
  { id: 'attributes', label: 'Attributes' },
  { id: 'container', label: 'Container Info' },
  { id: 'logs', label: 'Logs' },
] as const;
type SideTab = (typeof SIDE_TABS)[number]['id'];

/** Client spans call a datastore named in the middle of the span name (`demo.postgres.query`). */
function calleeOf(span: TraceSpan): string {
  return span.kind === 'client' ? span.name.split('.')[1] ?? span.name : span.service;
}

function TraceServiceMap({ spans, total }: { spans: TraceSpan[]; total: number }) {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const nodes: string[] = [];
  const edges: { from: string; to: string; ms: number; failed: boolean }[] = [];
  const add = (name: string) => { if (!nodes.includes(name)) nodes.push(name); };
  for (const span of spans) {
    const target = calleeOf(span);
    add(target);
    const parent = byId.get(span.parentId);
    const source = parent ? parent.service : null;
    if (source && source !== target) {
      add(source);
      edges.push({ from: source, to: target, ms: span.durationMs, failed: span.status === 'error' });
    }
  }
  const gap = 150;
  const width = Math.max(320, nodes.length * gap);
  const x = (name: string) => 60 + nodes.indexOf(name) * ((width - 120) / Math.max(1, nodes.length - 1));
  return (
    <div className="table-scroll">
      <svg width={width} height={170} role="img" aria-label="Services involved in this trace">
        <defs>
          <marker id="trace-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#9aa6ba" /></marker>
        </defs>
        {edges.map((edge) => (
          <g key={`${edge.from}-${edge.to}`}>
            <line x1={x(edge.from) + 20} x2={x(edge.to) - 24} y1={70} y2={70} stroke={edge.failed ? '#e0382f' : '#9aa6ba'} strokeWidth={2} markerEnd="url(#trace-arrow)" />
            <text x={(x(edge.from) + x(edge.to)) / 2} y={60} textAnchor="middle" className="map__label">{formatDuration(edge.ms)} · {Math.round((edge.ms / total) * 100)}%</text>
          </g>
        ))}
        {nodes.map((name) => (
          <g key={name} transform={`translate(${x(name)} 70)`}>
            <circle r={18} fill="#fff" stroke={workloadColor(name)} strokeWidth={2.4} />
            <text y={5} textAnchor="middle" className="map__initial" fill={workloadColor(name)}>{name[0].toUpperCase()}</text>
            <text y={38} textAnchor="middle" className="map__name">{name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function LogTable({ logs, onPick }: { logs: LogEntry[]; onPick?: (log: LogEntry) => void }) {
  if (logs.length === 0) return <p className="muted pad">No logs were emitted by this selection.</p>;
  return (
    <div className="table-scroll">
      <table className="table table--logs">
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className={onPick ? 'row--link' : undefined} onClick={() => onPick?.(log)}>
              <td className="logrow__level"><i style={{ background: SEVERITY_COLOR[log.severity] }} title={log.severity} /></td>
              <td className="mono nowrap">{formatStamp(log.ts)}</td>
              <td className="mono muted nowrap">{log.service}</td>
              <td className="mono">{log.body} <span className="muted">outcome={log.outcome}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TraceDetail({ traceId, spanId }: { traceId: string; spanId: string | null }) {
  const view = useView();
  const env = view.bundle.environment;
  const trace = view.bundle.traces.find((item) => item.traceId === traceId);
  const spans = useMemo(() => view.bundle.spans[traceId] ?? [], [view.bundle.spans, traceId]);
  const tree = useMemo(() => buildTree(spans), [spans]);
  const logs = useMemo(() => view.bundle.logs.filter((log) => log.traceId === traceId), [view.bundle.logs, traceId]);
  const [tab, setTab] = useState<MainTab>('waterfall');
  const [sideTab, setSideTab] = useState<SideTab>('attributes');
  const [selectedId, setSelectedId] = useState<string | null>(spanId && spans.some((span) => span.spanId === spanId) ? spanId : (tree.order[0]?.spanId ?? null));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  useSyncParams(`traces/${traceId}`, { span: selectedId });

  if (!trace || spans.length === 0) {
    return (
      <div className="page">
        <EmptyState title="Trace not found" action={<a className="btn" href={href('traces')}>Back to Traces</a>}>
          Trace {traceId.slice(0, 12)}… is not among the traces held by the telemetry bundle, which keeps a sample of recent requests.
        </EmptyState>
      </div>
    );
  }

  const total = traceExtent(spans, trace.durationMs);
  const selected = spans.find((span) => span.spanId === selectedId) ?? tree.order[0];
  const rows = visibleSpans(tree, collapsed);
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const copy = () => {
    void navigator.clipboard?.writeText(trace.traceId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const attributes: DetailField[] = [
    { label: 'Resource', value: selected.name, display: <span className="mono">{selected.name}</span> },
    { label: 'Workload', value: selected.service },
    { label: 'Kind', value: selected.kind },
    { label: 'Status', value: selected.status },
    { label: 'Status Code', value: derivedStatusCode(selected.status).label, display: <StatusCode status={selected.status} /> },
    { label: 'Start', value: selected.start, display: formatStamp(selected.start) },
    { label: 'Offset', value: formatDuration(selected.offsetMs) },
    { label: 'Duration', value: formatDuration(selected.durationMs) },
    { label: 'Scenario', value: selected.scenario },
    { label: 'Outcome', value: selected.outcome },
    { label: 'span_id', value: selected.spanId, display: <span className="mono">{selected.spanId}</span> },
    { label: 'parent_span_id', value: selected.parentId || '–', display: <span className="mono">{selected.parentId || '–'}</span> },
    { label: 'trace_id', value: trace.traceId, display: <span className="mono">{trace.traceId}</span> },
  ];
  const container: DetailField[] = [
    { label: 'Workload', value: selected.service },
    { label: 'Pod', value: selected.pod },
    { label: 'Host', value: selected.node },
    { label: 'Version', value: selected.version },
    { label: 'Namespace', value: env.namespace },
    { label: 'Cluster', value: env.cluster },
    { label: 'Environment', value: env.environment },
  ];
  const spanLogs = logs.filter((log) => log.spanId === selected.spanId);

  return (
    <div className="page page--trace">
      <div className="trace">
        <section className="trace__main card">
          <div className="trace__head">
            <button type="button" className="icon-btn" aria-label="Back to traces" onClick={() => navigate('traces')}>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <h2>Trace</h2>
            <span className="tag"><i className="dot" style={{ background: workloadColor(trace.rootService) }} aria-hidden="true" />{trace.rootService}</span>
            <span className="tag mono">{trace.rootName}</span>
            <StatusCode status={trace.status} />
          </div>
          <div className="trace__meta">
            <span className="tag">Duration <b>{formatDuration(trace.durationMs)}</b></span>
            <span className="tag">Spans <b>{trace.spanCount}</b></span>
            <span className="tag">Workloads <b>{trace.services.length}</b></span>
            <span className="tag">Scenario <b>{trace.scenario}</b></span>
            <button type="button" className="tag tag--btn mono" onClick={copy} aria-label="Copy trace id">
              ID {trace.traceId.slice(0, 12)}…
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            </button>
          </div>
          <Tabs tabs={MAIN_TABS} value={tab} onChange={setTab} label="Trace views" />
          <div className="trace__body">
            {tab === 'waterfall' && <Waterfall rows={rows} tree={tree} total={total} selectedId={selected.spanId} collapsed={collapsed} onSelect={setSelectedId} onToggle={toggle} />}
            {tab === 'flame' && <FlameChart tree={tree} total={total} selectedId={selected.spanId} onSelect={setSelectedId} />}
            {tab === 'map' && <TraceServiceMap spans={spans} total={total} />}
            {tab === 'spans' && (
              <div className="table-scroll">
                <table className="table table--compact">
                  <thead><tr><th>Offset</th><th>Workload</th><th>Resource</th><th>Kind</th><th>Status Code</th><th className="num">Latency</th></tr></thead>
                  <tbody>
                    {spans.map((span) => (
                      <tr key={span.spanId} className="row--link" aria-selected={span.spanId === selected.spanId} tabIndex={0} onClick={() => setSelectedId(span.spanId)} onKeyDown={(event) => { if (event.key === 'Enter') setSelectedId(span.spanId); }}>
                        <td className="mono">+{formatDuration(span.offsetMs)}</td>
                        <td>{span.service}</td>
                        <td className="mono">{span.name}</td>
                        <td>{span.kind}</td>
                        <td><StatusCode status={span.status} /></td>
                        <td className="num">{formatDuration(span.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === 'logs' && <LogTable logs={logs} onPick={(log) => { setSelectedId(log.spanId); setSideTab('logs'); }} />}
          </div>
        </section>
        <aside className="trace__side card" aria-label="Span details">
          <div className="trace__head">
            <h2>Span</h2>
            <span className="tag"><i className="dot" style={{ background: workloadColor(selected.service) }} aria-hidden="true" />{selected.service}</span>
            <StatusCode status={selected.status} />
          </div>
          <div className="trace__meta"><span className="tag mono">{selected.name}</span><span className="tag">{formatDuration(selected.durationMs)}</span></div>
          <Tabs tabs={SIDE_TABS} value={sideTab} onChange={setSideTab} label="Span details" />
          <div className="trace__body">
            {sideTab === 'attributes' && <FieldList fields={attributes} />}
            {sideTab === 'container' && <FieldList fields={container} />}
            {sideTab === 'logs' && <LogTable logs={spanLogs} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
