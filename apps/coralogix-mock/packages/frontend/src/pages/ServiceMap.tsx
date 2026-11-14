import { Crosshair, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatCount, formatDuration } from '@telemetry';
import { useWidth } from '../charts/useWidth';
import { ApmHeader } from '../components/ApmHeader';
import { HealthChip, healthColor } from '../components/Chips';
import { ServiceGlyph } from '../components/ServiceGlyph';
import { useData } from '../lib/data';
import { percent } from '../lib/format';
import { buildGraph, NODE_H, NODE_W, type Graph, type GraphNode } from '../lib/graph';
import { href, navigate, paths } from '../lib/router';
import type { EdgeStats } from '../lib/derive';

function edgeColor(edge: EdgeStats): string {
  return edge.errorRate >= 0.05 ? '#e5384e' : edge.errorRate >= 0.01 ? '#e1bc4f' : '#7d7d84';
}

function curve(from: GraphNode, to: GraphNode): { d: string; mid: [number, number] } {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const dx = Math.max(40, (x2 - x1) / 2);
  return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, mid: [(x1 + x2) / 2, (y1 + y2) / 2] };
}

function NodeCard({ node, selected, dimmed, onSelect }: { node: GraphNode; selected: boolean; dimmed: boolean; onSelect: (id: string) => void }) {
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(node.id);
    }
  };
  const color = healthColor(node.health);
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className={`map-node${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${node.id}, ${node.health}, ${formatCount(node.requests)} requests`}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      onKeyDown={onKeyDown}
    >
      <rect width={NODE_W} height={NODE_H} rx={8} className="map-node-box" style={selected ? { stroke: color } : undefined} />
      <rect width={4} height={NODE_H - 16} x={0} y={8} rx={2} fill={color} />
      <text x={16} y={25} className="map-node-name">
        {node.id}
      </text>
      <text x={16} y={42} className="map-node-type">
        {node.kind === 'database' ? 'Database' : 'Service'}
      </text>
      <text x={16} y={57} className="map-node-metric">
        {formatCount(node.requests)} {node.kind === 'database' ? 'calls' : 'req'}
      </text>
      <text x={NODE_W - 12} y={57} textAnchor="end" className="map-node-metric" fill={node.errorRate >= 0.05 ? '#ef7a77' : node.errorRate >= 0.01 ? '#e8c34f' : undefined}>
        {percent(node.errorRate)} err
      </text>
    </g>
  );
}

function SidePanel({ node, graph, onClose }: { node: GraphNode; graph: Graph; onClose: () => void }) {
  const upstream = graph.edges.filter((edge) => edge.to === node.id);
  const downstream = graph.edges.filter((edge) => edge.from === node.id);
  const stats = node.service;
  const open = node.kind === 'database' ? paths.databases() : paths.service(node.id);
  const edgeRow = (edge: EdgeStats, other: string) => (
    <li key={`${edge.from}-${edge.to}`}>
      <span>{other}</span>
      <span className="muted">
        {formatCount(edge.calls)} calls · {percent(edge.errorRate)} · {formatDuration(edge.avgMs)}
      </span>
    </li>
  );

  return (
    <aside className="map-panel" aria-label={`${node.id} details`}>
      <header className="drawer-head">
        <ServiceGlyph name={node.id} database={node.kind === 'database'} />
        <h2>{node.id}</h2>
        <HealthChip health={node.health} />
        <span className="card-spacer" />
        <button type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="drawer-body">
        <dl className="stat-tiles">
          <div>
            <dt>{node.kind === 'database' ? 'Calls' : 'Requests'}</dt>
            <dd>{formatCount(node.requests)}</dd>
          </div>
          <div>
            <dt>Error rate</dt>
            <dd>{percent(node.errorRate)}</dd>
          </div>
          <div>
            <dt>Avg latency</dt>
            <dd>{formatDuration(node.avgMs)}</dd>
          </div>
          <div>
            <dt>P95</dt>
            <dd>{formatDuration(stats?.p95 ?? node.database?.p95 ?? 0)}</dd>
          </div>
        </dl>
        <h3 className="drawer-section">Called by ({upstream.length})</h3>
        {upstream.length ? <ul className="edge-list">{upstream.map((edge) => edgeRow(edge, edge.from))}</ul> : <p className="muted">Entry point: nothing calls this service.</p>}
        <h3 className="drawer-section">Calls ({downstream.length})</h3>
        {downstream.length ? <ul className="edge-list">{downstream.map((edge) => edgeRow(edge, edge.to))}</ul> : <p className="muted">No downstream calls.</p>}
        <a className="btn btn-primary" href={href(open)}>
          {node.kind === 'database' ? 'Open databases' : 'Open service'}
        </a>
      </div>
    </aside>
  );
}

