import { useMemo, useState } from 'react';
import { CalendarClock, CalendarRange, ChevronLeft, ChevronRight, Download, Layers, RotateCcw, UserCog } from 'lucide-react';
import { DAY, dateTime, HOUR, ONCALL_TABLES_KQL, scheduleView, shiftAround, toIcs, type Layer, type Lookup, type Schedule } from '@oncall';
import { Gantt } from '../components/gantt';
import { AvatarStack, Button, Card, CapabilityList, CodeBlock, Command, CommandBar, CounterpartLink, Crumbs, Disclosure, EmptyState, Person, Segmented, ViewHeader, toneOf } from '../components/ui';
import { downloadFile, utc } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, paths } from '../lib/router';
import { daysText } from './Teams';

type Zoom = '1d' | '1w' | '2w';
const SPAN: Record<Zoom, number> = { '1d': DAY, '1w': 7 * DAY, '2w': 14 * DAY };

const startOfDay = (t: number) => Math.floor(t / DAY) * DAY;

function WeekStrip({ schedule, now, lk }: { schedule: Schedule; now: number; lk: Lookup }) {
  const from = startOfDay(now);
  const to = from + 7 * DAY;
  const { final } = useMemo(() => scheduleView(schedule, from, to), [schedule, from, to]);
  const pct = (t: number) => ((t - from) / (to - from)) * 100;
  return (
    <div className="weekstrip" role="img" aria-label={`Next 7 days: ${final.map((segment) => `${lk.users.get(segment.userId)?.name} ${dateTime(segment.start)} to ${dateTime(segment.end)}`).join('; ')}`}>
      {final.map((segment) => {
        const tone = toneOf(segment.userId);
        return <span key={`${segment.userId}-${segment.start}`} className="weekstrip__seg" style={{ left: `${pct(segment.start)}%`, width: `${pct(segment.end) - pct(segment.start)}%`, background: tone.solid }} title={`${lk.users.get(segment.userId)?.name}: ${utc(segment.start)} to ${utc(segment.end)}`} />;
      })}
      <span className="weekstrip__now" style={{ left: `${pct(now)}%` }} />
    </div>
  );
}

