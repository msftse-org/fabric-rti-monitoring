import { useMemo } from 'react';
import { DAY, HOUR, scheduleView, type Lookup, type Schedule, type Segment } from '@oncall';
import { utc } from '../lib/fabric';
import { toneOf } from './ui';

interface Row {
  id: string;
  label: string;
  sub: string;
  segments: Segment[];
  kind: 'final' | 'layer' | 'override';
}

function tickFormat(span: number) {
  if (span <= DAY) return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
}

export function Gantt({ schedule, from, to, now, lk }: { schedule: Schedule; from: number; to: number; now: number; lk: Lookup }) {
  const view = useMemo(() => scheduleView(schedule, from, to), [schedule, from, to]);
  const span = to - from;
  const step = span <= DAY ? 3 * HOUR : DAY;
  const ticks = Array.from({ length: Math.floor(span / step) }, (_, index) => from + index * step);
  const format = tickFormat(span);
  const pct = (t: number) => `${((t - from) / span) * 100}%`;
  const rows: Row[] = [
    { id: 'final', label: 'Final schedule', sub: 'Resolved from layers and overrides', segments: view.final, kind: 'final' },
    ...schedule.layers.map((layer, index) => ({
      id: layer.id,
      label: layer.name,
      sub: `Layer ${index + 1} · ${layer.shiftHours === 168 ? 'weekly' : `${layer.shiftHours} h`} shifts`,
      segments: view.layers[index]?.segments ?? [],
      kind: 'layer' as const,
    })),
    { id: 'overrides', label: 'Overrides', sub: `${schedule.overrides.length} override row${schedule.overrides.length === 1 ? '' : 's'}`, segments: view.overrides, kind: 'override' },
  ];
  const showNow = now >= from && now <= to;

  return (
    <div className="gantt-scroll">
      <div className="gantt">
        <div className="gantt__row gantt__row--axis">
          <div className="gantt__label" aria-hidden />
          <div className="gantt__track gantt__track--axis" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="gantt__tick" style={{ left: pct(t) }}>
                {format.format(t)}
              </span>
            ))}
            {showNow && (
              <span className="gantt__now-label" style={{ left: pct(now) }}>
                Now
              </span>
            )}
          </div>
        </div>
        {rows.map((row) => (
          <div key={row.id} className={`gantt__row gantt__row--${row.kind}`}>
            <div className="gantt__label">
              <strong>{row.label}</strong>
              <span>{row.sub}</span>
            </div>
            <ul className="gantt__track" aria-label={`${row.label} shifts`}>
              {ticks.map((t) => (
                <li key={`grid-${t}`} className="gantt__grid" style={{ left: pct(t) }} aria-hidden />
              ))}
              {row.segments.map((segment) => {
                const user = lk.users.get(segment.userId);
                const tone = toneOf(segment.userId);
                const live = segment.start <= now && segment.end > now;
                return (
                  <li
                    key={`${segment.userId}-${segment.start}`}
                    className={`gantt__seg ${live ? 'gantt__seg--live' : ''}`}
                    style={{ left: pct(segment.start), width: `calc(${((segment.end - segment.start) / span) * 100}% - 2px)`, background: tone.bg, color: tone.fg, borderColor: tone.solid }}
                    title={`${user?.name ?? segment.userId}: ${utc(segment.start)} to ${utc(segment.end)}`}
                  >
                    <span className="gantt__name">{user?.name ?? segment.userId}</span>
                    <span className="sr-only">
                      {' '}
                      from {utc(segment.start)} to {utc(segment.end)}
                      {live ? ', on call now' : ''}
                    </span>
                  </li>
                );
              })}
              {row.segments.length === 0 && <li className="gantt__none">{row.kind === 'override' ? 'No overrides in this range' : 'Nobody in this range'}</li>}
              {showNow && <li className="gantt__now" style={{ left: pct(now) }} aria-hidden />}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
