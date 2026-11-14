import { useState } from 'react';
import { CalendarClock, CircleAlert, Clock, Plus, Route as RouteIcon, ShieldCheck, Users, Workflow } from 'lucide-react';
import { clock, shiftAround, type Lookup, type RoutingRule, type SupportHours, type Team } from '@oncall';
import { NewPageDialog } from '../components/dialogs';
import { PageTable } from '../components/oncall';
import { targetSummary } from '../components/flow';
import { AvatarStack, Card, CapabilityList, CodeBlock, Command, CommandBar, CounterpartLink, Crumbs, Disclosure, EmptyState, Person, ViewHeader } from '../components/ui';
import { conditionKql, conditionText, flowName, routingActionText, ruleQuery } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, paths } from '../lib/router';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function daysText(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  if (sorted.join() === '1,2,3,4,5') return 'Mon to Fri';
  return sorted.map((day) => DAY_NAMES[day]).join(', ');
}

export function hoursText(hours: SupportHours): string {
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  return `${daysText(hours.days)}, ${pad(hours.startHour)} to ${pad(hours.endHour)} (${hours.timezone})`;
}

function OnCallNow({ team, lk, now }: { team: Team; lk: Lookup; now: number }) {
  const schedule = lk.schedules.get(team.scheduleIds[0]);
  const current = schedule ? shiftAround(schedule, now).current : null;
  const user = current ? lk.users.get(current.userId) : undefined;
  return user && current ? <Person user={user} size={24} sub={`until ${clock(current.end)} UTC`} /> : <span className="muted">Nobody</span>;
}

