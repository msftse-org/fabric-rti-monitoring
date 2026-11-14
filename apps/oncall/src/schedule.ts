import { HOUR, MINUTE, zoned } from './time.ts';
import type { Layer, Schedule, ScheduleView, Segment } from './types.ts';

/** Every seeded boundary sits on a 30-minute grid, so sampling at it is exact. */
const GRID = 30 * MINUTE;

export function layerOnCall(layer: Layer, timezone: string, t: number): string | null {
  if (!layer.memberIds.length) return null;
  if (layer.restriction) {
    const { day, hour } = zoned(t, timezone);
    const { days, startHour, endHour } = layer.restriction;
    if (!days.includes(day) || hour < startHour || hour >= endHour) return null;
  }
  const index = Math.floor((t - Date.parse(layer.rotationStart)) / (layer.shiftHours * HOUR));
  const size = layer.memberIds.length;
  return layer.memberIds[((index % size) + size) % size];
}

export function overrideAt(schedule: Schedule, t: number): string | null {
  for (let index = schedule.overrides.length - 1; index >= 0; index -= 1) {
    const item = schedule.overrides[index];
    if (t >= item.start && t < item.end) return item.userId;
  }
  return null;
}

/** Who is on call at `t`: overrides first, then layers from last to first. */
export function onCallAt(schedule: Schedule, t: number): string | null {
  const override = overrideAt(schedule, t);
  if (override) return override;
  for (let index = schedule.layers.length - 1; index >= 0; index -= 1) {
    const user = layerOnCall(schedule.layers[index], schedule.timezone, t);
    if (user) return user;
  }
  return null;
}

function segments(from: number, to: number, pick: (t: number) => string | null): Segment[] {
  const out: Segment[] = [];
  const start = Math.floor(from / GRID) * GRID;
  for (let t = start; t < to; t += GRID) {
    const userId = pick(t);
    const last = out.at(-1);
    if (userId && last && last.userId === userId && last.end === t) last.end = t + GRID;
    else if (userId) out.push({ userId, start: t, end: t + GRID });
  }
  for (const item of out) {
    item.start = Math.max(item.start, from);
    item.end = Math.min(item.end, to);
  }
  return out.filter((item) => item.end > item.start);
}

/** Final schedule, each layer and the overrides between `from` and `to`, ready for a Gantt chart. */
export function scheduleView(schedule: Schedule, from: number, to: number): ScheduleView {
  return {
    final: segments(from, to, (t) => onCallAt(schedule, t)),
    layers: schedule.layers.map((layer) => ({ layerId: layer.id, segments: segments(from, to, (t) => layerOnCall(layer, schedule.timezone, t)) })),
    overrides: segments(from, to, (t) => overrideAt(schedule, t)),
  };
}

/** The shift containing `t` and the next one, for "currently on call" and "next shift" labels. */
export function shiftAround(schedule: Schedule, t: number, horizonHours = 24 * 14): { current: Segment | null; next: Segment | null } {
  const view = segments(t - 8 * 24 * HOUR, t + horizonHours * HOUR, (time) => onCallAt(schedule, time));
  const current = view.find((item) => item.start <= t && item.end > t) ?? null;
  const next = view.find((item) => item.start > t) ?? null;
  return { current, next };
}

/** Upcoming shifts for one person across schedules, soonest first. */
export function shiftsFor(userId: string, schedules: Schedule[], from: number, to: number): (Segment & { scheduleId: string })[] {
  return schedules
    .flatMap((schedule) => segments(from, to, (t) => onCallAt(schedule, t)).filter((item) => item.userId === userId).map((item) => ({ ...item, scheduleId: schedule.id })))
    .sort((a, b) => a.start - b.start);
}
