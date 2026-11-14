import { useState } from 'react';
import { Clock, MessagesSquare, PhoneCall, Plus } from 'lucide-react';
import { clock, onCallAt, ruleQuery, shiftAround, type RoutingRule, type Team } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { navigate, paths } from '../../lib/router';
import { useInert } from '../../lib/toast';
import { EmptyState, PageTabs, ServiceTag } from '../../components/ui';
import { Avatar, AvatarStack, PersonPill, Section, UrgencyChip } from '../../components/oncall/kit';
import { PagesTable, dayRange, hourLabel } from './shared';
import { PolicyFlow } from './PoliciesPage';

export function TeamsPage() {
  const { model, lk, now, me } = useOnCall();
  const [mine, setMine] = useState(false);
  const teams = mine ? model.teams.filter((team) => team.memberIds.includes(me.id)) : model.teams;
  return (
    <div className="oc-body">
      <header className="oc-head oc-head--split">
        <div>
          <h1 className="oc-head__title">Teams</h1>
          <p className="oc-head__sub muted">Teams receive Pages through their routing rules. Mention a team with its @oncall handle.</p>
        </div>
        <div className="segmented" role="group" aria-label="Teams scope">
          <button type="button" className="segmented__btn" aria-pressed={!mine} onClick={() => setMine(false)}>
            All Teams
          </button>
          <button type="button" className="segmented__btn" aria-pressed={mine} onClick={() => setMine(true)}>
            My Teams
          </button>
        </div>
      </header>
      <div className="card oc-listcard scroll-x">
        <table className="table oc-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Handle</th>
              <th>Members</th>
              <th>On call now</th>
              <th>Escalation policy</th>
              <th className="num">Active Pages</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const primary = lk.schedules.get(team.scheduleIds[0]);
              const active = model.pages.filter((page) => page.teamId === team.id && page.status !== 'resolved').length;
              return (
                <tr key={team.id} className="row-link" onClick={() => navigate(paths.oncallTeam(team.id))}>
                  <td>
                    <a className="oc-teamname" href={`#${paths.oncallTeam(team.id)}`} onClick={(event) => event.stopPropagation()}>
                      <span className="oc-team__mark oc-team__mark--lg" style={{ background: team.color }} aria-hidden="true">
                        {team.name[0]}
                      </span>
                      <span>
                        <b>{team.name}</b>
                        <span className="muted oc-teamname__desc">{team.description}</span>
                      </span>
                    </a>
                  </td>
                  <td className="mono">@{team.handle}</td>
                  <td>
                    <AvatarStack ids={team.memberIds} max={5} />
                  </td>
                  <td>
                    <PersonPill userId={primary ? onCallAt(primary, now) : null} />
                  </td>
                  <td>
                    <a href={`#${paths.oncallPolicy(team.escalationPolicyId)}`} onClick={(event) => event.stopPropagation()}>
                      {lk.policies.get(team.escalationPolicyId)?.name}
                    </a>
                  </td>
                  <td className="num">
                    <span className={active ? 'oc-count oc-count--alert' : 'oc-count'}>{active}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RuleCard({ rule, index }: { rule: RoutingRule; index: number }) {
  const { lk } = useOnCall();
  const query = ruleQuery(rule);
  const label = index === 0 ? 'IF' : query === '*' ? 'ELSE' : 'ELSE IF';
  return (
    <li className="oc-rule">
      <span className={`oc-rule__badge oc-rule__badge--${label === 'IF' ? 'if' : label === 'ELSE' ? 'else' : 'elseif'}`}>{label}</span>
      <div className="oc-rule__body">
        <div className="oc-rule__cond">
          <span className="muted">Routing conditions:</span> <code className="oc-query oc-query--inline">{query === '*' ? '* (all Pages)' : query}</code>
        </div>
        {rule.supportHours && (
          <div className="oc-support">
            <Clock size={13} aria-hidden="true" />
            <span>
              <strong>Support hours</strong> {dayRange(rule.supportHours.days)}, {hourLabel(rule.supportHours.startHour)} – {hourLabel(rule.supportHours.endHour)} <span className="muted">({rule.supportHours.timezone})</span>. Outside these hours, notifications wait for the next window.
            </span>
          </div>
        )}
        <ul className="oc-rule__actions">
          {rule.actions.map((action, actionIndex) =>
            action.kind === 'escalation' ? (
              <li key={actionIndex}>
                <PhoneCall size={13} aria-hidden="true" />
                Page escalation policy <a href={`#${paths.oncallPolicy(action.policyId)}`}>{lk.policies.get(action.policyId)?.name}</a> with urgency <UrgencyChip urgency={action.urgency} />
                {action.ackTimeoutMinutes ? <span className="muted"> · re-trigger if not resolved {action.ackTimeoutMinutes} min after acknowledgment</span> : null}
              </li>
            ) : (
              <li key={actionIndex}>
                <MessagesSquare size={13} aria-hidden="true" />
                Send a Slack message to <span className="mono">#{action.channel}</span>
              </li>
            ),
          )}
        </ul>
      </div>
    </li>
  );
}

const TEAM_TABS = [
  { id: 'oncall', label: 'On-Call' },
  { id: 'members', label: 'Members' },
  { id: 'pages', label: 'Pages' },
];

export function TeamPage({ id }: { id: string }) {
  const { lk, model, now } = useOnCall();
  const inert = useInert();
  const [tab, setTab] = useState('oncall');
  const team: Team | undefined = lk.teams.get(id);
  if (!team) {
    return (
      <EmptyState title="Team not found" action={<a className="btn" href={`#${paths.oncallTeams()}`}>All teams</a>}>
        No team with ID “{id}”.
      </EmptyState>
    );
  }
  const policy = lk.policies.get(team.escalationPolicyId);
  const pages = model.pages.filter((page) => page.teamId === team.id);
  const active = pages.filter((page) => page.status !== 'resolved');

  return (
    <div className="oc-body">
      <nav className="oc-crumbs" aria-label="Breadcrumb">
        <a href={`#${paths.oncallTeams()}`}>Teams</a> / <span>{team.name}</span>
      </nav>
      <header className="oc-head oc-head--split oc-teamhead">
        <div className="oc-teamhead__id">
          <span className="oc-team__mark oc-team__mark--xl" style={{ background: team.color }} aria-hidden="true">
            {team.name[0]}
          </span>
          <div>
            <h1 className="oc-head__title">{team.name}</h1>
            <div className="oc-teamhead__meta">
              <span className="mono">@{team.handle}</span>
              <span className="muted">{team.memberIds.length} members</span>
              {team.services.map((service) => (
                <ServiceTag key={service} name={service} />
              ))}
            </div>
            <p className="muted oc-teamhead__desc">{team.description}</p>
          </div>
        </div>
      </header>
      <PageTabs tabs={TEAM_TABS.map((item) => (item.id === 'pages' ? { ...item, badge: String(active.length) } : item))} current={tab} onSelect={setTab} />

      {tab === 'oncall' && (
        <div className="oc-teamgrid">
          <Section
            title="Routing Rules"
            className="oc-teamgrid__rules"
            actions={
              <button type="button" className="btn" onClick={inert}>
                <Plus size={14} aria-hidden="true" /> Add Rule
              </button>
            }
          >
            <p className="muted oc-card__intro">Rules are evaluated in order; the first rule that matches a Page decides how it is handled.</p>
            <ol className="oc-rules">
              {team.routingRules.map((rule, index) => (
                <RuleCard key={rule.id} rule={rule} index={index} />
              ))}
            </ol>
          </Section>
          <Section title="Schedules" className="oc-teamgrid__schedules">
            <ul className="oc-schedlist">
              {team.scheduleIds.map((scheduleId) => {
                const schedule = lk.schedules.get(scheduleId)!;
                const { current, next } = shiftAround(schedule, now);
                return (
                  <li key={scheduleId}>
                    <a href={`#${paths.oncallSchedule(scheduleId)}`}>
                      <b>{schedule.name}</b>
                    </a>
                    <div className="oc-schedlist__row">
                      <span className="muted">Now</span>
                      <PersonPill userId={current?.userId ?? null} />
                      {current && <span className="muted">until {clock(current.end)} UTC</span>}
                    </div>
                    <div className="oc-schedlist__row">
                      <span className="muted">Next</span>
                      <PersonPill userId={next?.userId ?? null} />
                      {next && <span className="muted">from {clock(next.start)} UTC</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section
            title="Escalation Policy"
            className="oc-teamgrid__policy"
            actions={
              policy && (
                <a className="link-btn" href={`#${paths.oncallPolicy(policy.id)}`}>
                  {policy.name}
                </a>
              )
            }
          >
            {policy && <PolicyFlow policy={policy} />}
          </Section>
          <Section title="Chat" className="oc-teamgrid__chat">
            <p className="oc-chat">
              <MessagesSquare size={14} aria-hidden="true" /> Slack <span className="mono">#{team.chatChannel}</span>
            </p>
          </Section>
          <Section title={`Active Pages (${active.length})`} className="oc-teamgrid__pages">
            <PagesTable pages={active} empty="No active Pages for this team." compact />
          </Section>
        </div>
      )}

      {tab === 'members' && (
        <div className="card oc-listcard scroll-x">
          <table className="table oc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Title</th>
                <th>Email</th>
                <th>Time zone</th>
              </tr>
            </thead>
            <tbody>
              {team.memberIds.map((userId) => {
                const member = lk.users.get(userId)!;
                return (
                  <tr key={userId}>
                    <td>
                      <span className="oc-person">
                        <Avatar user={member} size={24} />
                        <b>{member.name}</b>
                        {userId === model.currentUserId && <span className="oc-tag">You</span>}
                      </span>
                    </td>
                    <td>{team.adminIds.includes(userId) ? <span className="oc-tag oc-tag--admin">Admin</span> : 'Member'}</td>
                    <td>{member.title}</td>
                    <td className="mono">{member.email}</td>
                    <td>{member.timezone}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pages' && (
        <div className="card oc-listcard">
          <PagesTable pages={pages} status="all" empty="No Pages for this team in the last 7 days." />
        </div>
      )}
    </div>
  );
}
