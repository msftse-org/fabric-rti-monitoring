import { useState } from 'react';
import { formatDuration, type TraceSpan } from '@telemetry';
import { useElementWidth } from '../lib/hooks';
import { workloadColor } from '../lib/palette';
import type { SpanTree } from '../lib/traceTree';

const ROW = 24;

interface FlameChartProps {
  tree: SpanTree;
  total: number;
  selectedId: string | null;
  onSelect: (spanId: string) => void;
}

export function FlameChart({ tree, total, selectedId, onSelect }: FlameChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<TraceSpan | null>(null);
  const levels = Math.max(1, ...[...tree.depth.values()].map((level) => level + 1));
  const height = levels * ROW + 28;
  const x = (offset: number) => (offset / total) * width;
  const services = [...new Set(tree.order.map((span) => span.service))];

  return (
    <div className="flame" ref={ref}>
      <ul className="legend flame__legend">
        {services.map((name) => <li key={name}><i style={{ background: workloadColor(name) }} />{name}</li>)}
      </ul>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Flame chart of trace spans">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line className="chart__grid" x1={x(total * tick)} x2={x(total * tick)} y1={16} y2={height} />
              <text className="chart__tick" x={Math.min(width - 2, Math.max(2, x(total * tick)))} y={10} textAnchor={tick === 1 ? 'end' : tick === 0 ? 'start' : 'middle'}>{formatDuration(total * tick)}</text>
            </g>
          ))}
          {tree.order.map((span) => {
            const w = Math.max(2, x(span.durationMs));
            const y = 20 + (tree.depth.get(span.spanId) ?? 0) * ROW;
            return (
              <g
                key={span.spanId}
                className="flame__span"
                tabIndex={0}
                role="button"
                aria-label={`${span.name} in ${span.service}, ${formatDuration(span.durationMs)}`}
                onClick={() => onSelect(span.spanId)}
                onKeyDown={(event) => { if (event.key === 'Enter') onSelect(span.spanId); }}
                onPointerEnter={() => setHover(span)}
                onPointerLeave={() => setHover(null)}
              >
                <rect x={x(span.offsetMs)} y={y} width={w} height={ROW - 3} rx={3} fill={workloadColor(span.service)} opacity={span.spanId === selectedId ? 1 : 0.82} stroke={span.status === 'error' ? '#e0382f' : span.spanId === selectedId ? '#0f1426' : 'none'} strokeWidth={span.status === 'error' ? 1.6 : 1.4} />
                {w > 56 && <text x={x(span.offsetMs) + 6} y={y + 14} className="flame__text">{span.name}</text>}
              </g>
            );
          })}
        </svg>
      )}
      <div className="flame__hint muted" aria-live="polite">
        {hover ? `${hover.name} · ${hover.service} · ${formatDuration(hover.durationMs)} · starts +${formatDuration(hover.offsetMs)}${hover.status === 'error' ? ' · error' : ''}` : 'Hover a span for details; red outline marks errors'}
      </div>
    </div>
  );
}
