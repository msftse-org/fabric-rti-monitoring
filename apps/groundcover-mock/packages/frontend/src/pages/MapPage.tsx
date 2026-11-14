import { useMemo, useState } from 'react';
import { formatDuration, formatPercent } from '@telemetry';
import { HealthBadge } from '../components/Badges';
import { useElementWidth } from '../lib/hooks';
import { useView } from '../lib/data';
import { HEALTH_COLOR, HEALTH_LABEL } from '../lib/health';
import type { Health, View } from '../lib/model';
import { navigate } from '../lib/router';
import { useToast } from '../lib/toast';

interface MapNode {
  id: string;
  datastore: boolean;
  col: number;
  row: number;
  x: number;
  y: number;
  r: number;
  rps: number;
  health: Health | null;
  errorRate: number;
  p95: number;
}

interface MapEdge {
  from: string;
  to: string;
  rps: number;
  latency: number;
  errorRate: number;
}

const ROW_GAP = 128;
const PAD_X = 76;

function buildGraph(view: View) {
  const edges = view.bundle.edges;
  const names = [...view.workloads.map((workload) => workload.name)];
  for (const edge of edges) if (!names.includes(edge.to)) names.push(edge.to);

  const depth = new Map(names.map((name) => [name, 0]));
  for (let pass = 0; pass < names.length; pass += 1) {
    for (const edge of edges) depth.set(edge.to, Math.max(depth.get(edge.to) ?? 0, (depth.get(edge.from) ?? 0) + 1));
  }
  const columns = new Map<number, string[]>();
  for (const name of names) {
    const col = depth.get(name) ?? 0;
    columns.set(col, [...(columns.get(col) ?? []), name]);
  }

  const maxRps = Math.max(...view.workloads.map((workload) => workload.rps), 0.01);
  const callCount = (name: string) => view.bundle.services.find((service) => service.name === name)?.requests ?? 0;
  const mapEdges: MapEdge[] = edges.map((edge) => {
    const caller = view.workloadByName.get(edge.from);
    const callee = view.workloadByName.get(edge.to);
    const base = callee ?? caller;
    const share = edge.calls / Math.max(1, callCount(base?.name ?? edge.from));
    return {
      from: edge.from,
      to: edge.to,
      rps: (base?.rps ?? 0) * share,
      latency: callee ? callee.avgMs : edge.avgMs,
      errorRate: edge.calls ? edge.errors / edge.calls : 0,
    };
  });

  const rowsMax = Math.max(...[...columns.values()].map((list) => list.length));
  const nodes: MapNode[] = [];
  for (const [col, list] of columns) {
    list.forEach((name, row) => {
      const workload = view.workloadByName.get(name);
      const rps = workload?.rps ?? mapEdges.find((edge) => edge.to === name)?.rps ?? 0;
      nodes.push({
        id: name,
        datastore: !workload,
        col,
        row,
        x: col,
        y: row - (list.length - 1) / 2 + (rowsMax - 1) / 2,
        r: 16 + 14 * Math.sqrt(rps / maxRps),
        rps,
        health: workload?.health ?? null,
        errorRate: workload?.errorRate ?? 0,
        p95: workload?.p95 ?? 0,
      });
    });
  }
  return { nodes, edges: mapEdges, columns: columns.size, rows: rowsMax };
}

function edgeColor(errorRate: number): string {
  if (errorRate >= 0.1) return HEALTH_COLOR.critical;
  if (errorRate >= 0.05) return HEALTH_COLOR.degraded;
  return '#9aa6ba';
}

