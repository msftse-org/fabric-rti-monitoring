import { useState } from 'react';
import { useElementWidth } from '../../lib/hooks';
import { compact, niceMax } from '../../lib/time';

export interface HistogramBin {
  key: string;
  label: string;
  /** Segment counts, drawn bottom-up in `colors` order. */
  counts: number[];
}

interface Props {
  bins: HistogramBin[];
  colors: string[];
  segmentLabels: string[];
  height?: number;
  ariaLabel: string;
  onSelect?: (index: number) => void;
}

const MARGIN = { top: 8, right: 10, bottom: 20, left: 38 };

/** Stacked bar histogram over categorical bins (e.g. duration ranges). */
export function Histogram({ bins, colors, segmentLabels, height = 130, ariaLabel, onSelect }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const scale = niceMax(Math.max(0, ...bins.map((bin) => bin.counts.reduce((a, b) => a + b, 0))), 3);
  const slot = innerW / Math.max(1, bins.length);
  const labelEvery = Math.max(1, Math.ceil(bins.length / Math.max(2, Math.floor(innerW / 64))));
  const y = (value: number) => MARGIN.top + innerH - (value / scale.max) * innerH;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="chart__grid" />
              <text x={MARGIN.left - 6} y={y(tick) + 3.5} textAnchor="end" className="chart__label">
                {compact(tick)}
              </text>
            </g>
          ))}
          {bins.map((bin, index) => {
            let acc = 0;
            const x = MARGIN.left + index * slot;
            return (
              <g key={bin.key}>
                {bin.counts.map((count, segment) => {
                  if (count <= 0) return null;
                  const top = y(acc + count);
                  const bottom = y(acc);
                  acc += count;
                  return <rect key={segment} x={x + slot * 0.08} y={top} width={Math.max(1, slot * 0.84)} height={Math.max(1, bottom - top)} fill={colors[segment]} />;
                })}
                {index % labelEvery === 0 && (
                  <text x={x + slot / 2} y={height - 5} textAnchor="middle" className="chart__label">
                    {bin.label}
                  </text>
                )}
                <rect
                  x={x}
                  y={MARGIN.top}
                  width={slot}
                  height={innerH}
                  fill={hover === index ? 'var(--bg-hover)' : 'transparent'}
                  opacity={0.5}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => onSelect?.(index)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && (
        <div className="chart__tip" style={hover > bins.length / 2 ? { right: width - (MARGIN.left + hover * slot) + 4, top: 4 } : { left: MARGIN.left + (hover + 1) * slot + 4, top: 4 }}>
          <div className="chart__tip-head">{bins[hover].label}</div>
          {bins[hover].counts.map((count, segment) => (
            <div key={segmentLabels[segment]} className="chart__tip-row">
              <span className="service-dot" style={{ background: colors[segment] }} />
              <span className="grow">{segmentLabels[segment]}</span>
              <b>{count}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
