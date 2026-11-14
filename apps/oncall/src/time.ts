export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatters.set(timeZone, value);
  }
  return value;
}

/** Weekday (0 = Sunday) and fractional hour of an instant in a time zone. */
export function zoned(ms: number, timeZone: string): { day: number; hour: number } {
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of formatter(timeZone).formatToParts(ms)) {
    if (part.type === 'weekday') day = WEEKDAYS.indexOf(part.value);
    else if (part.type === 'hour') hour = Number(part.value) % 24;
    else if (part.type === 'minute') minute = Number(part.value);
  }
  return { day, hour: hour + minute / 60 };
}

export interface Window {
  timezone: string;
  days: number[];
  startHour: number;
  endHour: number;
}

export function inWindow(ms: number, window: Window): boolean {
  const { day, hour } = zoned(ms, window.timezone);
  return window.days.includes(day) && hour >= window.startHour && hour < window.endHour;
}

/** Start of the next window at or after `ms`, on a 15-minute grid (every seeded window is aligned to it). */
export function nextWindowStart(ms: number, window: Window): number {
  if (inWindow(ms, window)) return ms;
  const step = 15 * MINUTE;
  let t = Math.ceil(ms / step) * step;
  for (let index = 0; index < (8 * DAY) / step; index += 1, t += step) {
    if (inWindow(t, window)) return t;
  }
  return ms;
}

/** FNV-1a, so simulated behaviour is identical in every browser and in tests. */
export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Deterministic number in [0, 1) for a key. */
export function unit(text: string): number {
  return hash(text) / 0x1_0000_0000;
}

/** Page numbers come from the trigger time, so they stay stable while the history window slides. */
const ID_EPOCH = Date.parse('2026-01-01T00:00:00Z');
const SLOTS = 16;

export function pageIdFor(at: number, slot: number): number {
  return 100_000 + Math.floor((at - ID_EPOCH) / (5 * MINUTE)) * SLOTS + (slot % SLOTS);
}
