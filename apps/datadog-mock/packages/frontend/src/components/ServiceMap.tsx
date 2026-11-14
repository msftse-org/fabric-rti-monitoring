import { useMemo } from 'react';
import { formatDuration } from '@telemetry';
import type { EdgeStat, ServiceStat } from '../lib/derive';
import type { Health } from '../lib/palette';
import { serviceColor } from '../lib/palette';

interface Props {
  stats: ServiceStat[];
  edges: EdgeStat[];
  selected?: string;
  /** When set, edges and nodes not touching this service are dimmed. */
  focus?: string;
  onSelect?: (name: string) => void;
  /** Scales the diagram; the container scrolls when it overflows. */
  zoom?: number;
}

interface Placed {
  name: string;
  x: number;
  y: number;
  database: boolean;
}

const COL = 190;
const ROW = 120;
const PAD = 70;
const R = 25;

const HEALTH_STROKE: Record<Health, string> = { ok: '#4fbf6b', warn: '#f5a524', alert: '#eb364b', nodata: '#9aa4b8' };

function layout(stats: ServiceStat[], edges: EdgeStat[]): Placed[] {
  const services = new Set(stats.map((stat) => stat.name));
  const depth = new Map<string, number>();
  const callEdges = edges.filter((edge) => edge.kind === 'service' && services.has(edge.from) && services.has(edge.to));
  for (const name of services) if (!callEdges.some((edge) => edge.to === name)) depth.set(name, 0);
  // Relax edges until depths settle; the call graph is a small DAG.
  for (let pass = 0; pass < services.size; pass += 1) {
    for (const edge of callEdges) depth.set(edge.to, Math.max(depth.get(edge.to) ?? 0, (depth.get(edge.from) ?? 0) + 1));
  }
  const perColumn = new Map<number, number>();
  const placed: Placed[] = [...services]
    .sort((a, b) => (depth.get(a) ?? 0) - (depth.get(b) ?? 0) || a.localeCompare(b))
    .map((name) => {
      const column = depth.get(name) ?? 0;
      const row = perColumn.get(column) ?? 0;
      perColumn.set(column, row + 1);
      return { name, x: PAD + column * COL, y: PAD + row * ROW, database: false };
    });
  const stacked = new Map<string, number>();
  for (const edge of edges.filter((candidate) => candidate.kind === 'database')) {
    const caller = placed.find((node) => node.name === edge.from);
    if (!caller || placed.some((node) => node.name === edge.to)) continue;
    const count = stacked.get(edge.from) ?? 0;
    stacked.set(edge.from, count + 1);
    placed.push({ name: edge.to, x: caller.x + count * 120, y: caller.y + ROW * 1.35, database: true });
  }
  return placed;
}

function edgeColor(edge: EdgeStat): string {
  return edge.errorRate >= 0.1 ? '#eb364b' : edge.errorRate >= 0.05 ? '#f5a524' : 'var(--border-strong)';
}

export function ServiceMap({ stats, edges, selected, focus, onSelect, zoom = 1 }: Props) {
  const nodes = useMemo(() => layout(stats, edges), [stats, edges]);
  const byName = useMemo(() => new Map(stats.map((stat) => [stat.name, stat])), [stats]);
  const width = Math.max(...nodes.map((node) => node.x)) + PAD + 30;
  const height = Math.max(...nodes.map((node) => node.y)) + PAD + 30;
  const position = new Map(nodes.map((node) => [node.name, node]));
  const touches = (name: string) => !focus || name === focus || edges.some((edge) => (edge.from === focus && edge.to === name) || (edge.to === focus && edge.from === name));

  return (
    <div className="map__scroll">
      <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Service dependency map" className="map__svg">
        <defs>
          {['#eb364b', '#f5a524', 'var(--border-strong)'].map((color, index) => (
            <marker key={index} id={`arrow-${index}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={color} />
            </marker>
          ))}
        </defs>
        {edges.map((edge) => {
          const from = position.get(edge.from);
          const to = position.get(edge.to);
          if (!from || !to) return null;
          const color = edgeColor(edge);
          const marker = color === '#eb364b' ? 0 : color === '#f5a524' ? 1 : 2;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const x1 = from.x + (dx / len) * (R + 3);
          const y1 = from.y + (dy / len) * (R + 3);
          const x2 = to.x - (dx / len) * (R + 8);
          const y2 = to.y - (dy / len) * (R + 8);
          const dim = focus ? edge.from !== focus && edge.to !== focus : false;
          return (
            <g key={`${edge.from}-${edge.to}`} opacity={dim ? 0.25 : 1}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={Math.min(5, 1.5 + edge.rps * 0.5)} markerEnd={`url(#arrow-${marker})`} />
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" className="map__edge-label">
                {edge.rps >= 0.1 ? `${edge.rps.toFixed(2)} req/s` : `${edge.calls} req`}
              </text>
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 12} textAnchor="middle" className="map__edge-label map__edge-label--sub">
                {(edge.errorRate * 100).toFixed(1)}% err · {formatDuration(edge.avgMs)}
              </text>
            </g>
          );
        })}
        {nodes.map((node) => {
          const stat = byName.get(node.name);
          const stroke = HEALTH_STROKE[stat?.status ?? 'ok'];
          const interactive = Boolean(stat && onSelect);
          return (
            <g
              key={node.name}
              transform={`translate(${node.x} ${node.y})`}
              opacity={touches(node.name) ? 1 : 0.35}
              className="map__node"
              data-selected={selected === node.name}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? 'button' : undefined}
              aria-label={`${node.name}${stat ? `, ${stat.status}` : ', database'}`}
              onClick={() => interactive && onSelect?.(node.name)}
              onKeyDown={(event) => {
                if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onSelect?.(node.name);
                }
              }}
            >
              {selected === node.name && <circle r={R + 7} fill="none" stroke="var(--nav-active)" strokeWidth={2} strokeDasharray="4 3" />}
              {node.database ? (
                <>
                  <path d="M-17 -12v24c0 5 8 8 17 8s17-3 17-8v-24" fill="var(--bg-raised)" stroke={serviceColor(node.name)} strokeWidth={3} />
                  <ellipse cx="0" cy="-12" rx="17" ry="7" fill="var(--bg-raised)" stroke={serviceColor(node.name)} strokeWidth={3} />
                </>
              ) : (
                <>
                  <circle r={R} fill="var(--bg-raised)" stroke={stroke} strokeWidth={4} />
                  <circle r={R - 8} fill={serviceColor(node.name)} opacity={0.9} />
                </>
              )}
              <text y={R + 18} textAnchor="middle" className="map__label">
                {node.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
