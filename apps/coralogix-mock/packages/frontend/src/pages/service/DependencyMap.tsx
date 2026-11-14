import { Crosshair, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { formatCount } from '@telemetry';
import type { EdgeStats } from '../../lib/derive';
import { href, paths } from '../../lib/router';

const WIDTH = 520;
const ROW = 30;
const CENTER_X = WIDTH / 2;

function edgeColor(edge: EdgeStats): string {
  return edge.errorRate >= 0.05 ? '#e5384e' : edge.errorRate >= 0.01 ? '#e1bc4f' : '#7b7b80';
}

function Label({ name, x, y, anchor, database }: { name: string; x: number; y: number; anchor: 'start' | 'end'; database: boolean }) {
  const text = (
    <text x={x} y={y + 4} textAnchor={anchor} className="map-label">
      {name}
    </text>
  );
  return database ? text : <a href={href(paths.service(name))}>{text}</a>;
}

/** Callers on the left, callees on the right, the focused service in the middle. */
export function DependencyMap({ service, edges }: { service: string; edges: EdgeStats[] }) {
  const [zoom, setZoom] = useState(1);
  const upstream = edges.filter((edge) => edge.to === service);
  const downstream = edges.filter((edge) => edge.from === service);
  const rows = Math.max(upstream.length, downstream.length, 1);
  const height = Math.max(150, rows * ROW + 50);
  const midY = height / 2;
  const maxCalls = Math.max(1, ...edges.map((edge) => edge.calls));
  const rowY = (index: number, count: number) => midY + (index - (count - 1) / 2) * ROW;
  const strokeFor = (edge: EdgeStats) => 1 + (edge.calls / maxCalls) * 4;

  return (
    <div className="map-frame">
      <div className="map-tools">
        <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, value + 0.25))}>
          <ZoomIn size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
          <ZoomOut size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Fit to view" onClick={() => setZoom(1)}>
          <Crosshair size={15} />
        </button>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={`Dependencies of ${service}`} preserveAspectRatio="xMidYMid meet">
        <g transform={`translate(${CENTER_X} ${midY}) scale(${zoom}) translate(${-CENTER_X} ${-midY})`}>
          {upstream.map((edge, index) => {
            const y = rowY(index, upstream.length);
            return (
              <g key={`${edge.from}->${edge.to}`}>
                <title>{`${edge.from} → ${edge.to}: ${formatCount(edge.calls)} calls, ${edge.errors} errors`}</title>
                <path d={`M190,${y} C225,${y} 215,${midY} ${CENTER_X - 18},${midY}`} fill="none" stroke={edgeColor(edge)} strokeWidth={strokeFor(edge)} strokeOpacity={0.85} />
                <circle cx={182} cy={y} r={5} className="map-dot" stroke={edgeColor(edge)} />
                <Label name={edge.from} x={170} y={y} anchor="end" database={false} />
              </g>
            );
          })}
          {downstream.map((edge, index) => {
            const y = rowY(index, downstream.length);
            return (
              <g key={`${edge.from}->${edge.to}`}>
                <title>{`${edge.from} → ${edge.to}: ${formatCount(edge.calls)} calls, ${edge.errors} errors`}</title>
                <path d={`M${CENTER_X + 18},${midY} C305,${midY} 295,${y} 330,${y}`} fill="none" stroke={edgeColor(edge)} strokeWidth={strokeFor(edge)} strokeOpacity={0.85} />
                <circle cx={338} cy={y} r={5} className="map-dot" stroke={edgeColor(edge)} />
                <Label name={edge.to} x={350} y={y} anchor="start" database={edge.kind === 'database'} />
              </g>
            );
          })}
          <rect x={CENTER_X - 14} y={midY - 14} width={28} height={28} rx={6} transform={`rotate(45 ${CENTER_X} ${midY})`} className="map-center" />
          <text x={CENTER_X} y={midY + 36} textAnchor="middle" className="map-label">
            {service}
          </text>
        </g>
      </svg>
      {upstream.length + downstream.length === 0 && <p className="map-empty">No dependencies observed for this service.</p>}
    </div>
  );
}