export function MapPage() {
  const view = useView();
  const toast = useToast();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);
  const graph = useMemo(() => buildGraph(view), [view]);

  const innerWidth = Math.max(760, width);
  const stepX = graph.columns > 1 ? (innerWidth - PAD_X * 2) / (graph.columns - 1) : 0;
  const height = Math.max(340, (graph.rows - 1) * ROW_GAP + 190);
  const position = (node: MapNode) => ({ x: PAD_X + node.x * stepX, y: 90 + node.y * ROW_GAP });
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const current = graph.nodes.find((node) => node.id === focus);

  const open = (node: MapNode) => {
    if (node.datastore) toast();
    else navigate(`workloads/${node.id}`);
  };

  return (
    <div className="page page--map">
      <div className="map card" ref={ref}>
        <div className="map__legend" aria-label="Legend">
          {(['healthy', 'degraded', 'critical'] as const).map((health) => (
            <span key={health}><i style={{ background: HEALTH_COLOR[health] }} aria-hidden="true" />{HEALTH_LABEL[health]}</span>
          ))}
          <span className="muted">Node size = req/s · edge colour = error rate</span>
        </div>
        <div className="map__scroll">
          <svg width={innerWidth} height={height} role="group" aria-label="Service dependency map">
            <defs>
              {(['#9aa6ba', HEALTH_COLOR.degraded, HEALTH_COLOR.critical] as const).map((color) => (
                <marker key={color} id={`arrow-${color.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 10 5 0 10z" fill={color} />
                </marker>
              ))}
            </defs>
            {graph.edges.map((edge) => {
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) return null;
              const a = position(from);
              const b = position(to);
              const angle = Math.atan2(b.y - a.y, b.x - a.x);
              const x1 = a.x + Math.cos(angle) * (from.r + 3);
              const y1 = a.y + Math.sin(angle) * (from.r + 3);
              const x2 = b.x - Math.cos(angle) * (to.r + 6);
              const y2 = b.y - Math.sin(angle) * (to.r + 6);
              const color = edgeColor(edge.errorRate);
              const label = `${edge.rps.toFixed(1)} rps · ${formatDuration(edge.latency)}`;
              const labelWidth = label.length * 6 + 14;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const dim = focus !== null && focus !== edge.from && focus !== edge.to;
              return (
                <g key={`${edge.from}-${edge.to}`} opacity={dim ? 0.3 : 1}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.4 + Math.min(2.4, edge.rps / 3)} markerEnd={`url(#arrow-${color.slice(1)})`} />
                  <rect x={mx - labelWidth / 2} y={my - 18} width={labelWidth} height={17} rx={8.5} className="map__label-bg" />
                  <text x={mx} y={my - 6} textAnchor="middle" className="map__label">{label}</text>
                </g>
              );
            })}
            {graph.nodes.map((node) => {
              const { x, y } = position(node);
              const color = node.health ? HEALTH_COLOR[node.health] : '#6b7385';
              const dim = focus !== null && focus !== node.id && !graph.edges.some((edge) => (edge.from === focus && edge.to === node.id) || (edge.to === focus && edge.from === node.id));
              return (
                <g
                  key={node.id}
                  className="map__node"
                  transform={`translate(${x} ${y})`}
                  tabIndex={0}
                  role="link"
                  aria-label={`${node.id}${node.datastore ? ' datastore' : `, ${node.rps.toFixed(1)} requests per second, ${node.health}`}`}
                  opacity={dim ? 0.35 : 1}
                  onClick={() => open(node)}
                  onKeyDown={(event) => { if (event.key === 'Enter') open(node); }}
                  onPointerEnter={() => setFocus(node.id)}
                  onPointerLeave={() => setFocus(null)}
                  onFocus={() => setFocus(node.id)}
                  onBlur={() => setFocus(null)}
                >
                  <circle r={node.r + 5} fill={color} opacity={0.14} />
                  <circle r={node.r} fill="#fff" stroke={color} strokeWidth={2.4} />
                  {node.datastore ? (
                    <g stroke={color} strokeWidth={1.6} fill="none">
                      <ellipse cx={0} cy={-6} rx={9} ry={3.5} />
                      <path d="M-9 -6v12c0 2 4 3.5 9 3.5s9-1.500 9-3.500v-12M-9 0c0 2 4 3.500 9 3.500s9-1.500 9-3.500" />
                    </g>
                  ) : (
                    <text y={5} textAnchor="middle" className="map__initial" fill={color}>{node.id[0].toUpperCase()}</text>
                  )}
                  <text y={node.r + 18} textAnchor="middle" className="map__name">{node.id}</text>
                  <text y={node.r + 32} textAnchor="middle" className="map__sub">{node.datastore ? 'datastore' : `${node.rps.toFixed(1)} rps`}</text>
                </g>
              );
            })}
          </svg>
        </div>
        {current && !current.datastore && (
          <aside className="map__card" aria-live="polite">
            <strong>{current.id}</strong>
            {current.health && <HealthBadge health={current.health} />}
            <dl>
              <dt>Req/s</dt><dd>{current.rps.toFixed(2)}</dd>
              <dt>Errors</dt><dd>{formatPercent(current.errorRate, 1)}</dd>
              <dt>P95</dt><dd>{formatDuration(current.p95)}</dd>
            </dl>
            <span className="muted">Click to open workload</span>
          </aside>
        )}
      </div>
      <p className="muted map__note">
        Edge req/s is the callee’s windowed req/s scaled by the edge’s share of its calls, and latency is the callee’s windowed mean; both are approximations because edges are summarised over the whole bundle.
      </p>
    </div>
  );
}
