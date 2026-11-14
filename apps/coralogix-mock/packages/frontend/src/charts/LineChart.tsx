import { useState } from 'react';
import { formatTick } from '../lib/time';
import { compactNumber, niceScale, tickIndexes } from './scale';
import { useWidth } from './useWidth';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
}

export interface Band {
  from: number;
  to: number;
  color: string;
}

interface LineChartProps {
  times: number[];
  series: LineSeries[];
  height: number;
  ariaLabel: string;
  yFormat?: (value: number) => string;
  /** Fix the y axis instead of fitting it to the data. */
  yMax?: number;
  bands?: Band[];
  /** Compare the line against this value with a dashed reference. */
  threshold?: number;
}

const MARGIN = { left: 48, right: 14, top: 8, bottom: 22 };

export function LineChart({ times, series, height, ariaLabel, yFormat = compactNumber, yMax, bands, threshold }: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const dataMax = Math.max(0, ...series.flatMap((item) => item.values.filter((value): value is number => value !== null)));
  const scale = yMax !== undefined ? { max: yMax, ticks: niceScale(yMax).ticks.filter((tick) => tick <= yMax) } : niceScale(dataMax);
  const x = (index: number) => MARGIN.left + (times.length > 1 ? (index / (times.length - 1)) * plotWidth : plotWidth / 2);
  const y = (value: number) => MARGIN.top + plotHeight - (Math.min(value, scale.max) / scale.max) * plotHeight;

  const paths = series.map((item) => {
    let path = '';
    let pen = false;
    item.values.forEach((value, index) => {
      if (value === null) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      pen = true;
    });
    return path;
  });

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {bands?.map((band) => (
            <rect key={band.from} x={MARGIN.left} y={y(band.to)} width={plotWidth} height={Math.max(0, y(band.from) - y(band.to))} fill={band.color} />
          ))}
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
              <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" className="chart-axis">
                {yFormat(tick)}
              </text>
            </g>
          ))}
          {tickIndexes(times.length, Math.max(2, Math.floor(plotWidth / 100))).map((index) => (
            <text key={index} x={x(index)} y={height - 6} textAnchor="middle" className="chart-axis">
              {formatTick(times[index])}
            </text>
          ))}
          {threshold !== undefined && threshold <= scale.max && (
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(threshold)} y2={y(threshold)} className="chart-threshold" />
          )}
          {paths.map((path, index) => (
            <path key={series[index].key} d={path} fill="none" stroke={series[index].color} strokeWidth={1.6} strokeLinejoin="round" />
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} className="chart-cursor" />
              {series.map((item) => {
                const value = item.values[hover];
                return value === null ? null : <circle key={item.key} cx={x(hover)} cy={y(value)} r={3} fill={item.color} />;
              })}
            </g>
          )}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onMouseMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - box.left) / box.width;
              setHover(Math.min(times.length - 1, Math.max(0, Math.round(ratio * (times.length - 1)))));
            }}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && (
        <div className="chart-tooltip" style={{ left: x(hover), top: MARGIN.top }} data-flip={x(hover) > width * 0.6 ? 'left' : 'right'}>
          <strong>{formatTick(times[hover])}</strong>
          {series.map((item) => {
            const value = item.values[hover];
            return (
              <div key={item.key} className="chart-tooltip-row">
                <i style={{ background: item.color }} />
                {item.label}
                <b>{value === null ? '–' : yFormat(value)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