export function ServiceMap({ selected }: { selected: string | null }) {
  const { bundle, derived } = useData();
  const graph = useMemo(() => buildGraph(derived.services, derived.databases, derived.edges), [derived]);
  const [zoom, setZoom] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [canvasRef, canvasWidth] = useWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const fit = Math.min(1.15, Math.max(0.7, (canvasWidth - 40) / graph.width));
  const scale = zoom ?? fit;
  const maxCalls = Math.max(1, ...graph.edges.map((edge) => edge.calls));
  const node = selected ? graph.byId.get(selected) ?? null : null;
  const select = (id: string | null) => navigate(paths.map(id ?? undefined), { replace: true });

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const target = selected ? graph.byId.get(selected) : null;
    if (!scroller || !target) return;
    scroller.scrollLeft = Math.max(0, (target.x + NODE_W / 2) * scale - scroller.clientWidth / 2);
  }, [selected, graph, scale, canvasWidth]);

  const list = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return graph.nodes.filter((entry) => !needle || entry.id.toLowerCase().includes(needle)).sort((a, b) => b.requests - a.requests);
  }, [graph.nodes, search]);
  const peak = Math.max(1, ...graph.nodes.map((entry) => entry.requests));
  const connected = (id: string) => !node || id === node.id || graph.edges.some((edge) => (edge.from === node.id && edge.to === id) || (edge.to === node.id && edge.from === id));

  return (
    <div className="page">
      <ApmHeader active="map" environment={bundle.environment.environment} />
      <section className={`map-shell${node ? ' has-panel' : ''}`}>
        <aside className="map-list" aria-label="Services">
          <label className="search-box">
            <Search size={14} aria-hidden />
            <input type="search" placeholder="Search" aria-label="Search services on the map" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="map-list-head">
            <span>Name</span>
            <span>Requests</span>
          </div>
          <ul>
            {list.map((entry) => (
              <li key={entry.id}>
                <button type="button" className={entry.id === selected ? 'is-selected' : undefined} onClick={() => select(entry.id === selected ? null : entry.id)}>
                  <ServiceGlyph name={entry.id} database={entry.kind === 'database'} />
                  <span className="map-list-name">{entry.id}</span>
                  <span className="map-list-count">{formatCount(entry.requests)}</span>
                  <i className="map-list-bar" style={{ width: `${(entry.requests / peak) * 100}%`, background: healthColor(entry.health) }} />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="map-canvas" ref={canvasRef}>
          <div className="map-tools map-tools--canvas">
            <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => setZoom(Math.min(2, scale * 1.2))}>
              <ZoomIn size={15} />
            </button>
            <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.3, scale / 1.2))}>
              <ZoomOut size={15} />
            </button>
            <button type="button" className="icon-btn" aria-label="Fit to view" onClick={() => setZoom(null)}>
              <Crosshair size={15} />
            </button>
          </div>
          <div className="map-scroll" ref={scrollRef}>
            <svg width={graph.width * scale} height={graph.height * scale} viewBox={`0 0 ${graph.width} ${graph.height}`} role="group" aria-label="Service dependency graph">
              <defs>
                {['#e5384e', '#e1bc4f', '#7d7d84'].map((color) => (
                  <marker key={color} id={`arrow-${color.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill={color} />
                  </marker>
                ))}
              </defs>
              {graph.edges.map((edge) => {
                const from = graph.byId.get(edge.from);
                const to = graph.byId.get(edge.to);
                if (!from || !to) return null;
                const { d, mid } = curve(from, to);
                const color = edgeColor(edge);
                const dimmed = node !== null && edge.from !== node.id && edge.to !== node.id;
                return (
                  <g key={`${edge.from}-${edge.to}`} className={`map-edge${dimmed ? ' is-dimmed' : ''}`}>
                    <title>{`${edge.from} → ${edge.to}: ${formatCount(edge.calls)} calls, ${edge.errors} errors, avg ${formatDuration(edge.avgMs)}`}</title>
                    <path d={d} fill="none" stroke={color} strokeWidth={1.5 + (edge.calls / maxCalls) * 4} strokeOpacity={0.8} markerEnd={`url(#arrow-${color.slice(1)})`} />
                    <rect x={mid[0] - 25} y={mid[1] - 10} width={50} height={20} rx={10} className="map-edge-pill" />
                    <text x={mid[0]} y={mid[1] + 4} textAnchor="middle" className="map-edge-label">
                      {formatDuration(edge.avgMs)}
                    </text>
                  </g>
                );
              })}
              {graph.nodes.map((entry) => (
                <NodeCard key={entry.id} node={entry} selected={entry.id === selected} dimmed={!connected(entry.id)} onSelect={(id) => select(id === selected ? null : id)} />
              ))}
            </svg>
          </div>
        </div>
        {node && <SidePanel node={node} graph={graph} onClose={() => select(null)} />}
      </section>
    </div>
  );
}