export function TeamsList() {
  const { model, lk, now } = useOnCall();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ViewHeader eyebrow="OnCallTeams table" title="Teams" actions={<CounterpartLink path="/teams" />}>
        Teams own Activator rules, routing rules in OnCallRouting, schedules and an escalation flow.
      </ViewHeader>
      <CommandBar label="Team commands">
        <Command icon={Plus} label="Page a team" primary onClick={() => setCreating(true)} />
        <Command icon={Workflow} label="Escalation flows" href={href(paths.escalations())} />
      </CommandBar>
      <Card flush>
        <div className="table-wrap">
          <table className="table table--cards">
            <caption className="sr-only">Teams</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Members</th>
                <th scope="col">Services</th>
                <th scope="col">On call now</th>
                <th scope="col">Escalation flow</th>
                <th scope="col" className="num">
                  Open alerts
                </th>
              </tr>
            </thead>
            <tbody>
              {model.teams.map((team) => {
                const open = model.pages.filter((page) => page.teamId === team.id && page.status !== 'resolved').length;
                const policy = lk.policies.get(team.escalationPolicyId);
                return (
                  <tr key={team.id}>
                    <td data-label="Team">
                      <a href={href(paths.team(team.id))} className="team-link">
                        <span className="team-chip__dot" style={{ background: team.color }} aria-hidden />
                        <span>
                          <strong>{team.name}</strong>
                          <span className="cell-sub">@{team.handle}</span>
                        </span>
                      </a>
                    </td>
                    <td data-label="Members">
                      <AvatarStack users={team.memberIds.map((id) => lk.users.get(id))} size={24} max={5} />
                    </td>
                    <td data-label="Services">
                      <span className="chips">
                        {team.services.length ? team.services.map((service) => <span key={service} className="chip">{service}</span>) : <span className="muted">Cluster-wide</span>}
                      </span>
                    </td>
                    <td data-label="On call now">
                      <OnCallNow team={team} lk={lk} now={now} />
                    </td>
                    <td data-label="Escalation flow">{policy ? <a href={href(paths.escalation(policy.id))}>{policy.name}</a> : '-'}</td>
                    <td data-label="Open alerts" className="num">
                      {open ? (
                        <span className="badge badge--danger">
                          <CircleAlert size={12} aria-hidden />
                          {open} open
                        </span>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="How teams work in Fabric" icon={ShieldCheck}>
        <CapabilityList ids={['teams', 'access', 'cross-org']} />
      </Card>
      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function RuleCard({ rule, index, lk }: { rule: RoutingRule; index: number; lk: Lookup }) {
  return (
    <li className="rrule">
      <div className="rrule__head">
        <span className="rrule__n" aria-hidden>
          {index + 1}
        </span>
        <strong>Rule {index + 1}</strong>
        <span className="muted small">{rule.conditions.length ? 'first match wins' : 'catch-all'}</span>
      </div>
      <div className="rrule__grid">
        <div>
          <div className="rrule__label">Condition</div>
          {rule.conditions.length ? (
            <ul className="chips">
              {rule.conditions.map((condition) => (
                <li key={condition.field} className="chip">
                  {conditionText(condition)}
                </li>
              ))}
            </ul>
          ) : (
            <span className="chip">Every alert</span>
          )}
          <code className="inline-code rrule__kql">| where {conditionKql(rule)}</code>
        </div>
        <div>
          <div className="rrule__label">Then</div>
          <ul className="rrule__actions">
            {rule.actions.map((action, actionIndex) => (
              <li key={actionIndex}>
                {action.kind === 'escalation' ? <Workflow size={13} aria-hidden /> : <RouteIcon size={13} aria-hidden />}
                <span>
                  {routingActionText(action, lk)}
                  {action.kind === 'escalation' && action.ackTimeoutMinutes ? `; re-escalate ${action.ackTimeoutMinutes} min after an unresolved acknowledgment` : ''}
                </span>
              </li>
            ))}
          </ul>
          {rule.supportHours && (
            <div className="rrule__hours">
              <Clock size={13} aria-hidden />
              Support hours: {hoursText(rule.supportHours)}. Outside them the flow waits with "Delay until".
            </div>
          )}
        </div>
      </div>
      <div className="rrule__dd">
        Datadog routing query: <code>{ruleQuery(rule)}</code>
      </div>
    </li>
  );
}

export function TeamDetail({ id }: { id: string }) {
  const { model, lk, now } = useOnCall();
  const [creating, setCreating] = useState(false);
  const team = lk.teams.get(id);
  if (!team) {
    return (
      <>
        <Crumbs items={[{ label: 'Teams', to: paths.teams() }, { label: id }]} />
        <EmptyState icon={Users} title={`Team ${id} does not exist`}>
          <a href={href(paths.teams())}>Back to teams</a>
        </EmptyState>
      </>
    );
  }
  const policy = lk.policies.get(team.escalationPolicyId);
  const open = model.pages.filter((page) => page.teamId === team.id && page.status !== 'resolved');
  const recent = model.pages.filter((page) => page.teamId === team.id).slice(0, 8);
  const routingKql = `OnCallRouting
| where TeamId == '${team.id}'
| order by RuleOrder asc`;

  return (
    <>
      <Crumbs items={[{ label: 'Teams', to: paths.teams() }, { label: team.name }]} />
      <ViewHeader eyebrow={`Team · @${team.handle}`} title={team.name} actions={<CounterpartLink path={paths.team(team.id)} />}>
        {team.description}
      </ViewHeader>
      <CommandBar label="Team commands">
        <Command icon={Plus} label={`Page ${team.name}`} primary onClick={() => setCreating(true)} />
        {policy && <Command icon={Workflow} label="Open escalation flow" href={href(paths.escalation(policy.id))} />}
        <Command icon={CalendarClock} label="Schedules" href={href(paths.schedule(team.scheduleIds[0]))} />
      </CommandBar>

      <div className="grid grid--main">
        <div className="stack">
          <Card title="Routing rules" icon={RouteIcon} subtitle={`Evaluated in order by the "${flowName(team)}" flow`}>
            <ol className="rrules">
              {team.routingRules.map((rule, index) => (
                <RuleCard key={rule.id} rule={rule} index={index} lk={lk} />
              ))}
            </ol>
            <Disclosure summary="OnCallRouting rows for this team">
              <CodeBlock code={routingKql} title="KQL queryset · oncall" note="Conditions, support hours and actions are dynamic columns the flow reads on every alert." />
            </Disclosure>
          </Card>
          <Card title="Active alerts" icon={CircleAlert} flush>
            <PageTable pages={open} caption={`Active alerts for ${team.name}`} empty="No open alerts for this team" showTeam={false} />
          </Card>
          <Card title="Recent pages" flush actions={<a href={href(paths.pages(team.name))}>All {team.name} pages</a>}>
            <PageTable pages={recent} caption={`Recent pages for ${team.name}`} empty="No pages yet" showTeam={false} />
          </Card>
        </div>
        <div className="stack">
          <Card title="Members" icon={Users} subtitle={`${team.memberIds.length} people`}>
            <ul className="people">
              {team.memberIds.map((userId) => {
                const user = lk.users.get(userId);
                return (
                  <li key={userId}>
                    <Person user={user} sub={user?.title} />
                    {team.adminIds.includes(userId) && <span className="badge badge--outline">Admin</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="Schedules" icon={CalendarClock}>
            <ul className="people">
              {team.scheduleIds.map((scheduleId) => {
                const schedule = lk.schedules.get(scheduleId);
                if (!schedule) return null;
                const { current } = shiftAround(schedule, now);
                return (
                  <li key={scheduleId}>
                    <span className="stack-sm">
                      <a href={href(paths.schedule(scheduleId))}>{schedule.name}</a>
                      <span className="muted small">{schedule.layers.length} layer{schedule.layers.length === 1 ? '' : 's'} · {schedule.timezone}</span>
                    </span>
                    {current ? <Person user={lk.users.get(current.userId)} size={22} sub={`until ${clock(current.end)} UTC`} /> : <span className="muted">Nobody</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
          {policy && (
            <Card title="Escalation flow" icon={Workflow} actions={<a href={href(paths.escalation(policy.id))}>Open</a>}>
              <ol className="mini-steps">
                {policy.steps.map((step, index) => (
                  <li key={step.id}>
                    <span className="mini-steps__n">{index + 1}</span>
                    <span>
                      {targetSummary(step, lk)}
                      <span className="muted small"> · wait {step.escalateAfterMinutes} min</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="muted small">
                Repeats {policy.repeat} time{policy.repeat === 1 ? '' : 's'}; {policy.resolveAfterExhausted ? 'resolves when exhausted' : 'stays open when exhausted'}.
              </p>
            </Card>
          )}
          <Card title="Chat channel" icon={RouteIcon}>
            <p>
              <code className="inline-code">#{team.chatChannel}</code> in Microsoft Teams receives Activator messages for this team.
            </p>
          </Card>
          <Card title="How this works in Fabric">
            <CapabilityList ids={['routing', 'support-hours', 'urgency', 'chat-route']} />
          </Card>
        </div>
      </div>
      {creating && <NewPageDialog teamId={team.id} onClose={() => setCreating(false)} />}
    </>
  );
}
