import { BellRing, CalendarClock, Mail, MessagesSquare, Phone, Plus, Smartphone, Workflow } from 'lucide-react';
import { DAY, MINUTE, dateTime, shiftAround, shiftsFor, type Channel, type NotificationRule, type Urgency, type User } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { paths } from '../../lib/router';
import { useInert, useToast } from '../../lib/toast';
import { Avatar, PersonPill, Section, TeamPill } from '../../components/oncall/kit';
import { CHANNELS } from '../../components/oncall/channels';

const REMINDER_MINUTES = 10;

function slackHandle(user: User): string {
  return `@${user.email.split('@')[0]}`;
}

function targetFor(channel: Channel, user: User): string {
  switch (channel) {
    case 'push':
      return 'Apple iPhone (iOS 18.1) - Datadog iOS';
    case 'sms':
      return `${user.phone} (SMS)`;
    case 'voice':
      return user.phone;
    case 'email':
      return user.email;
    case 'chat':
      return `Slack direct message ${slackHandle(user)}`;
  }
}

function delayLabel(minutes: number): string {
  if (minutes === 0) return 'Immediately';
  return `After ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function RulesCard({ urgency, rules, user }: { urgency: Urgency; rules: NotificationRule[]; user: User }) {
  const inert = useInert();
  return (
    <Section
      title={`When a ${urgency}-urgency Page is triggered`}
      actions={
        <button type="button" className="btn" onClick={inert}>
          <Plus size={13} aria-hidden="true" /> Add rule
        </button>
      }
    >
      <table className="table oc-table oc-rules-table">
        <tbody>
          {[...rules]
            .sort((a, b) => a.delayMinutes - b.delayMinutes)
            .map((rule, index) => {
              const { icon: Icon, label } = CHANNELS[rule.channel];
              return (
                <tr key={`${rule.channel}-${rule.delayMinutes}-${index}`}>
                  <th scope="row" className="oc-rules-table__when">
                    {delayLabel(rule.delayMinutes)}
                  </th>
                  <td>
                    <span className="oc-cellrow">
                      <Icon size={15} aria-label={label} />
                      {targetFor(rule.channel, user)}
                    </span>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </Section>
  );
}

export function SettingsPage() {
  const { me, model, lk, now } = useOnCall();
  const notify = useToast();
  const inert = useInert();
  const nextShift = shiftsFor(me.id, model.schedules, now, now + 14 * DAY).find((shift) => shift.start > now);
  const mySchedules = model.schedules.filter((schedule) => schedule.layers.some((layer) => layer.memberIds.includes(me.id)));

  const test = (what: string) => () => notify(`Test ${what} sent to ${me.name} (demo only)`);

  return (
    <div className="oc-body">
      <header className="oc-head oc-head--split">
        <div className="oc-profile">
          <Avatar user={me} size={48} />
          <div>
            <h1 className="oc-head__title">{me.name}</h1>
            <div className="muted">
              {me.title} · {me.timezone}
            </div>
            <div className="oc-profile__teams">
              {me.teamIds.map((id) => (
                <TeamPill key={id} team={lk.teams.get(id)} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="oc-settings">
        <Section
          title="Contact Methods"
          className="oc-settings__wide"
          actions={
            <button type="button" className="btn" onClick={inert}>
              <Plus size={13} aria-hidden="true" /> Add Contact Method
            </button>
          }
        >
          <div className="scroll-x">
            <table className="table oc-table oc-contact-table">
              <tbody>
                <tr>
                  <th scope="row" className="oc-contact__kind">
                    <Phone size={15} aria-hidden="true" /> Phone
                  </th>
                  <td>
                    <span className="oc-cellrow">
                      {me.phone} <span className="oc-badge oc-badge--ok">SMS enabled</span>
                    </span>
                  </td>
                  <td className="oc-contact__actions">
                    <button type="button" className="btn" onClick={test('call')}>
                      Test Call
                    </button>
                    <button type="button" className="btn" onClick={test('SMS')}>
                      Test SMS
                    </button>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="oc-contact__kind">
                    <Mail size={15} aria-hidden="true" /> Email
                  </th>
                  <td>
                    <span className="oc-cellrow">
                      {me.email} <span className="oc-badge">HTML</span>
                    </span>
                  </td>
                  <td className="oc-contact__actions">
                    <button type="button" className="btn" onClick={test('email')}>
                      Test Email
                    </button>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="oc-contact__kind">
                    <Smartphone size={15} aria-hidden="true" /> Mobile App
                  </th>
                  <td>Apple iPhone (iOS 18.1) - Datadog iOS</td>
                  <td className="oc-contact__actions">
                    <button type="button" className="btn" onClick={test('push notification')}>
                      Test Push
                    </button>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="oc-contact__kind">
                    <MessagesSquare size={15} aria-hidden="true" /> Slack
                  </th>
                  <td className="mono">{slackHandle(me)}</td>
                  <td className="oc-contact__actions" />
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <RulesCard urgency="high" rules={me.preferences.high} user={me} />
        <RulesCard urgency="low" rules={me.preferences.low} user={me} />

        <Section title="Shift reminders">
          <p className="oc-reminder">
            <CalendarClock size={15} aria-hidden="true" />
            <span>
              Remind me <strong>{REMINDER_MINUTES} minutes before</strong> my on-call shift starts, via <strong>SMS</strong> and <strong>Push</strong>.
            </span>
          </p>
          {nextShift ? (
            <p className="muted oc-reminder__next">
              Next reminder: {dateTime(nextShift.start - REMINDER_MINUTES * MINUTE)} UTC for {lk.schedules.get(nextShift.scheduleId)?.name}.
            </p>
          ) : (
            <p className="muted oc-reminder__next">No shifts in the next two weeks.</p>
          )}
        </Section>

        <Section title="Handover Automations" className="oc-settings__wide">
          <p className="muted oc-card__intro">When a shift changes hands, Datadog runs these actions for the incoming responder.</p>
          <ul className="oc-handover">
            {mySchedules.map((schedule) => {
              const team = lk.teams.get(schedule.teamId)!;
              const { next } = shiftAround(schedule, now);
              return (
                <li key={schedule.id}>
                  <div className="oc-handover__head">
                    <a href={`#${paths.oncallSchedule(schedule.id)}`}>
                      <b>{schedule.name}</b>
                    </a>
                    {next && (
                      <span className="oc-cellrow muted">
                        Next handover {dateTime(next.start)} UTC to <PersonPill userId={next.userId} />
                      </span>
                    )}
                  </div>
                  <ul className="oc-handover__actions">
                    <li>
                      <Workflow size={13} aria-hidden="true" /> Run Workflow <span className="mono">on-call-handover-checklist</span>
                    </li>
                    <li>
                      <MessagesSquare size={13} aria-hidden="true" /> Slack: send a message to <span className="mono">#{team.chatChannel}</span>
                    </li>
                    <li>
                      <MessagesSquare size={13} aria-hidden="true" /> Slack: update the channel topic of <span className="mono">#{team.chatChannel}</span> with who is on call
                    </li>
                    <li>
                      <MessagesSquare size={13} aria-hidden="true" /> Slack: update user group <span className="mono">@{team.handle}</span>
                    </li>
                    <li>
                      <BellRing size={13} aria-hidden="true" /> Microsoft Teams: send a message to <span className="mono">{team.name} › On-Call</span>
                    </li>
                  </ul>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}
