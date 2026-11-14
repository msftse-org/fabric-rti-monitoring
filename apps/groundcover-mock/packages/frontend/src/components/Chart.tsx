import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatCount, formatStamp } from '@telemetry';
import { useElementWidth } from '../lib/hooks';
import type { ChartSeries } from '../lib/model';
import { niceTicks } from '../lib/series';

interface ChartProps {
  axis: number[];
  step: number;
  series: ChartSeries[];
  kind: 'bar' | 'line' | 'area';
  stacked?: boolean;
  height?: number;
  label: string;
  formatValue?: (value: number) => string;
  formatTick?: (value: number) => string;
  /** Enables drag-to-select; called with the selected [from, to) range in epoch ms. */
  onBrush?: (from: number, to: number) => void;
  compact?: boolean;
  yMax?: number;
}

const MARGIN = { top: 8, right: 8, bottom: 20, left: 40 };

function clockLabel(t: number, step: number): string {
  return new Date(t).toISOString().slice(11, step >= 60_000 ? 16 : 19);
}

export function Chart({
  axis,
  step,
  series,
  kind,
  stacked = kind === 'bar',
  height = 160,
  label,
  formatValue = formatCount,
  formatTick,
  onBrush,
  compact = false,
  yMax,
}: ChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragging = useRef(false);

  const totals = axis.map((_, index) => {
    const values = series.map((item) => item.values[index] ?? 0);
    return stacked ? values.reduce((a, b) => a + b, 0) : Math.max(0, ...values);
  });
  const peak = Math.max(yMax ?? 0, ...totals);
  const ticks = niceTicks(peak > 0 ? peak : 1, compact ? 3 : 4);
  const top = ticks[ticks.length - 1];
  const tickLabel = formatTick ?? formatCount;

  const widest = Math.max(...ticks.map((tick) => tickLabel(tick).length));
  const left = Math.max(compact ? 30 : MARGIN.left, widest * 6 + 12);
  const innerW = Math.max(20, width - left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const count = axis.length;
  const slot = innerW / Math.max(1, count);
  const y = (value: number) => MARGIN.top + innerH - (Math.max(0, value) / top) * innerH;
  const xCenter = (index: number) => left + (index + 0.5) * slot;

  const labelEvery = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(innerW / (step < 60_000 ? 78 : 58)))));

  const indexAt = (event: ReactPointerEvent): number | null => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = event.clientX - rect.left - left;
    if (x < 0 || x > innerW) return null;
    return Math.min(count - 1, Math.max(0, Math.floor(x / slot)));
  };

  const onMove = (event: ReactPointerEvent) => {
    const index = indexAt(event);
    setHover(index);
    if (dragging.current && index !== null) setDrag((current) => (current ? { ...current, to: index } : current));
  };

  const onDown = (event: ReactPointerEvent) => {
    if (!onBrush || event.button !== 0) return;
    const index = indexAt(event);
    if (index === null) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: index, to: index });
  };

  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (drag && drag.from !== drag.to && onBrush) {
      const lo = Math.min(drag.from, drag.to);
      const hi = Math.max(drag.from, drag.to);
      onBrush(axis[lo], axis[hi] + step);
    }
    setDrag(null);
  };

  const linePath = (item: ChartSeries): string => {
    let path = '';
    let pen = false;
    item.values.forEach((value, index) => {
      if (value === null) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${xCenter(index).toFixed(1)},${y(value).toFixed(1)}`;
      pen = true;
    });
    return path;
  };

  const barWidth = Math.max(1, slot * 0.76);
  const tooltipLeft = hover === null ? 0 : xCenter(hover);
  const flip = tooltipLeft > width * 0.62;

  return (
    <div
      ref={ref}
      className={`chart${onBrush ? ' chart--brush' : ''}`}
      style={{ height }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="chart__grid" x1={left} x2={left + innerW} y1={y(tick)} y2={y(tick)} />
              <text className="chart__tick" x={left - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tickLabel(tick)}</text>
            </g>
          ))}
          {axis.map((t, index) => (index % labelEvery === 0 ? (
            <text key={t} className="chart__tick" x={xCenter(index)} y={height - 5} textAnchor="middle">{clockLabel(t, step)}</text>
          ) : null))}
          {hover !== null && kind === 'bar' && (
            <rect className="chart__hover" x={left + hover * slot} y={MARGIN.top} width={slot} height={innerH} />
          )}
          {kind === 'bar' && axis.map((t, index) => {
            let base = 0;
            return series.map((item) => {
              const value = item.values[index] ?? 0;
              if (value <= 0) return null;
              const from = stacked ? base : 0;
              if (stacked) base += value;
              const heightPx = Math.max(1, y(from) - y(from + value));
              return <rect key={`${t}-${item.id}`} x={xCenter(index) - barWidth / 2} y={y(from + value)} width={barWidth} height={heightPx} fill={item.color} />;
            });
          })}
          {kind !== 'bar' && series.map((item) => (
            <g key={item.id}>
              {kind === 'area' && (
                <path d={`${linePath(item)}L${xCenter(count - 1)},${y(0)}L${xCenter(0)},${y(0)}Z`} fill={item.color} opacity={0.12} />
              )}
              <path d={linePath(item)} fill="none" stroke={item.color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {hover !== null && kind !== 'bar' && (
            <>
              <line className="chart__cursor" x1={xCenter(hover)} x2={xCenter(hover)} y1={MARGIN.top} y2={MARGIN.top + innerH} />
              {series.map((item) => {
                const value = item.values[hover];
                return value === null || value === undefined ? null : <circle key={item.id} cx={xCenter(hover)} cy={y(value)} r={3} fill="#fff" stroke={item.color} strokeWidth={1.6} />;
              })}
            </>
          )}
          {drag && (
            <rect
              className="chart__brush"
              x={left + Math.min(drag.from, drag.to) * slot}
              y={MARGIN.top}
              width={(Math.abs(drag.to - drag.from) + 1) * slot}
              height={innerH}
            />
          )}
        </svg>
      )}
      {peak === 0 && <div className="chart__empty">No data in this range</div>}
      {hover !== null && !drag && (
        <div className="tooltip" style={{ left: flip ? undefined : tooltipLeft + 12, right: flip ? width - tooltipLeft + 12 : undefined, top: 6 }}>
          <div className="tooltip__time">{formatStamp(new Date(axis[hover]).toISOString(), step < 60_000)}</div>
          {series.map((item) => (
            <div key={item.id} className="tooltip__row">
              <i style={{ background: item.color }} />
              <span>{item.label}</span>
              <b>{item.values[hover] === null || item.values[hover] === undefined ? '–' : formatValue(item.values[hover] as number)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items, max = 6 }: { items: { id: string; label: string; color: string }[]; max?: number }) {
  const shown = items.slice(0, max);
  return (
    <ul className="legend">
      {shown.map((item) => (
        <li key={item.id}><i style={{ background: item.color }} />{item.label}</li>
      ))}
      {items.length > max && <li className="legend__more">+{items.length - max}</li>}
    </ul>
  );
}
