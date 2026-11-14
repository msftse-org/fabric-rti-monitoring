import { useState, type ReactNode } from 'react';
import { formatTick } from '../lib/time';
import { compactNumber, niceScale, tickIndexes } from './scale';
import { useWidth } from './useWidth';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarGroup {
  t: number;
  values: number[];
}

interface StackedBarsProps {
  series: BarSeries[];
  bars: BarGroup[];
  bucketMs: number;
  height: number;
  ariaLabel: string;
  yFormat?: (value: number) => string;
  onBarClick?: (index: number) => void;
  tooltipExtra?: (index: number) => ReactNode;
}

const MARGIN = { left: 42, right: 10, top: 8, bottom: 22 };

export function StackedBars({ series, bars, bucketMs, height, ariaLabel, yFormat = compactNumber, onBarClick, tooltipExtra }: StackedBarsProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const totals = bars.map((bar) => bar.values.reduce((sum, value) => sum + value, 0));
  const scale = niceScale(Math.max(0, ...totals));
  const barWidth = bars.length ? plotWidth / bars.length : 0;
  const gap = barWidth > 18 ? barWidth * 0.4 : barWidth > 10 ? 3 : barWidth > 5 ? 1.5 : 1;
  const y = (value: number) => MARGIN.top + plotHeight - (value / scale.max) * plotHeight;
  const showSeconds = bucketMs < 60_000;

  const hovered = hover !== null ? bars[hover] : null;
  const tooltipLeft = hover !== null ? MARGIN.left + (hover + 0.5) * barWidth : 0;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
              <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" className="chart-axis">
                {yFormat(tick)}
              </text>
            </g>
          ))}
          {tickIndexes(bars.length, Math.max(2, Math.floor(plotWidth / 90))).map((index) => (
            <text key={index} x={MARGIN.left + (index + 0.5) * barWidth} y={height - 6} textAnchor="middle" className="chart-axis">
              {formatTick(bars[index].t, showSeconds)}
            </text>
          ))}
          {bars.map((bar, index) => {
            let base = 0;
            return (
              <g key={bar.t}>
                {hover === index && <rect x={MARGIN.left + index * barWidth} y={MARGIN.top} width={barWidth} height={plotHeight} className="chart-hover" />}
                {bar.values.map((value, seriesIndex) => {
                  const top = base + value;
                  const rect =
                    value > 0 ? (
                      <rect
                        key={series[seriesIndex].key}
                        x={MARGIN.left + index * barWidth + gap / 2}
                        y={y(top)}
                        width={Math.max(1, barWidth - gap)}
                        height={Math.max(1, y(base) - y(top))}
                        fill={series[seriesIndex].color}
                      />
                    ) : null;
                  base = top;
                  return rect;
                })}
              </g>
            );
          })}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            className={onBarClick ? 'chart-clickable' : undefined}
            onMouseMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setHover(Math.min(bars.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * bars.length))));
            }}
            onMouseLeave={() => setHover(null)}
            onClick={() => hover !== null && onBarClick?.(hover)}
          />
        </svg>
      )}
      {hovered && hover !== null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft, top: MARGIN.top }} data-flip={tooltipLeft > width * 0.6 ? 'left' : 'right'}>
          <strong>{formatTick(hovered.t, showSeconds)}</strong>
          {series.map((item, index) => (
            <div key={item.key} className="chart-tooltip-row">
              <i style={{ background: item.color }} />
              {item.label}
              <b>{yFormat(hovered.values[index])}</b>
            </div>
          ))}
          {tooltipExtra?.(hover)}
        </div>
      )}
    </div>
  );
}
