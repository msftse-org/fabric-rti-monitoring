interface SparklineProps {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  bars?: boolean;
  label?: string;
}

export function Sparkline({ values, color = '#3d8bfd', width = 96, height = 24, bars = false, label }: SparklineProps) {
  const max = Math.max(...values, 0);
  if (values.length < 2 || max === 0) {
    return <svg className="spark" width={width} height={height} role="img" aria-label={label ?? 'No data'}><line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="#e4e7ec" /></svg>;
  }
  const slot = width / values.length;
  const y = (value: number) => height - 2 - (value / max) * (height - 4);
  if (bars) {
    return (
      <svg className="spark" width={width} height={height} role="img" aria-label={label ?? 'Trend'}>
        {values.map((value, index) => (
          <rect key={index} x={index * slot + 0.5} y={y(value)} width={Math.max(1, slot - 1)} height={Math.max(1, height - 2 - y(value))} fill={color} opacity={0.85} />
        ))}
      </svg>
    );
  }
  const points = values.map((value, index) => `${(index * width) / (values.length - 1)},${y(value).toFixed(1)}`);
  return (
    <svg className="spark" width={width} height={height} role="img" aria-label={label ?? 'Trend'}>
      <polyline points={`0,${height} ${points.join(' ')} ${width},${height}`} fill={color} opacity={0.12} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}