export function SchedulesList() {
  const { model, lk, now } = useOnCall();
  return (
    <>
      <ViewHeader eyebrow="OnCallShifts table" title="Schedules" actions={<CounterpartLink path="/schedules" />}>
        Rotations are computed by this app and stored as shift rows in the Eventhouse. Fabric has no native on-call scheduler.
      </ViewHeader>
      <CommandBar label="Schedule commands">
        <Command icon={CalendarRange} label="Open first schedule" primary href={href(paths.schedule(model.schedules[0].id))} />
      </CommandBar>
      <Card flush>
        <div className="table-wrap">
          <table className="table table--cards">
            <caption className="sr-only">Schedules</caption>
            <thead>
              <tr>
                <th scope="col">Schedule</th>
                <th scope="col">Team</th>
                <th scope="col">On call now</th>
                <th scope="col">Next</th>
                <th scope="col">Next 7 days</th>
              </tr>
            </thead>
            <tbody>
              {model.schedules.map((schedule) => {
                const team = lk.teams.get(schedule.teamId);
                const { current, next } = shiftAround(schedule, now);
                return (
                  <tr key={schedule.id}>
                    <td data-label="Schedule">
                      <a href={href(paths.schedule(schedule.id))} className="strong-link">
                        {schedule.name}
                      </a>
                      <span className="cell-sub">
                        {schedule.layers.length} layer{schedule.layers.length === 1 ? '' : 's'} · {schedule.timezone}
                      </span>
                    </td>
                    <td data-label="Team">
                      <a href={href(paths.team(schedule.teamId))} className="team-chip">
                        <span className="team-chip__dot" style={{ background: team?.color }} aria-hidden />
                        {team?.name}
                      </a>
                    </td>
                    <td data-label="On call now">{current ? <Person user={lk.users.get(current.userId)} size={24} sub={`until ${dateTime(current.end)}`} /> : <span className="muted">Nobody</span>}</td>
                    <td data-label="Next">{next ? <Person user={lk.users.get(next.userId)} size={24} sub={`from ${dateTime(next.start)}`} /> : <span className="muted">-</span>}</td>
                    <td data-label="Next 7 days" className="cell-strip">
                      <WeekStrip schedule={schedule} now={now} lk={lk} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="How schedules work in Fabric" icon={CalendarClock}>
        <CapabilityList ids={['schedules', 'overrides', 'calendar', 'handover']} />
      </Card>
    </>
  );
}

function layerText(layer: Layer) {
  const shift = layer.shiftHours === 168 ? 'Weekly' : layer.shiftHours === 24 ? 'Daily' : `${layer.shiftHours}-hour`;
  return `${shift} handoff from ${utc(Date.parse(layer.rotationStart))}`;
}

export function ScheduleDetail({ id }: { id: string }) {
  const { model, lk, now } = useOnCall();
  const [zoom, setZoom] = useState<Zoom>('1w');
  const [offset, setOffset] = useState(0);
  const schedule = lk.schedules.get(id);
  if (!schedule) {
    return (
      <>
        <Crumbs items={[{ label: 'Schedules', to: paths.schedules() }, { label: id }]} />
        <EmptyState icon={CalendarClock} title={`Schedule ${id} does not exist`}>
          <a href={href(paths.schedules())}>Back to schedules</a>
        </EmptyState>
      </>
    );
  }
  const span = SPAN[zoom];
  const base = zoom === '1d' ? startOfDay(now) : startOfDay(now) - DAY;
  const from = base + offset * span;
  const to = from + span;
  const team = lk.teams.get(schedule.teamId);
  const { current, next } = shiftAround(schedule, now);
  const exportIcs = () => {
    const view = scheduleView(schedule, startOfDay(now), startOfDay(now) + 14 * DAY);
    downloadFile(`${schedule.id}.ics`, toIcs(schedule, view.final, model.users, model.now), 'text/calendar');
  };
  const shiftsKql = `OnCallShifts
| where ScheduleId == '${schedule.id}' and EndTime > now() and StartTime < now() + 14d
| summarize arg_max(Precedence, UserId) by StartTime, EndTime
| order by StartTime asc`;

  return (
    <>
      <Crumbs items={[{ label: 'Schedules', to: paths.schedules() }, { label: schedule.name }]} />
      <ViewHeader eyebrow={`Schedule · ${team?.name ?? schedule.teamId}`} title={schedule.name} actions={<CounterpartLink path={paths.schedule(schedule.id)} />}>
        {schedule.layers.length} layer{schedule.layers.length === 1 ? '' : 's'}, {schedule.overrides.length} override{schedule.overrides.length === 1 ? '' : 's'}, time zone {schedule.timezone}.
      </ViewHeader>
      <CommandBar
        label="Schedule commands"
        end={
          <Segmented
            label="Zoom"
            value={zoom}
            onChange={(value) => {
              setZoom(value);
              setOffset(0);
            }}
            options={[
              { value: '1d', label: '1 day' },
              { value: '1w', label: '1 week' },
              { value: '2w', label: '2 weeks' },
            ]}
          />
        }
      >
        <Command icon={Download} label="Export .ics" primary onClick={exportIcs} title="Final schedule for the next 14 days" />
        <Command icon={UserCog} label="Team" href={href(paths.team(schedule.teamId))} />
      </CommandBar>

      <div className="kpis kpis--2">
        <div className="kpi">
          <div className="kpi__label">On call now</div>
          <div className="kpi__person">{current ? <Person user={lk.users.get(current.userId)} size={32} sub={`until ${utc(current.end)}`} /> : 'Nobody'}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Next handoff</div>
          <div className="kpi__person">{next ? <Person user={lk.users.get(next.userId)} size={32} sub={`from ${utc(next.start)}`} /> : 'None scheduled'}</div>
        </div>
      </div>

      <Card
        title="Timeline"
        icon={CalendarRange}
        subtitle={`${dateTime(from)} to ${dateTime(to)} UTC`}
        actions={
          <div className="pager">
            <Button size="sm" variant="subtle" aria-label="Previous range" icon={<ChevronLeft size={16} aria-hidden />} onClick={() => setOffset((value) => value - 1)} />
            <Button size="sm" variant="subtle" icon={<RotateCcw size={14} aria-hidden />} onClick={() => setOffset(0)} disabled={offset === 0}>
              Today
            </Button>
            <Button size="sm" variant="subtle" aria-label="Next range" icon={<ChevronRight size={16} aria-hidden />} onClick={() => setOffset((value) => value + 1)} />
          </div>
        }
      >
        <Gantt schedule={schedule} from={from} to={to} now={now} lk={lk} />
        <p className="muted small">Later layers win over earlier ones; overrides win over every layer. Times in UTC, sampled every 30 minutes.</p>
      </Card>

      <div className="grid grid--split">
        <Card title="Layers" icon={Layers}>
          <ol className="layers">
            {schedule.layers.map((layer, index) => (
              <li key={layer.id}>
                <div className="layers__head">
                  <strong>
                    Layer {index + 1}: {layer.name}
                  </strong>
                  <span className="muted small">{layerText(layer)}</span>
                </div>
                <div className="layers__members">
                  <AvatarStack users={layer.memberIds.map((userId) => lk.users.get(userId))} size={24} max={8} />
                  <span className="small">Rotation: {layer.memberIds.map((userId) => lk.users.get(userId)?.name.split(' ')[0] ?? userId).join(' → ')}</span>
                </div>
                {layer.restriction && (
                  <div className="small muted">
                    Restriction: {daysText(layer.restriction.days)}, {String(layer.restriction.startHour).padStart(2, '0')}:00 to {String(layer.restriction.endHour).padStart(2, '0')}:00 {schedule.timezone}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Overrides" icon={UserCog} subtitle="Rows with the highest precedence in OnCallShifts">
          {schedule.overrides.length ? (
            <ul className="people">
              {schedule.overrides.map((item) => (
                <li key={item.id}>
                  <Person user={lk.users.get(item.userId)} size={26} sub={`${dateTime(item.start)} to ${dateTime(item.end)} UTC (${Math.round((item.end - item.start) / HOUR)} h)`} />
                  <span className="small muted">{item.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No overrides">Covering for someone writes an override row.</EmptyState>
          )}
        </Card>
      </div>

      <Card title="Backed by an Eventhouse table" icon={CalendarClock} subtitle="This app writes the computed shifts; the paging flow reads them">
        <CodeBlock code={shiftsKql} title="KQL queryset · shifts for this schedule" />
        <Disclosure summary="Eventhouse table definitions">
          <CodeBlock code={ONCALL_TABLES_KQL} title="KQL database · oncall" note="Run once in the KQL database to create the on-call tables." />
        </Disclosure>
        <CapabilityList ids={['schedules', 'overrides', 'calendar', 'handover']} />
      </Card>
    </>
  );
}
