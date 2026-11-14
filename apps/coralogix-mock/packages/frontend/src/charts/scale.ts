export interface NiceScale {
  max: number;
  ticks: number[];
}

export function niceScale(rawMax: number, target = 4): NiceScale {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return { max: 1, ticks: [0, 0.5, 1] };
  const rough = rawMax / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const max = Math.ceil(rawMax / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 1000; value += step) ticks.push(Number(value.toFixed(10)));
  return { max, ticks };
}

export function compactNumber(value: number): string {
  if (value >= 1e6) return `${trim(value / 1e6)}M`;
  if (value >= 1e3) return `${trim(value / 1e3)}k`;
  return trim(value);
}

function trim(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Indexes of roughly `count` evenly spaced axis labels. */
export function tickIndexes(length: number, count: number): number[] {
  if (length <= 1) return [0];
  const step = Math.max(1, Math.round((length - 1) / Math.max(1, count - 1)));
  const indexes: number[] = [];
  for (let i = 0; i < length; i += step) indexes.push(i);
  return indexes;
}
