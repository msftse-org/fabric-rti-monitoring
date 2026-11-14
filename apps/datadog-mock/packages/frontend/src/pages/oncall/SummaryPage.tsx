import { useMemo } from 'react';
import { CalendarClock, ChevronRight, PhoneCall } from 'lucide-react';
import { DAY, ago, clock, dateTime, duration, onCallAt, shiftAround, shiftsFor } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { paths } from '../../lib/router';
import { Avatar, PersonPill, Section, StatusPill, TeamPill } from '../../components/oncall/kit';
import { PagesTable, describeEvent } from './shared';

export function SummaryPage() {
  const ctx = useOnCall();
  const { model, me, now, lk } = ctx;

  const shifts = useMemo(() => shiftsFor(me.id, model.schedules, now - DAY, now + 14 * DAY), [me.id, model.schedules, now]);
  const current = shifts.filter((shift) => shift.start <= now && shift.end > now);
  const next = shifts.find((shift) => shift.start > now);
  const myTeams = model.teams.filter((item) => item.memberIds.includes(me.id));
  const otherTeams = model.teams.filter((item) => !item.memberIds.includes(me.id));
  const active = model.pages.filter((page) => page.status !== 'resolved');
  const mine = active.filter((page) => page.responderIds.includes(me.id));

  const activity = useMemo(
    () =>
      model.pages
        .flatMap((page) => page.events.filter((event) => event.kind !== 'routed' && event.kind !== 'held').map((event) => ({ page, event })))
        .filter(({ event }) => event.at <= now)
        .sort((a, b) => b.event.at - a.event.at)
        .slice(0, 12),
    [model.pages, now],
  );

  return (
    <div className="oc-body">
      <header className="oc-head">
        <div>
          <h1 className="oc-head__title">Summary</h1>
          <p className="oc-head__sub muted">Welcome back, {me.name.split(' ')[0]}. Your shifts, your teams and the Pages that need attention.</p>
        </div>
      </header>

      <div className="oc-summary">
        <Section title="My On-Call" className="oc-summary__me">
          <div className="oc-me">
            <Avatar user={me} size={44} />
            <div className="oc-me__who">
              <strong>{me.name}</strong>
              <span className="muted">{me.title}</span>
            </div>
            {current.length ? (
              <span className="oc-oncall-badge oc-oncall-badge--on">
                <PhoneCall size={12} aria-hidden="true" /> On call now
              </span>
            ) : (
              <span className="oc-oncall-badge">Not on call</span>
            )}
          </div>
          <ul className="oc-shifts">
            {current.map((shift) => (
              <li key={`${shift.scheduleId}-${shift.start}`}>
                <span className="oc-dot oc-dot--on" aria-hidden="true" />
                <div className="grow">
                  <a href={`#${paths.oncallSchedule(shift.scheduleId)}`}>{lk.schedules.get(shift.scheduleId)?.name}</a>
                  <div className="muted">
                    Until {dateTime(shift.end)} UTC · ends in {duration(shift.end - now)}
                  </div>
                </div>
              </li>
            ))}
            {next && (
              <li>
                <CalendarClock size={15} className="muted" aria-hidden="true" />
                <div className="grow">
                  Next shift: <a href={`#${paths.oncallSchedule(next.scheduleId)}`}>{lk.schedules.get(next.scheduleId)?.name}</a>
                  <div className="muted">
                    {dateTime(next.start)} – {dateTime(next.end)} UTC · starts in {duration(next.start - now)}
                  </div>
                </div>
              </li>
            )}
            {!current.length && !next && <li className="muted">No shifts in the next two weeks.</li>}
          </ul>
          <div className="oc-me__stats">
            <a href={`#${paths.oncallPages()}`}>
              <strong>{mine.length}</strong>
              <span>Pages assigned to me</span>
            </a>
            <a href={`#${paths.oncallPages()}`}>
              <strong>{active.length}</strong>
              <span>Active Pages</span>
            </a>
            <a href={`#${paths.oncallSettings()}`}>
              <strong>{me.preferences.high.length + me.preferences.low.length}</strong>
              <span>Notification rules</span>
            </a>
          </div>
        </Section>

        <Section
          title="My Teams"
          className="oc-summary__teams"
          actions={
            <a className="link-btn" href={`#${paths.oncallTeams()}`}>
              All teams <ChevronRight size={13} aria-hidden="true" />
            </a>
          }
        >
          <ul className="oc-teamcards">
            {[...myTeams, ...otherTeams].map((item) => {
              const open = active.filter((page) => page.teamId === item.id).length;
              return (
                <li key={item.id} className="oc-teamcard">
                  <div className="oc-teamcard__head">
                    <TeamPill team={item} />
                    {item.memberIds.includes(me.id) && <span className="oc-tag">My team</span>}
                    <span className="grow" />
                    <span className={open ? 'oc-count oc-count--alert' : 'oc-count'} title={`${open} active Pages`}>
                      {open} active
                    </span>
                  </div>
                  <div className="oc-teamcard__handle mono muted">@{item.handle}</div>
                  <ul className="oc-teamcard__oncall">
                    {item.scheduleIds.map((id) => {
                      const schedule = lk.schedules.get(id)!;
                      const { current: shift } = shiftAround(schedule, now);
                      return (
                        <li key={id}>
                          <a className="muted truncate" href={`#${paths.oncallSchedule(id)}`}>
                            {schedule.name}
                          </a>
                          <PersonPill userId={onCallAt(schedule, now)} />
                          {shift && <span className="muted oc-teamcard__until">until {clock(shift.end)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          title={
            <>
              Active Pages <span className="oc-count">{active.length}</span>
            </>
          }
          className="oc-summary__pages"
          actions={
            <a className="link-btn" href={`#${paths.oncallPages()}`}>
              View all Pages <ChevronRight size={13} aria-hidden="true" />
            </a>
          }
        >
          <PagesTable pages={active} empty="No active Pages. Enjoy the quiet." compact />
        </Section>

        <Section title="Recent activity" className="oc-summary__activity">
          <ol className="oc-activity">
            {activity.map(({ page, event }, index) => {
              const view = describeEvent(event, page, ctx);
              const Icon = view.icon;
              return (
                <li key={`${page.id}-${event.at}-${index}`}>
                  <span className={`oc-tl__icon oc-tl__icon--${view.tone}`} aria-hidden="true">
                    <Icon size={12} />
                  </span>
                  <div className="grow oc-activity__main">
                    <div className="oc-activity__page truncate">
                      <a href={`#${paths.oncallPage(page.id, 'all')}`} title={page.title}>
                        #{page.id} {page.title}
                      </a>
                    </div>
                    <div className="oc-activity__text">{view.body}</div>
                    <div className="oc-activity__meta">
                      <StatusPill status={page.status} />
                      <span className="muted" title={`${dateTime(event.at)} UTC`}>
                        {ago(event.at, now)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>
      </div>
    </div>
  );
}
