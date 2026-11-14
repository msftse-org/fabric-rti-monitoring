import type { Schedule, Segment, User } from './types.ts';

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (text: string) => text.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\n/g, '\\n');

/** An iCalendar file of on-call shifts, for "Export schedule" buttons. */
export function toIcs(schedule: Schedule, segments: Segment[], users: User[], generatedAt: number): string {
  const names = new Map(users.map((user) => [user.id, user.name]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//rti-mock//on-call//EN', `X-WR-CALNAME:${escape(schedule.name)}`];
  for (const segment of segments) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${schedule.id}-${segment.userId}-${segment.start}@rti-mock`,
      `DTSTAMP:${stamp(generatedAt)}`,
      `DTSTART:${stamp(segment.start)}`,
      `DTEND:${stamp(segment.end)}`,
      `SUMMARY:${escape(`On call: ${names.get(segment.userId) ?? segment.userId} (${schedule.name})`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
