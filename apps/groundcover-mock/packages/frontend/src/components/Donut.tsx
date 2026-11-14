import { useState } from 'react';
import { formatCount } from '@telemetry';
import { Legend } from './Chart';

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, size = 168, thickness = 30, label }: { slices: DonutSlice[]; size?: number; thickness?: number; label: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const current = slices.find((slice) => slice.id === active);

  return (
    <div className="donut">
      <svg width={size} height={size} role="img" aria-label={label}>
        <g transform={`rotate(-90 ${center} ${center})`}>
          {slices.map((slice) => {
            const length = total > 0 ? (slice.value / total) * circumference : 0;
            const arc = (
              <circle
                key={slice.id}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={active === slice.id ? thickness + 4 : thickness}
                strokeDasharray={`${Math.max(0, length - 1)} ${circumference}`}
                strokeDashoffset={-offset}
                onPointerEnter={() => setActive(slice.id)}
                onPointerLeave={() => setActive(null)}
              />
            );
            offset += length;
            return arc;
          })}
        </g>
        <text x={center} y={center - 2} textAnchor="middle" className="donut__value">{formatCount(current?.value ?? total)}</text>
        <text x={center} y={center + 14} textAnchor="middle" className="donut__label">{current?.label ?? 'total'}</text>
      </svg>
      <Legend items={slices} max={5} />
    </div>
  );
}
