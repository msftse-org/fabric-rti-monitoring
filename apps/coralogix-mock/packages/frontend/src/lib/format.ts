/** Percentages the way the Coralogix tables print them: `0%`, `0.46%`, `2.9%`, `10%`. */
export function percent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '–';
  const value = fraction * 100;
  if (value === 0) return '0%';
  if (value >= 10) return `${value.toFixed(0)}%`;
  if (value >= 1) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

export function perSecond(value: number): string {
  if (!Number.isFinite(value)) return '–';
  if (value === 0) return '0';
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(3);
}

export function shortId(id: string, length = 8): string {
  return id.slice(0, length);
}
