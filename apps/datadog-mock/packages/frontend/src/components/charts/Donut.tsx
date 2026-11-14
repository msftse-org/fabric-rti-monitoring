export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centre?: string;
}

export function Donut({ slices, size = 180, thickness = 34, centre }: DonutProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg width={size} height={size} role="img" aria-label="Distribution" className="donut">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 && <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-light)" strokeWidth={thickness} />}
        {slices.map((slice) => {
          const length = total ? (slice.value / total) * circumference : 0;
          const dash = `${Math.max(0, length - 1)} ${circumference - Math.max(0, length - 1)}`;
          const node = (
            <circle key={slice.key} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={slice.color} strokeWidth={thickness} strokeDasharray={dash} strokeDashoffset={-offset}>
              <title>{`${slice.label}: ${slice.value}`}</title>
            </circle>
          );
          offset += length;
          return node;
        })}
      </g>
      {centre && (
        <text x={size / 2} y={size / 2 + 5} textAnchor="middle" className="donut__centre">
          {centre}
        </text>
      )}
    </svg>
  );
}
