const pad = (value: number, width = 2) => String(value).padStart(width, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MINUTE = 60_000;

/** `MM/DD/YYYY HH:mm:ss.SSS` in UTC, the way the Coralogix result tables print time. */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

/** `HH:mm:ss` in UTC. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** `08:45 AM` style axis label in UTC. */
export function formatTick(ms: number, seconds = false): string {
  const d = new Date(ms);
  const hours = d.getUTCHours();
  const base = `${pad(hours % 12 === 0 ? 12 : hours % 12)}:${pad(d.getUTCMinutes())}`;
  return `${base}${seconds ? `:${pad(d.getUTCSeconds())}` : ''} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** `Nov 04, 2026 08:57:32 UTC`. */
export function formatLongDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())}, ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

const BUCKET_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].map((seconds) => seconds * 1000);

/** Smallest friendly bucket width that keeps the bar count at or below `maxBars`. */
export function chooseBucketMs(spanMs: number, maxBars = 60): number {
  return BUCKET_STEPS.find((step) => spanMs / step <= maxBars) ?? BUCKET_STEPS[BUCKET_STEPS.length - 1];
}

export interface TimeRange {
  /** Start of the first whole-minute bucket covered by the window. */
  startMs: number;
  /** End of the last whole-minute bucket covered by the window. */
  endMs: number;
}

export function bucketCount(range: TimeRange, bucketMs: number): number {
  return Math.max(1, Math.ceil((range.endMs - range.startMs) / bucketMs));
}
