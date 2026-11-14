import type { BarGroup } from '../charts/StackedBars';
import { bucketCount, type TimeRange } from './time';

/** Counts items into fixed-width time buckets, stacked by series index. */
export function histogram<T>(items: T[], range: TimeRange, bucketMs: number, seriesCount: number, pick: (item: T) => { t: number; series: number }): BarGroup[] {
  const count = bucketCount(range, bucketMs);
  const groups: BarGroup[] = Array.from({ length: count }, (_, index) => ({ t: range.startMs + index * bucketMs, values: Array.from({ length: seriesCount }, () => 0) }));
  for (const item of items) {
    const { t, series } = pick(item);
    const index = Math.floor((t - range.startMs) / bucketMs);
    if (index >= 0 && index < count && series >= 0 && series < seriesCount) groups[index].values[series] += 1;
  }
  return groups;
}
