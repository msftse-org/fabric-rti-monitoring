const STEPS_MS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((seconds) => seconds * 1000);

/** Smallest bucket width that keeps the number of bars at or under `target`. */
export function pickStep(rangeMs: number, target = 48): number {
  return STEPS_MS.find((step) => rangeMs / step <= target) ?? 3_600_000;
}

export function buildAxis(start: number, end: number, step: number): number[] {
  const first = Math.floor(start / step) * step;
  const axis: number[] = [];
  for (let t = first; t <= end; t += step) axis.push(t);
  return axis.length ? axis : [first];
}

export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

export function bucketOf(t: number, axisStart: number, step: number, length: number): number {
  return Math.min(length - 1, Math.max(0, Math.floor((t - axisStart) / step)));
}

/** Counts items per axis bucket, optionally split by a key. */
export function countByBucket<T>(
  items: readonly T[],
  getTime: (item: T) => number,
  axis: number[],
  step: number,
  getKey: (item: T) => string = () => 'all',
): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (const item of items) {
    const key = getKey(item);
    let counts = result.get(key);
    if (!counts) {
      counts = new Array<number>(axis.length).fill(0);
      result.set(key, counts);
    }
    counts[bucketOf(getTime(item), axis[0], step, axis.length)] += 1;
  }
  return result;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
