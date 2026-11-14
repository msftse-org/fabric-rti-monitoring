import { useMemo } from 'react';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  kind?: 'line' | 'bars';
  ariaLabel?: string;
}

export function Sparkline({ values, width = 90, height = 22, color = 'var(--chart-hits)', kind = 'bars', ariaLabel }: SparklineProps) {
  const shape = useMemo(() => {
    const max = Math.max(...values, 0) || 1;
    const slot = width / Math.max(values.length, 1);
    if (kind === 'bars') {
      return values.map((value, i) => ({ x: i * slot, y: height - Math.max(value > 0 ? 1.5 : 0, (value / max) * (height - 2)), w: Math.max(1, slot - 1) }));
    }
    return values.map((value, i) => ({ x: i * slot + slot / 2, y: height - 1 - (value / max) * (height - 3), w: 0 }));
  }, [values, width, height, kind]);

  return (
    <svg width={width} height={height} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : true} className="sparkline">
      {kind === 'bars' ? (
        shape.map((bar, i) => <rect key={i} x={bar.x} y={bar.y} width={bar.w} height={height - bar.y} fill={color} />)
      ) : (
        <polyline points={shape.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      )}
    </svg>
  );
}
