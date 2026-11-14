import { DAY, HOUR, MINUTE } from './time.ts';

/** "3 minutes ago" relative to the demo clock, not the wall clock. */
export function ago(at: number, now: number): string {
  const delta = Math.max(0, now - at);
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return plural(Math.floor(delta / MINUTE), 'minute');
  if (delta < DAY) return plural(Math.floor(delta / HOUR), 'hour');
  return plural(Math.floor(delta / DAY), 'day');
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'} ago`;
}

/** Compact duration such as `4m 12s`, `1h 05m` or `2d 3h`. */
export function duration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function inMinutes(at: number, now: number): string {
  if (at - now < MINUTE) return at <= now ? 'now' : 'in under a minute';
  const minutes = Math.round((at - now) / MINUTE);
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
}

/** Short local time in a given zone, for schedule labels. */
export function clock(ms: number, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}

export function dateTime(ms: number, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}
