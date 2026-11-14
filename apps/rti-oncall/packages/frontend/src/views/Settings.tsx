import { AlarmClock, Bell, Contact, Mail, MessageSquare, Phone, RotateCcw, Smartphone, Trash2, UserCog } from 'lucide-react';
import { DAY, dateTime, duration, shiftsFor, type Channel, type NotificationRule, type Urgency } from '@oncall';
import { Button, Card, CapabilityList, CodeBlock, CounterpartLink, Disclosure, Person, SupportBadge, ViewHeader } from '../components/ui';
import { capability, CHANNEL_FABRIC, CHANNEL_ROUTE } from '../lib/fabric';
import { useData, useOnCall } from '../lib/oncall';
import { href, paths } from '../lib/router';
import { useToast } from '../lib/toast';

const CHANNEL_ICON: Record<Channel, typeof Bell> = { push: Bell, chat: MessageSquare, email: Mail, sms: Smartphone, voice: Phone };

function RuleList({ rules, urgency }: { rules: NotificationRule[]; urgency: Urgency }) {
  return (
    <ol className="prefs" aria-label={`${urgency === 'high' ? 'High' : 'Low'} urgency notification rules`}>
      {[...rules]
        .sort((a, b) => a.delayMinutes - b.delayMinutes)
        .map((rule, index) => {
          const Icon = CHANNEL_ICON[rule.channel];
          return (
            <li key={`${rule.channel}-${rule.delayMinutes}-${index}`} className="prefs__row">
              <span className="prefs__when">{rule.delayMinutes ? `After ${rule.delayMinutes} min` : 'Immediately'}</span>
              <span className="prefs__icon" aria-hidden>
                <Icon size={14} />
              </span>
              <span className="prefs__what">
                <strong>{CHANNEL_FABRIC[rule.channel]}</strong>
                <span className="muted small">{CHANNEL_ROUTE[rule.channel]}</span>
              </span>
            </li>
          );
        })}
    </ol>
  );
}

export function Settings() {
  const { me, model, lk, now, actions, reset, localRuleCount, resetRules } = useOnCall();
  const { mode, fellBack } = useData();
  const notify = useToast();
  const shifts = shiftsFor(me.id, model.schedules, now, now + 14 * DAY).slice(0, 6);
  const channels = capability('channels');
  const badge = channels ? <SupportBadge support={channels.support} /> : undefined;
  const prefsKql = `OnCallRoster
| where UserId == '${me.id}'
| project Name, Email, TimeZone, Preferences`;

  return (
    <>
      <ViewHeader eyebrow="OnCallRoster table · your profile" title="Notification settings" actions={<CounterpartLink path="/settings" />}>
        How the paging flow reaches {me.name}. Preferences live in OnCallRoster.Preferences and are read by the flow on every step.
      </ViewHeader>

      <div className="grid grid--main">
        <div className="stack">
          <Card title="High urgency" icon={Bell} subtitle="Pages that need someone now" actions={badge}>
            <RuleList rules={me.preferences.high} urgency="high" />
          </Card>
          <Card title="Low urgency" icon={Bell} subtitle="Pages that can wait for working hours" actions={badge}>
            <RuleList rules={me.preferences.low} urgency="low" />
          </Card>
          <Card title="Shift reminders" icon={AlarmClock} subtitle="The recurrence flow that posts handovers also messages you in Teams an hour before each shift">
            {shifts.length ? (
              <ul className="shifts">
                {shifts.map((shift) => {
                  const schedule = lk.schedules.get(shift.scheduleId);
                  const live = shift.start <= now && shift.end > now;
                  return (
                    <li key={`${shift.scheduleId}-${shift.start}`}>
                      <span className="shifts__when">
                        <strong>{dateTime(shift.start)}</strong>
                        <span className="muted small">for {duration(shift.end - shift.start)}</span>
                      </span>
                      <a href={href(paths.schedule(shift.scheduleId))}>{schedule?.name}</a>
                      <span className={`badge ${live ? 'badge--success' : 'badge--outline'}`}>{live ? 'On call now' : `Reminder ${dateTime(shift.start - 3_600_000)}`}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No shifts in the next 14 days.</p>
            )}
            <CapabilityList ids={['handover']} />
          </Card>
        </div>
        <div className="stack">
          <Card title="Profile" icon={UserCog}>
            <Person user={me} size={40} sub={me.title} />
            <ul className="contacts">
              <li>
                <Mail size={14} aria-hidden />
                <span>
                  <strong>{me.email}</strong>
                  <span className="muted small">Outlook and Teams (Microsoft Entra ID account)</span>
                </span>
              </li>
              <li>
                <Smartphone size={14} aria-hidden />
                <span>
                  <strong>{me.phone}</strong>
                  <span className="muted small">SMS and voice through Azure Communication Services</span>
                </span>
              </li>
              <li>
                <Contact size={14} aria-hidden />
                <span>
                  <strong>{me.timezone}</strong>
                  <span className="muted small">Used for off-hours and shift reminders</span>
                </span>
              </li>
            </ul>
            <p className="small">
              Member of{' '}
              {me.teamIds.map((teamId, index) => (
                <span key={teamId}>
                  {index > 0 && ', '}
                  <a href={href(paths.team(teamId))}>{lk.teams.get(teamId)?.name}</a>
                </span>
              ))}
            </p>
            <Disclosure summary="Your OnCallRoster row">
              <CodeBlock code={prefsKql} title="KQL queryset · oncall" />
            </Disclosure>
          </Card>
          <Card title="How this works in Fabric">
            <CapabilityList ids={['channels', 'chat-actions', 'snooze-reassign', 'mobile']} />
          </Card>
          <Card title="Demo" icon={RotateCcw}>
            <p className="small">
              Data: {mode === 'live' ? 'live from the local API' : fellBack ? 'bundled snapshot (API unreachable)' : 'bundled snapshot'}. {actions.length} demo action{actions.length === 1 ? '' : 's'} stored in this browser.
            </p>
            <Button
              icon={<RotateCcw size={14} aria-hidden />}
              disabled={!actions.length}
              onClick={() => {
                reset();
                notify('Demo actions cleared', 'Pages are back to the state computed from Eventhouse data.', 'info');
              }}
            >
              Reset demo actions
            </Button>
            <p className="small">
              {localRuleCount} local demo rule{localRuleCount === 1 ? '' : 's'} stored in this browser. Live Fabric alerts are not affected by demo resets.
            </p>
            <Button
              icon={<Trash2 size={14} aria-hidden />}
              disabled={!localRuleCount}
              onClick={() => {
                if (!window.confirm(`Delete ${localRuleCount} local demo rule${localRuleCount === 1 ? '' : 's'} and the simulated pages they raised?`)) return;
                resetRules();
                notify('Local demo rules deleted', 'Live Fabric alerts were not changed.', 'info');
              }}
            >
              Delete local demo rules
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
