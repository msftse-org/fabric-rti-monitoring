import { formatClock, formatStamp } from '@telemetry';

export const SECOND = 1000;
export const MINUTE = 60_000;

/** Bucket i covers [start + i * step, start + (i + 1) * step). */
export interface TimeGrid {
  start: number;
  step: number;
  count: number;
}

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * SECOND);

export function niceStep(spanMs: number, maxBars: number): number {
  return STEPS.find((step) => spanMs / step <= maxBars) ?? STEPS[STEPS.length - 1];
}

export function makeGrid(start: number, end: number, maxBars = 60, fixedStep?: number): TimeGrid {
  const step = fixedStep ?? niceStep(Math.max(end - start, SECOND), maxBars);
  const origin = Math.floor(start / step) * step;
  return { start: origin, step, count: Math.max(1, Math.ceil((end - origin) / step)) };
}

export const gridEnd = (grid: TimeGrid) => grid.start + grid.step * grid.count;

export function bucketOf(grid: TimeGrid, ms: number): number {
  return Math.floor((ms - grid.start) / grid.step);
}

/** Sums `weight` of each item into `seriesCount` rows of `grid.count` buckets. */
export function bucketize<T>(
  grid: TimeGrid,
  items: readonly T[],
  seriesOf: (item: T) => number,
  timeOf: (item: T) => number,
  seriesCount: number,
  weight: (item: T) => number = () => 1,
): number[][] {
  const rows = Array.from({ length: seriesCount }, () => new Array<number>(grid.count).fill(0));
  for (const item of items) {
    const bucket = bucketOf(grid, timeOf(item));
    const series = seriesOf(item);
    if (bucket >= 0 && bucket < grid.count && series >= 0 && series < seriesCount) rows[series][bucket] += weight(item);
  }
  return rows;
}

export function axisTicks(grid: TimeGrid, target: number): { ticks: number[]; step: number } {
  const span = grid.step * grid.count;
  const step = STEPS.find((s) => span / s <= target) ?? STEPS[STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(grid.start / step) * step; t < grid.start + span; t += step) ticks.push(t);
  return { ticks, step };
}

export function formatTick(ms: number, tickStep: number): string {
  const clock = formatClock(new Date(ms).toISOString(), false);
  return tickStep >= MINUTE ? clock.slice(0, 5) : clock;
}

export function formatStampMs(ms: number, millis = true): string {
  return formatStamp(new Date(ms).toISOString(), millis);
}

export function formatClockMs(ms: number, millis = true): string {
  return formatClock(new Date(ms).toISOString(), millis);
}

export function niceMax(max: number, ticks = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const rough = max / ticks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * power).find((u) => u >= rough) ?? 10 * power;
  const out: number[] = [];
  for (let value = 0; value <= max + unit * 0.999; value += unit) out.push(Number(value.toFixed(10)));
  return { max: out[out.length - 1], ticks: out };
}

export function compact(value: number): string {
  if (!Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}G`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}k`;
  return trim(value);
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 2 : 1).replace(/\.?0+$/, '');
}

export function relativeTime(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / SECOND));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
