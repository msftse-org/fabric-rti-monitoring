import { useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useElementWidth } from '../../lib/hooks';
import { axisTicks, compact, formatClockMs, formatTick, gridEnd, niceMax, type TimeGrid } from '../../lib/time';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
}

export type ChartMode = 'bars' | 'stacked' | 'line' | 'area';

interface Props {
  grid: TimeGrid;
  series: ChartSeries[];
  mode: ChartMode;
  height?: number;
  yFormat?: (value: number) => string;
  valueFormat?: (value: number) => string;
  yMax?: number;
  ariaLabel: string;
  /** Appended to the tooltip header, e.g. a bucket total. */
  footer?: (index: number) => ReactNode;
  onSelect?: (index: number) => void;
}

const MARGIN = { top: 8, right: 10, bottom: 20, left: 38 };

export function TimeSeriesChart({ grid, series, mode, height = 160, yFormat = compact, valueFormat = compact, yMax, ariaLabel, footer, onSelect }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const stacked = mode === 'stacked';
  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const scale = useMemo(() => {
    let max = 0;
    for (let i = 0; i < grid.count; i += 1) {
      if (stacked) {
        max = Math.max(max, series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
      } else {
        for (const s of series) max = Math.max(max, s.values[i] ?? 0);
      }
    }
    return niceMax(yMax ?? max, 4);
  }, [grid.count, series, stacked, yMax]);

  const x = (index: number) => MARGIN.left + (index / grid.count) * innerW;
  const y = (value: number) => MARGIN.top + innerH - (value / scale.max) * innerH;
  const slot = innerW / grid.count;
  const barW = Math.max(1, slot * (slot > 6 ? 0.78 : 0.9));
  const { ticks, step } = useMemo(() => axisTicks(grid, Math.max(2, Math.floor(innerW / 80))), [grid, innerW]);

  const onMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - box.left) / box.width) * grid.count);
    setHover(Math.min(grid.count - 1, Math.max(0, index)));
  };

  const hoverRows = hover === null ? [] : series.filter((s) => s.values[hover] !== null && s.values[hover] !== undefined).map((s) => ({ s, v: s.values[hover] as number }));
  if (hover !== null && !stacked && series.length > 1) hoverRows.sort((a, b) => b.v - a.v);
  const hoverX = hover === null ? 0 : x(hover) + slot / 2;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="chart__grid" />
              <text x={MARGIN.left - 6} y={y(tick) + 3.5} textAnchor="end" className="chart__label">
                {yFormat(tick)}
              </text>
            </g>
          ))}
          {ticks.map((tick) => {
            const px = MARGIN.left + ((tick - grid.start) / (gridEnd(grid) - grid.start)) * innerW;
            return (
              <text key={tick} x={px} y={height - 5} textAnchor="middle" className="chart__label">
                {formatTick(tick, step)}
              </text>
            );
          })}
          {renderSeries({ series, mode, grid, x, y, barW, slot, baseline: y(0) })}
          {hover !== null && <line x1={hoverX} x2={hoverX} y1={MARGIN.top} y2={MARGIN.top + innerH} className="chart__cursor" />}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onClick={() => hover !== null && onSelect?.(hover)}
            style={{ cursor: onSelect ? 'pointer' : 'crosshair' }}
          />
        </svg>
      )}
      {hover !== null && (
        <div className="chart__tip" style={{ left: hoverX > width / 2 ? undefined : hoverX + 10, right: hoverX > width / 2 ? width - hoverX + 10 : undefined, top: 4 }}>
          <div className="chart__tip-head">{formatClockMs(grid.start + hover * grid.step, false)}</div>
          {hoverRows.map(({ s, v }) => (
            <div key={s.key} className="chart__tip-row">
              <span className="service-dot" style={{ background: s.color }} />
              <span className="grow truncate">{s.label}</span>
              <b>{valueFormat(v)}</b>
            </div>
          ))}
          {footer?.(hover)}
        </div>
      )}
    </div>
  );
}

interface RenderArgs {
  series: ChartSeries[];
  mode: ChartMode;
  grid: TimeGrid;
  x: (index: number) => number;
  y: (value: number) => number;
  barW: number;
  slot: number;
  baseline: number;
}

function renderSeries({ series, mode, grid, x, y, barW, slot, baseline }: RenderArgs) {
  const offset = (slot - barW) / 2;
  if (mode === 'stacked' || mode === 'bars') {
    const lane = mode === 'bars' && series.length > 1 ? barW / series.length : barW;
    const rects: ReactNode[] = [];
    for (let i = 0; i < grid.count; i += 1) {
      let acc = 0;
      series.forEach((s, si) => {
        const value = s.values[i] ?? 0;
        if (value <= 0) return;
        const from = mode === 'stacked' ? acc : 0;
        const top = y(from + value);
        const bottom = y(from);
        acc += value;
        rects.push(
          <rect
            key={`${s.key}-${i}`}
            x={x(i) + offset + (mode === 'bars' ? si * lane : 0)}
            y={top}
            width={Math.max(1, lane)}
            height={Math.max(1, bottom - top)}
            fill={s.color}
          />,
        );
      });
    }
    return <g>{rects}</g>;
  }
  return (
    <g>
      {series.map((s) => {
        const segments: string[][] = [[]];
        s.values.forEach((value, i) => {
          if (value === null) {
            if (segments[segments.length - 1].length) segments.push([]);
            return;
          }
          segments[segments.length - 1].push(`${x(i) + slot / 2},${y(value)}`);
        });
        return segments
          .filter((points) => points.length)
          .map((points, index) => (
            <g key={`${s.key}-${index}`}>
              {mode === 'area' && (
                <polygon points={`${points[0].split(',')[0]},${baseline} ${points.join(' ')} ${points[points.length - 1].split(',')[0]},${baseline}`} fill={s.color} opacity={0.22} />
              )}
              {points.length > 1 ? (
                <polyline points={points.join(' ')} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" />
              ) : (
                <circle cx={Number(points[0].split(',')[0])} cy={Number(points[0].split(',')[1])} r={2} fill={s.color} />
              )}
            </g>
          ));
      })}
    </g>
  );
}
