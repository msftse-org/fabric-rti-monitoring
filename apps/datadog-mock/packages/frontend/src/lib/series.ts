import { makeGrid, MINUTE, bucketOf, type TimeGrid } from './time';
import type { WindowedData } from './window';

export interface MinuteSeries {
  grid: TimeGrid;
  requests: number[];
  errors: number[];
  ok: number[];
  /** `null` where a bucket saw no requests, so lines show gaps instead of zeros. */
  avg: (number | null)[];
  p50: (number | null)[];
  p95: (number | null)[];
  p99: (number | null)[];
}

export const minuteGrid = (data: Pick<WindowedData, 'start' | 'until'>): TimeGrid => makeGrid(data.start, data.until, 60, MINUTE);

/** Per-minute request, error and latency series for one or more services (request-weighted latency when several). */
export function minuteSeries(data: WindowedData, grid: TimeGrid, services?: string[]): MinuteSeries {
  const n = grid.count;
  const requests = new Array<number>(n).fill(0);
  const errors = new Array<number>(n).fill(0);
  const sums = { avg: new Array<number>(n).fill(0), p50: new Array<number>(n).fill(0), p95: new Array<number>(n).fill(0), p99: new Array<number>(n).fill(0) };
  for (const point of data.points) {
    if (services && !services.includes(point.service)) continue;
    const i = bucketOf(grid, point.ms);
    if (i < 0 || i >= n) continue;
    requests[i] += point.requests;
    errors[i] += point.errors;
    sums.avg[i] += point.avgMs * point.requests;
    sums.p50[i] += point.p50 * point.requests;
    sums.p95[i] += point.p95 * point.requests;
    sums.p99[i] += point.p99 * point.requests;
  }
  const weighted = (row: number[]) => row.map((sum, i) => (requests[i] ? sum / requests[i] : null));
  return {
    grid,
    requests,
    errors,
    ok: requests.map((count, i) => count - errors[i]),
    avg: weighted(sums.avg),
    p50: weighted(sums.p50),
    p95: weighted(sums.p95),
    p99: weighted(sums.p99),
  };
}
