import { useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { DAY, HOUR, clock, dateTime, onCallAt, scheduleView, shiftAround, shiftsFor, toIcs, type Schedule, type Segment } from '@oncall';
import { downloadText, useOnCall } from '../../lib/oncall';
import { useDismiss } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { useInert, useToast } from '../../lib/toast';
import { EmptyState, Segmented } from '../../components/ui';
import { Avatar, AvatarStack, PersonPill, Section, TeamPill } from '../../components/oncall/kit';
import { dayRange, hourLabel } from './shared';

const EXPORT_DAYS = 14;

function shiftLength(hours: number): string {
  if (hours % 168 === 0) return hours === 168 ? '1 week' : `${hours / 168} weeks`;
  if (hours % 24 === 0) return hours === 24 ? '1 day' : `${hours / 24} days`;
  return `${hours} hours`;
}

export function SchedulesPage() {
  const { model, now, me, team } = useOnCall();
  const notify = useToast();

  const exportMine = () => {
    const shifts = shiftsFor(me.id, model.schedules, now, now + EXPORT_DAYS * DAY);
    const calendar: Schedule = { ...model.schedules[0], id: `${me.id}-shifts`, name: `${me.name} on-call shifts`, layers: [], overrides: [] };
    downloadText(`${me.id}-on-call.ics`, toIcs(calendar, shifts, model.users, model.now), 'text/calendar');
    notify(`Exported ${shifts.length} shifts for the next ${EXPORT_DAYS} days`);
  };

  return (
    <div className="oc-body">
      <header className="oc-head oc-head--split">
        <div>
          <h1 className="oc-head__title">Schedules</h1>
          <p className="oc-head__sub muted">Who is on call, when. Layers rotate members; overrides win over every layer.</p>
        </div>
        <button type="button" className="btn" onClick={exportMine}>
          <Download size={14} aria-hidden="true" /> Export My Shifts
        </button>
      </header>
      <div className="card oc-listcard scroll-x">
        <table className="table oc-table">
          <thead>
            <tr>
              <th>Schedule</th>
              <th>Team</th>
              <th>On call now</th>
              <th>Next on call</th>
              <th>Layers</th>
              <th>Time zone</th>
            </tr>
          </thead>
          <tbody>
            {model.schedules.map((schedule) => {
              const { current, next } = shiftAround(schedule, now);
              const members = [...new Set(schedule.layers.flatMap((layer) => layer.memberIds))];
              return (
                <tr key={schedule.id} className="row-link" onClick={() => navigate(paths.oncallSchedule(schedule.id))}>
                  <td>
                    <a className="oc-schedname" href={`#${paths.oncallSchedule(schedule.id)}`} onClick={(event) => event.stopPropagation()}>
                      <CalendarDays size={15} aria-hidden="true" />
                      <b>{schedule.name}</b>
                    </a>
                  </td>
                  <td>
                    <TeamPill team={team(schedule.teamId)} link={false} />
                  </td>
                  <td>
                    <div className="oc-cellstack">
                      <PersonPill userId={current?.userId ?? null} />
                      {current && <span className="muted">until {dateTime(current.end)}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="oc-cellstack">
                      <PersonPill userId={next?.userId ?? null} />
                      {next && <span className="muted">from {dateTime(next.start)}</span>}
                    </div>
                  </td>
                  <td>
                    <span className="oc-cellrow">
                      {schedule.layers.length} <AvatarStack ids={members} max={4} size={20} />
                    </span>
                  </td>
                  <td>{schedule.timezone}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Zoom = '1d' | '1w' | '2w';

const ZOOM: Record<Zoom, { span: number; tick: number; label: string }> = {
  '1d': { span: DAY, tick: 3 * HOUR, label: '1 day' },
  '1w': { span: 7 * DAY, tick: DAY, label: '1 week' },
  '2w': { span: 14 * DAY, tick: DAY, label: '2 weeks' },
};

function handoff(rotationStart: string, hours: number): string {
  const at = Date.parse(rotationStart);
  if (hours % 168 === 0) return `Every ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(at)} at ${clock(at)} UTC`;
  if (hours === 24) return `Daily at ${clock(at)} UTC`;
  return `Every ${hours} hours from ${clock(at)} UTC`;
}

const startOfUtcDay = (ms: number) => Math.floor(ms / DAY) * DAY;

interface Picked {
  row: string;
  segment: Segment;
}

function GanttRow({ id, label, icon, segments, from, span, now, picked, onPick }: { id: string; label: string; icon?: boolean; segments: Segment[]; from: number; span: number; now: number; picked: Picked | null; onPick: (value: Picked | null) => void }) {
  const { user } = useOnCall();
  const inert = useInert();
  const ref = useRef<HTMLDivElement>(null);
  const open = picked?.row === id;
  useDismiss(open, () => onPick(null), ref);
  return (
    <div className="oc-gantt__row" role="row">
      <div className="oc-gantt__label" role="rowheader">
        {icon && <CalendarDays size={13} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="oc-gantt__track" role="cell" ref={ref}>
        {segments.map((segment) => {
          const person = user(segment.userId);
          const left = ((segment.start - from) / span) * 100;
          const width = ((segment.end - segment.start) / span) * 100;
          const isPicked = open && picked?.segment.start === segment.start;
          return (
            <button
              key={`${segment.userId}-${segment.start}`}
              type="button"
              className="oc-gantt__block"
              data-past={segment.end <= now}
              aria-pressed={isPicked}
              aria-label={`${person?.name ?? segment.userId}, ${dateTime(segment.start)} to ${dateTime(segment.end)} UTC`}
              style={{ left: `${left}%`, width: `${width}%`, background: person?.color }}
              onClick={() => onPick(isPicked ? null : { row: id, segment })}
            >
              <span className="oc-gantt__initials">{person?.initials}</span>
              <span className="oc-gantt__name">{person?.name}</span>
            </button>
          );
        })}
        {open && picked && (
          <div className="oc-gantt__pop" role="dialog" aria-label="Shift details" style={{ left: `${Math.min(70, Math.max(0, ((Math.max(picked.segment.start, from) - from) / span) * 100))}%` }}>
            <PersonPill userId={picked.segment.userId} />
            <dl>
              <dt>From</dt>
              <dd>{dateTime(picked.segment.start)} UTC</dd>
              <dt>To</dt>
              <dd>{dateTime(picked.segment.end)} UTC</dd>
            </dl>
            <button type="button" className="btn" onClick={inert}>
              <Plus size={13} aria-hidden="true" /> Override
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Gantt({ schedule }: { schedule: Schedule }) {
  const { now } = useOnCall();
  const [zoom, setZoom] = useState<Zoom>('1w');
  const [anchor, setAnchor] = useState(() => startOfUtcDay(now));
  const [picked, setPicked] = useState<Picked | null>(null);
  const { span, tick } = ZOOM[zoom];
  const from = zoom === '1d' ? anchor : anchor - DAY;
  const to = from + span;
  const view = useMemo(() => scheduleView(schedule, from, to), [schedule, from, to]);
  const ticks = Array.from({ length: Math.round(span / tick) }, (_, index) => from + index * tick);
  const nowPct = ((now - from) / span) * 100;
  const fmtDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="oc-gantt-wrap">
      <div className="oc-gantt__bar">
        <div className="oc-gantt__nav">
          <button type="button" className="btn btn--icon" aria-label="Previous period" onClick={() => setAnchor(anchor - span)}>
            <ChevronLeft size={15} />
          </button>
          <button type="button" className="btn" onClick={() => setAnchor(startOfUtcDay(now))}>
            Today
          </button>
          <button type="button" className="btn btn--icon" aria-label="Next period" onClick={() => setAnchor(anchor + span)}>
            <ChevronRight size={15} />
          </button>
          <span className="oc-gantt__range">
            {fmtDay.format(from)} – {fmtDay.format(to - 1)}
          </span>
        </div>
        <span className="grow" />
        <span className="muted oc-gantt__tz">Times in UTC · schedule time zone {schedule.timezone}</span>
        <Segmented
          label="Zoom"
          value={zoom}
          options={(Object.keys(ZOOM) as Zoom[]).map((value) => ({ value, label: ZOOM[value].label }))}
          onChange={(value) => {
            setZoom(value);
            setPicked(null);
          }}
        />
      </div>
      <div className="oc-gantt-scroll">
        <div className="oc-gantt" role="table" aria-label={`${schedule.name} timeline`}>
          <div className="oc-gantt__row oc-gantt__row--head" role="row">
            <div className="oc-gantt__label" role="columnheader">
              <span className="sr-only">Layer</span>
            </div>
            <div className="oc-gantt__track oc-gantt__ticks" role="columnheader">
              {ticks.map((t) => (
                <span key={t} className="oc-gantt__tick" style={{ left: `${((t - from) / span) * 100}%` }}>
                  {zoom === '1d' ? clock(t) : fmtDay.format(t)}
                </span>
              ))}
            </div>
          </div>
          <div className="oc-gantt__rows">
            <GanttRow id="final" label="Final Schedule" segments={view.final} from={from} span={span} now={now} picked={picked} onPick={setPicked} />
            {schedule.layers.map((layer, index) => (
              <GanttRow key={layer.id} id={layer.id} label={layer.name} icon segments={view.layers[index]?.segments ?? []} from={from} span={span} now={now} picked={picked} onPick={setPicked} />
            ))}
            <GanttRow id="overrides" label="Overrides" segments={view.overrides} from={from} span={span} now={now} picked={picked} onPick={setPicked} />
            <div className="oc-gantt__grid" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} style={{ left: `${((t - from) / span) * 100}%` }} />
              ))}
              {nowPct >= 0 && nowPct <= 100 && <span className="oc-gantt__now" style={{ left: `${nowPct}%` }} title={`Now, ${dateTime(now)} UTC`} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SchedulePage({ id }: { id: string }) {
  const { lk, model, now, team } = useOnCall();
  const inert = useInert();
  const notify = useToast();
  const schedule = lk.schedules.get(id);
  if (!schedule) {
    return (
      <EmptyState title="Schedule not found" action={<a className="btn" href={`#${paths.oncallSchedules()}`}>All schedules</a>}>
        No schedule with ID “{id}”.
      </EmptyState>
    );
  }
  const current = onCallAt(schedule, now);
  const { next } = shiftAround(schedule, now);
  const policies = model.policies.filter((policy) => policy.steps.some((step) => step.targets.some((target) => target.kind === 'schedule' && target.id === schedule.id)));

  const exportIcs = () => {
    const { final } = scheduleView(schedule, now, now + EXPORT_DAYS * DAY);
    downloadText(`${schedule.id}.ics`, toIcs(schedule, final, model.users, model.now), 'text/calendar');
    notify(`Exported ${final.length} shifts for the next ${EXPORT_DAYS} days`);
  };

  return (
    <div className="oc-body">
      <nav className="oc-crumbs" aria-label="Breadcrumb">
        <a href={`#${paths.oncallSchedules()}`}>Schedules</a> / <span>{schedule.name}</span>
      </nav>
      <header className="oc-head oc-head--split">
        <div>
          <h1 className="oc-head__title">{schedule.name}</h1>
          <div className="oc-owners">
            <span className="oc-owners__label">Team</span>
            <TeamPill team={team(schedule.teamId)} />
            <span className="oc-owners__label">On call now</span>
            <PersonPill userId={current} />
            {next && (
              <>
                <span className="oc-owners__label">Next</span>
                <PersonPill userId={next.userId} />
                <span className="muted">{dateTime(next.start)} UTC</span>
              </>
            )}
          </div>
        </div>
        <div className="oc-head__actions">
          <button type="button" className="btn" onClick={exportIcs}>
            <Download size={14} aria-hidden="true" /> Export
          </button>
          <button type="button" className="btn btn--primary" onClick={inert}>
            <Plus size={14} aria-hidden="true" /> Override
          </button>
        </div>
      </header>

      <Section title="Schedule">
        <Gantt schedule={schedule} />
      </Section>

      <div className="oc-schedgrid">
        <Section title={`Layers (${schedule.layers.length})`}>
          <ol className="oc-layers">
            {schedule.layers.map((layer) => (
              <li key={layer.id} className="oc-layer">
                <div className="oc-layer__head">
                  <CalendarDays size={14} aria-hidden="true" />
                  <strong>{layer.name}</strong>
                </div>
                <dl className="oc-kv">
                  <dt>Shift length</dt>
                  <dd>{shiftLength(layer.shiftHours)}</dd>
                  <dt>Handoff</dt>
                  <dd>{handoff(layer.rotationStart, layer.shiftHours)}</dd>
                  <dt>Starts</dt>
                  <dd>{dateTime(Date.parse(layer.rotationStart))} UTC</dd>
                  <dt>Restrictions</dt>
                  <dd>{layer.restriction ? `${dayRange(layer.restriction.days)}, ${hourLabel(layer.restriction.startHour)} – ${hourLabel(layer.restriction.endHour)} (${schedule.timezone})` : 'None (24/7)'}</dd>
                  <dt>Members</dt>
                  <dd>
                    <ol className="oc-members">
                      {layer.memberIds.map((userId) => (
                        <li key={userId}>
                          <PersonPill userId={userId} />
                        </li>
                      ))}
                    </ol>
                  </dd>
                </dl>
              </li>
            ))}
          </ol>
        </Section>
        <div className="oc-schedgrid__side">
          <Section title={`Overrides (${schedule.overrides.length})`}>
            {schedule.overrides.length ? (
              <ul className="oc-overrides">
                {schedule.overrides.map((override) => (
                  <li key={override.id}>
                    <Avatar user={lk.users.get(override.userId)} size={26} />
                    <div className="grow">
                      <strong>{lk.users.get(override.userId)?.name}</strong>
                      <div className="muted">
                        {dateTime(override.start)} – {dateTime(override.end)} UTC
                      </div>
                      <div className="oc-overrides__note">{override.note}</div>
                    </div>
                    {override.end < now ? <span className="oc-tag oc-tag--muted">Past</span> : override.start <= now ? <span className="oc-tag oc-tag--on">Active</span> : <span className="oc-tag">Upcoming</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="oc-empty">No overrides.</div>
            )}
          </Section>
          <Section title="Used by">
            <ul className="oc-usedby">
              {policies.map((policy) => (
                <li key={policy.id}>
                  <a href={`#${paths.oncallPolicy(policy.id)}`}>{policy.name}</a>
                </li>
              ))}
              {!policies.length && <li className="muted">Not used by an escalation policy.</li>}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
