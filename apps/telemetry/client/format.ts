/** Small formatting helpers shared by the mock apps. */

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '–';
  if (ms === 0) return '0ms';
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s`;
  if (ms >= 100) return `${ms.toFixed(0)}ms`;
  if (ms >= 1) return `${ms.toFixed(ms >= 10 ? 1 : 2)}ms`;
  return `${(ms * 1000).toFixed(0)}µs`;
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}G`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(abs >= 1e4 ? 1 : 2)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatPercent(fraction: number, digits = 2): string {
  return Number.isFinite(fraction) ? `${(fraction * 100).toFixed(digits)}%` : '–';
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `HH:MM:SS.mmm` in UTC. */
export function formatClock(iso: string, millis = true): string {
  const date = new Date(iso);
  const base = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return millis ? `${base}.${pad(date.getUTCMilliseconds(), 3)}` : base;
}

/** `Nov 04 08:44:28.761` in UTC. */
export function formatStamp(iso: string, millis = true): string {
  const date = new Date(iso);
  return `${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${formatClock(iso, millis)}`;
}

export function formatAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/** Deterministic hue for a name, so a service keeps its colour across views. */
export function hashHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}
