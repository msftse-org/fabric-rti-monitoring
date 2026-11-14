import { useMemo, useState } from 'react';
import { ArrowLeftRight, Bell, CalendarClock, CircleAlert, Clock, GitCompareArrows, Plus, RefreshCw, Timer, UserCheck, Users, Workflow } from 'lucide-react';
import { CAPABILITIES, clock, computeAnalytics, duration, shiftAround, SUPPORT_LABEL, WHO_IS_ON_CALL_KQL, type Support } from '@oncall';
import { NewPageDialog } from '../components/dialogs';
import { PageTable, PagingFlowSteps, PagingFlowStrip } from '../components/oncall';
import { Card, CodeBlock, Command, CommandBar, CounterpartLink, Disclosure, Kpi, Person, SupportBadge, ViewHeader } from '../components/ui';
import { SUPPORT_ORDER } from '../lib/fabric';
import { useData, useOnCall } from '../lib/oncall';
import { href, paths } from '../lib/router';

function WhoIsOnCall() {
  const { model, lk, now } = useOnCall();
  return (
    <ul className="oncall-now">
      {model.teams.map((team) => (
        <li key={team.id} className="oncall-now__team">
          <a className="oncall-now__name" href={href(paths.team(team.id))}>
            <span className="team-chip__dot" style={{ background: team.color }} aria-hidden />
            {team.name}
          </a>
          <ul className="oncall-now__rows">
            {team.scheduleIds.map((scheduleId) => {
              const schedule = lk.schedules.get(scheduleId);
              if (!schedule) return null;
              const { current, next } = shiftAround(schedule, now);
              return (
                <li key={scheduleId}>
                  <Person
                    user={current ? lk.users.get(current.userId) : undefined}
                    size={28}
                    sub={
                      <>
                        <a href={href(paths.schedule(schedule.id))}>{schedule.name}</a>
                        {current ? ` · until ${clock(current.end)} UTC` : ' · nobody on call'}
                      </>
                    }
                  />
                  {next && (
                    <span className="oncall-now__next" title={`Next shift starts ${clock(next.start)} UTC`}>
                      Next {lk.users.get(next.userId)?.name.split(' ')[0]} at {clock(next.start)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Parity() {
  const counts = SUPPORT_ORDER.map((support) => ({ support, count: CAPABILITIES.filter((item) => item.support === support).length }));
  const total = CAPABILITIES.length;
  return (
    <div className="parity">
      <div className="parity__bar" role="img" aria-label={counts.map(({ support, count }) => `${SUPPORT_LABEL[support]}: ${count}`).join(', ')}>
        {counts.map(({ support, count }) => (
          <span key={support} className={`parity__seg parity__seg--${support}`} style={{ flexGrow: count }} />
        ))}
      </div>
      <ul className="parity__list">
        {counts.map(({ support, count }) => (
          <li key={support}>
            <SupportBadge support={support as Support} />
            <span className="parity__count">
              {count} <span>of {total}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted">
        Every Datadog On-Call capability mapped to a Fabric approach. Gaps are listed with their workaround, not hidden.
      </p>
    </div>
  );
}

export function Overview() {
  const { model, now } = useOnCall();
  const { refresh, mode } = useData();
  const [creating, setCreating] = useState(false);
  const stats = useMemo(() => computeAnalytics(model), [model]);
  const open = model.pages.filter((page) => page.status !== 'resolved');
  const triggered = open.filter((page) => page.status === 'triggered');
  const high = open.filter((page) => page.urgency === 'high');
  const mine = open.filter((page) => page.responderIds.includes(model.currentUserId));

  return (
    <>
      <ViewHeader eyebrow="Real-Time Intelligence" title="On-Call overview" actions={<CounterpartLink path="/" />}>
        Activator alerts, schedules and escalation flows over Eventhouse data. As of {clock(now)} UTC ({mode === 'live' ? 'live' : 'snapshot'}).
      </ViewHeader>
      <CommandBar label="Overview commands" end={<Command icon={RefreshCw} label="Refresh" onClick={refresh} />}>
        <Command icon={Plus} label="New page" primary onClick={() => setCreating(true)} />
        <Command icon={Bell} label="All pages" href={href(paths.pages())} />
        <Command icon={CalendarClock} label="Schedules" href={href(paths.schedules())} />
        <Command icon={GitCompareArrows} label="Compare with Datadog" href={href(paths.compare())} />
      </CommandBar>

      <div className="kpis">
        <Kpi icon={CircleAlert} label="Open alerts" value={open.length} hint={`${triggered.length} triggered, ${open.length - triggered.length} acknowledged`} tone={triggered.length ? 'danger' : undefined} />
        <Kpi icon={Bell} label="High urgency open" value={high.length} hint={`${mine.length} include you`} tone={high.length ? 'warning' : undefined} />
        <Kpi icon={Timer} label="MTTA, 7 days" value={duration(stats.mttaMs)} hint={`Median across ${stats.acknowledged} acknowledged`} />
        <Kpi icon={Clock} label="MTTR, 7 days" value={duration(stats.mttrMs)} hint={`${stats.pages} pages, ${stats.high} high urgency`} />
      </div>

      <Card title="Active alerts" icon={CircleAlert} subtitle="Triggered and acknowledged pages" actions={<a href={href(paths.pages())}>View all pages</a>} flush>
        <PageTable pages={open} caption="Active alerts" empty="No open alerts" />
      </Card>

      <div className="grid grid--split">
        <Card title="Who is on call now" icon={UserCheck} subtitle={`Resolved from OnCallShifts at ${clock(now)} UTC`}>
          <WhoIsOnCall />
          <Disclosure summary="Who-is-on-call query">
            <CodeBlock code={WHO_IS_ON_CALL_KQL} title="KQL queryset · oncall" note="The paging flow runs this query to resolve schedule targets." />
          </Disclosure>
        </Card>
        <Card title="Datadog parity" icon={ArrowLeftRight} subtitle={`${CAPABILITIES.length} Datadog On-Call capabilities`} actions={<a href={href(paths.compare())}>Open the matrix</a>}>
          <Parity />
        </Card>
      </div>

      <Card title="How a page flows through Fabric" icon={Workflow} subtitle="Eventhouse to responder and back">
        <PagingFlowStrip />
        <Disclosure summary="Power Automate paging flow, step by step" icon={Users}>
          <PagingFlowSteps />
        </Disclosure>
      </Card>
      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </>
  );
}
