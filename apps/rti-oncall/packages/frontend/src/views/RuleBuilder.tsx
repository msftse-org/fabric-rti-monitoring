import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Activity, Bell, Mail, MessageSquare, Plus, Sparkles, X, Zap, type LucideIcon } from 'lucide-react';
import {
  reflexDefinition,
  dateTime,
  DISPLAY_UNIT,
  draftToMonitor,
  duration,
  emptyDraft,
  evaluateMonitors,
  monitorSeries,
  formatMonitorValue,
  monitorToDraft,
  parseRecipients,
  RULE_WINDOWS,
  SERVICES,
  validateDraft,
  type AlertEpisode,
  type DraftErrors,
  type History,
  type Monitor,
  type MonitorSignal,
  type RuleDraft,
  type Team,
  type User,
} from '@oncall';
import { MonitorChart, StateStrip } from '../components/charts';
import { Button, Card, CodeBlock, CounterpartLink, Crumbs, Disclosure, EmptyState, Field, LinkButton, Segmented, StateBadge, ViewHeader } from '../components/ui';
import { ruleKql } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, navigate, paths } from '../lib/router';
import { useToast } from '../lib/toast';
import { alertError } from '../lib/liveAlerts';
import { LiveAlertsConnection } from '../components/live-alerts';

type Urgency = 'routing' | 'high' | 'low';

/** The form keeps thresholds as typed text so partial input does not jump around. */
interface Form {
  name: string;
  signal: MonitorSignal;
  service: string;
  comparison: 'above' | 'below';
  windowMinutes: number;
  warn: string;
  alert: string;
  teamId: string;
  priority: number;
  message: string;
  page: boolean;
  urgency: Urgency;
  teams: boolean;
  teamsTo: string[];
  email: boolean;
  emailTo: string[];
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const FIELD_ORDER: (keyof DraftErrors)[] = ['service', 'alert', 'warn', 'actions', 'teams', 'email', 'name', 'teamId'];
const FIELD_ID: Record<keyof DraftErrors, string> = {
  service: 'rb-service',
  alert: 'rb-alert',
  warn: 'rb-warn',
  actions: 'rb-teams-on',
  teams: 'rb-teams',
  email: 'rb-email',
  name: 'rb-name',
  teamId: 'rb-team',
};

const SIGNALS: { value: MonitorSignal; label: string }[] = [
  { value: 'error_rate', label: 'Error rate' },
  { value: 'p95_latency', label: 'p95 latency' },
  { value: 'request_rate', label: 'Request rate' },
  { value: 'no_data', label: 'Heartbeat' },
];

const SIGNAL_HINT: Record<MonitorSignal, string> = {
  error_rate: 'Share of server spans with an error status. Windows with fewer than 40 requests are skipped.',
  p95_latency: 'Request-weighted five-minute p95 approximation. Windows with fewer than 40 requests are skipped.',
  request_rate: 'Server spans per minute, averaged over the window. Silent 5-minute buckets count as zero.',
  no_data: 'Fires when no spans arrive for the chosen number of minutes.',
};

function toDraft(form: Form): RuleDraft {
  const number = (text: string) => (text.trim() === '' ? null : Number(text));
  return {
    name: form.name,
    signal: form.signal,
    service: form.service || null,
    comparison: form.comparison,
    windowMinutes: form.windowMinutes,
    warn: form.signal === 'no_data' ? null : number(form.warn),
    alert: number(form.alert),
    teamId: form.teamId,
    priority: form.priority,
    message: form.message,
    actions: {
      page: form.page ? { urgency: form.urgency } : null,
      teams: form.teams ? { recipients: form.teamsTo } : null,
      email: form.email ? { to: form.emailTo } : null,
    },
  };
}

function toForm(draft: RuleDraft, viewerEmail: string): Form {
  return {
    name: draft.name,
    signal: draft.signal,
    service: draft.service ?? '',
    comparison: draft.comparison,
    windowMinutes: draft.windowMinutes,
    warn: draft.warn === null ? '' : String(draft.warn),
    alert: draft.alert === null ? '' : String(draft.alert),
    teamId: draft.teamId,
    priority: draft.priority,
    message: draft.message,
    page: false,
    urgency: draft.actions.page?.urgency ?? 'routing',
    teams: Boolean(draft.actions.teams),
    teamsTo: (draft.actions.teams?.recipients ?? [viewerEmail]).filter((email) => email && !email.endsWith('.example')),
    email: Boolean(draft.actions.email),
    emailTo: (draft.actions.email?.to ?? []).filter((email) => !email.endsWith('.example')),
  };
}

function autoName(form: Pick<Form, 'signal' | 'service' | 'comparison'>): string {
  const where = form.service || 'the cluster';
  if (form.signal === 'no_data') return `No data from ${where}`;
  if (form.signal === 'p95_latency') return `${form.comparison === 'below' ? 'Unusually fast' : 'Slow'} p95 latency on ${where}`;
  if (form.signal === 'request_rate') return `${form.comparison === 'below' ? 'Traffic drop' : 'Traffic spike'} on ${where}`;
  return `${form.comparison === 'below' ? 'Low' : 'High'} error rate on ${where}`;
}

const round = (signal: MonitorSignal, value: number) => {
  if (signal === 'error_rate') return Math.max(0.1, Math.round(value * 1000) / 10);
  if (signal === 'p95_latency') return Math.max(1, value >= 100 ? Math.round(value / 10) * 10 : Math.round(value));
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
};

const LOOSE_TO_STRICT = [0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 0.98, 0.99, 0.995, 1];

/** Thresholds the rule would have crossed about twice (alert) and up to six times (warning) over the whole history. */
function suggest(form: Form, history: History, now: number): Pick<Form, 'warn' | 'alert'> {
  if (form.signal === 'no_data') return { warn: '', alert: '10' };
  const probe = (alert: number, comparison: 'above' | 'below') => draftToMonitor({ ...toDraft(form), name: 'probe', comparison, warn: null, alert }, 0, '', now);
  const values = monitorSeries(probe(form.signal === 'error_rate' ? 100 : 1e9, 'above'), history, now)
    .flatMap((point) => (point.value === null ? [] : [point.value]))
    .sort((a, b) => a - b);
  if (!values.length) return { warn: '', alert: form.signal === 'error_rate' ? '5' : form.signal === 'p95_latency' ? '800' : '10' };
  const below = form.comparison === 'below';
  const at = (ratio: number) => values[Math.min(values.length - 1, Math.floor(ratio * (values.length - 1)))];
  const candidates = [...new Set(LOOSE_TO_STRICT.map((ratio) => Math.max(0, round(form.signal, at(below ? 1 - ratio : ratio)))))];
  let warn: number | null = null;
  let alert = candidates[candidates.length - 1];
  for (const candidate of candidates) {
    const fired = evaluateMonitors([probe(candidate, form.comparison)], history, now).episodes.length;
    if (warn === null && fired <= 6) warn = candidate;
    if (fired <= 2) {
      alert = candidate;
      break;
    }
  }
  const ordered = warn !== null && (below ? warn > alert : warn < alert);
  return { alert: String(alert), warn: ordered ? String(warn) : '' };
}

function ownerOf(service: string, teams: Team[]): string | null {
  return teams.find((team) => team.services.includes(service))?.id ?? null;
}

export function RuleBuilder({ editId, fromId }: { editId?: number; fromId?: number | null }) {
  const { rules, liveAlerts } = useOnCall();
  if (editId !== undefined && !rules.some((rule) => rule.id === editId)) {
    return <><LiveAlertsConnection /><EmptyState title={liveAlerts.loading ? 'Loading the alert from Fabric' : 'Connect to load this alert'}>
      Sign in and refresh Fabric rules. <a href={href(paths.rules())}>Back to rules</a>
    </EmptyState></>;
  }
  return <RuleBuilderForm editId={editId} fromId={fromId} />;
}

function RuleBuilderForm({ editId, fromId }: { editId?: number; fromId?: number | null }) {
  const { model, lk, me, rules, saveRule, history, now, liveAlerts } = useOnCall();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const newId = useRef(Date.now() * 1024 + crypto.getRandomValues(new Uint32Array(1))[0] % 1024);
  const editing = editId !== undefined ? rules.find((rule) => rule.id === editId) : undefined;
  const source = fromId ? model.monitors.find((item) => item.id === fromId) : undefined;
  const [form, setForm] = useState<Form>(() => {
    if (editing) return toForm(monitorToDraft(editing), liveAlerts.email);
    if (source) return toForm({ ...monitorToDraft(source), name: `${source.name} (copy)` }, liveAlerts.email);
    const team = me.teamIds.find((id) => lk.teams.has(id)) ?? model.teams[0].id;
    const start = toForm(emptyDraft(team, liveAlerts.email), liveAlerts.email);
    const service = lk.teams.get(team)?.services[0] ?? start.service;
    const seeded = { ...start, service };
    return { ...seeded, ...suggest(seeded, history, now) };
  });
  const [nameTouched, setNameTouched] = useState(Boolean(editing || source));
  const [teamTouched, setTeamTouched] = useState(Boolean(editing || source));
  const [showErrors, setShowErrors] = useState(false);

  const draft = toDraft({ ...form, name: nameTouched ? form.name : autoName(form) });
  const errors = validateDraft(draft, model.teams);
  if (draft.actions.teams?.recipients.some((email) => /\.(example|invalid|test)$/i.test(email))) errors.teams = 'Use real Microsoft Teams recipients, not the demo roster.';
  if (draft.actions.email?.to.some((email) => /\.(example|invalid|test)$/i.test(email))) errors.email = 'Use real email recipients, not the demo roster.';
  const errorCount = Object.keys(errors).length;
  const shown = (key: keyof DraftErrors) => (showErrors ? errors[key] : undefined);
  const team = lk.teams.get(form.teamId);
  const heartbeat = form.signal === 'no_data';
  const unit = DISPLAY_UNIT[form.signal];

  const previewable = !errors.alert && !errors.warn && !errors.service;
  const monitor = previewable ? draftToMonitor({ ...draft, name: draft.name.trim() || 'New rule' }, editing?.id ?? 0, me.id, now) : null;

  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
  const changeSignal = (signal: MonitorSignal) =>
    setForm((current) => {
      const next: Form = { ...current, signal, comparison: signal === 'request_rate' ? 'below' : 'above', service: signal === 'no_data' ? current.service : current.service || 'checkout' };
      return { ...next, ...suggest(next, history, now) };
    });
  const changeService = (service: string) =>
    setForm((current) => {
      const owner = service ? ownerOf(service, model.teams) : null;
      return { ...current, service, ...(teamTouched || !owner ? {} : { teamId: owner }) };
    });

  const back = editing ? paths.rule(editing.id) : source ? paths.rule(source.id) : paths.rules();
  const save = async (enabled: boolean) => {
    if (busy) return;
    if (errorCount) {
      setShowErrors(true);
      const first = FIELD_ORDER.find((key) => errors[key]);
      if (first) document.getElementById(FIELD_ID[first])?.focus();
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const id = editing?.authored?.fabric ? editing.id : newId.current;
      const rule = draftToMonitor(draft, id, me.id, Date.now(), editing, enabled);
      rule.authored!.fabric = editing?.authored?.fabric;
      const saved = await saveRule(rule);
      notify(saved.authored?.enabled ? 'Alert running in Fabric' : 'Alert saved in Fabric, stopped', 'The KQL source, thresholds and native notification actions are persisted in your workspace.');
      navigate(paths.rule(saved.id));
    } catch (error) {
      setSaveError(alertError(error));
    } finally {
      setBusy(false);
    }
  };

  if (editId !== undefined && !editing) {
    return (
      <>
        <Crumbs items={[{ label: 'Activator rules', to: paths.rules() }, { label: String(editId) }]} />
        <EmptyState icon={Zap} title={model.monitors.some((item) => item.id === editId) ? 'Seeded rules cannot be edited' : `Rule ${editId} does not exist`}>
          {model.monitors.some((item) => item.id === editId) ? (
            <a href={href(paths.ruleNew(editId))}>Duplicate it as a rule you can edit</a>
          ) : (
            <a href={href(paths.rules())}>Back to Activator rules</a>
          )}
        </EmptyState>
      </>
    );
  }

  const title = editing ? `Edit ${editing.name}` : 'New alert rule';
  const members: User[] = [];
  const nativeRules = monitor && team ? reflexDefinition(monitor, { workspaceId: '', databaseItemId: '' }, team.name, { start: false, placeholderRecipient: '', now }).rules.filter((rule) => !rule.placeholder) : [];

  return (
    <>
      <Crumbs items={[{ label: 'Activator rules', to: paths.rules() }, ...(editing ? [{ label: editing.name, to: paths.rule(editing.id) }] : []), { label: editing ? 'Edit' : 'New rule' }]} />
      <ViewHeader eyebrow="Activator · rule builder" title={title} actions={<CounterpartLink path="/rules" label="Datadog monitors" />}>
        <span className="muted">Create a persistent Activator alert on your Eventhouse with native Teams and email actions. No CLI or separate import is required.</span>
      </ViewHeader>
      <LiveAlertsConnection />

      <form
        className="rb"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save(editing ? editing.authored?.enabled ?? true : true);
        }}
      >
        <div className="grid grid--main rb__grid">
          <div className="stack">
            <Card title="Monitor" icon={Activity} subtitle="The value Activator watches, per service">
              <div className="rb__fields">
                <Field label="Signal" hint={SIGNAL_HINT[form.signal]}>
                  <Segmented label="Signal" value={form.signal} onChange={changeSignal} options={SIGNALS} />
                </Field>
                <div className="rb__row">
                  <Field label="Service" htmlFor="rb-service">
                    <select id="rb-service" className="select" value={form.service} aria-invalid={Boolean(shown('service'))} onChange={(event) => changeService(event.target.value)}>
                      {heartbeat && <option value="">All services (otel-demo namespace)</option>}
                      {SERVICES.map((service) => (
                        <option key={service} value={service}>
                          {service}
                        </option>
                      ))}
                    </select>
                    {shown('service') && <p className="field__error">{errors.service}</p>}
                  </Field>
                  {!heartbeat && (
                    <Field label="Evaluation window" htmlFor="rb-window">
                      <select id="rb-window" className="select" value={form.windowMinutes} onChange={(event) => update({ windowMinutes: Number(event.target.value) })}>
                        {RULE_WINDOWS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            Last {minutes} minutes
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              </div>
            </Card>

            <Card
              title="Condition"
              icon={Zap}
              subtitle="Activator fires when the value crosses a threshold, and again only after it recovers"
              actions={
                !heartbeat && (
                  <Button size="sm" variant="subtle" icon={<Sparkles size={14} aria-hidden />} onClick={() => update(suggest(form, history, now))}>
                    Suggest from data
                  </Button>
                )
              }
            >
              <div className="rb__fields">
                {!heartbeat && (
                  <Field label="Fire when the value">
                    <Segmented
                      label="Direction"
                      value={form.comparison}
                      onChange={(comparison) => setForm((current) => ({ ...current, comparison, ...suggest({ ...current, comparison }, history, now) }))}
                      options={[
                        { value: 'above', label: 'Increases above' },
                        { value: 'below', label: 'Decreases below' },
                      ]}
                    />
                  </Field>
                )}
                <div className="rb__row">
                  <Field label={heartbeat ? 'No data for' : 'Alert threshold'} htmlFor="rb-alert">
                    <NumberInput id="rb-alert" value={form.alert} unit={unit} error={shown('alert')} onChange={(alert) => update({ alert })} />
                  </Field>
                  {!heartbeat && (
                    <Field label="Warning threshold" htmlFor="rb-warn" hint={!shown('warn') ? 'Optional. Leave empty for alert only.' : undefined}>
                      <NumberInput id="rb-warn" value={form.warn} unit={unit} error={shown('warn')} onChange={(warn) => update({ warn })} placeholder="None" />
                    </Field>
                  )}
                </div>
                <PreviewLine monitor={monitor} history={history} now={now} />
              </div>
            </Card>

            <Card title="Action" icon={Bell} subtitle="What happens when the rule fires">
              <div className="rb__actions" role="group" aria-label="Actions" aria-describedby={shown('actions') ? 'rb-actions-error' : undefined}>
                <ActionRow id="rb-teams-on" icon={MessageSquare} title="Send a Teams message" detail="Activator's built-in Teams action messages each recipient directly." checked={form.teams} onToggle={(teams) => update({ teams })}>
                  <Recipients id="rb-teams" label="Teams recipients" value={form.teamsTo} onChange={(teamsTo) => update({ teamsTo })} members={members} lookup={lk.users} error={shown('teams')} />
                  {liveAlerts.email && <Button size="sm" onClick={() => update({ teamsTo: [...new Set([...form.teamsTo, liveAlerts.email])] })}>Use my signed-in address</Button>}
                </ActionRow>
                <ActionRow id="rb-email-on" icon={Mail} title="Send an email" detail="Activator's built-in email action, sent from Fabric." checked={form.email} onToggle={(email) => update({ email })}>
                  <Recipients id="rb-email" label="Email recipients" value={form.emailTo} onChange={(emailTo) => update({ emailTo })} members={members} lookup={lk.users} error={shown('email')} />
                  {liveAlerts.email && <Button size="sm" onClick={() => update({ emailTo: [...new Set([...form.emailTo, liveAlerts.email])] })}>Use my signed-in address</Button>}
                </ActionRow>
                <p className="small muted">These actions send real notifications. The app's demo paging, SMS and escalation simulation is not part of this live alert.</p>
                {shown('actions') && (
                  <p className="field__error" id="rb-actions-error">
                    {errors.actions}
                  </p>
                )}
              </div>
            </Card>

            <Card title="Details">
              <div className="rb__fields">
                <Field label="Name" htmlFor="rb-name" hint={nameTouched ? undefined : 'Named from the monitor until you change it.'}>
                  <input
                    id="rb-name"
                    className="input"
                    value={nameTouched ? form.name : autoName(form)}
                    maxLength={100}
                    aria-invalid={Boolean(shown('name'))}
                    onChange={(event) => {
                      setNameTouched(true);
                      update({ name: event.target.value });
                    }}
                  />
                  {shown('name') && <p className="field__error">{errors.name}</p>}
                </Field>
                <div className="rb__row">
                  <Field label="Team" htmlFor="rb-team" hint={teamTouched ? undefined : 'Follows the service owner until you change it.'}>
                    <select
                      id="rb-team"
                      className="select"
                      value={form.teamId}
                      onChange={(event) => {
                        setTeamTouched(true);
                        update({ teamId: event.target.value });
                      }}
                    >
                      {model.teams.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (@{item.handle})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority" htmlFor="rb-priority" hint="Classification for responders; live actions use the recipients configured above.">
                    <select id="rb-priority" className="select" value={form.priority} onChange={(event) => update({ priority: Number(event.target.value) })}>
                      {[1, 2, 3, 4, 5].map((priority) => (
                        <option key={priority} value={priority}>
                          P{priority}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Message" htmlFor="rb-message" hint="Added to the Teams and email body.">
                  <textarea id="rb-message" className="textarea" rows={3} maxLength={2000} value={form.message} onChange={(event) => update({ message: event.target.value })} placeholder="What should the responder check first?" />
                </Field>
              </div>
            </Card>
          </div>

          <div className="stack">
            <Preview monitor={monitor} history={history} now={now} />
            {monitor && team && (
              <Card title="What this creates in Fabric" icon={Zap}>
                <ul className="rb-made">
                  {nativeRules.map((rule) => (
                    <li key={rule.name}>
                      <strong>{rule.name}</strong>
                      <span className="small">{rule.condition}</span>
                      <span className="small">{rule.action} notification</span>
                    </li>
                  ))}
                </ul>
                <p className="muted small rb-made__note">Save creates these actions directly in Fabric. Historical preview does not send notifications or prove delivery.</p>
              </Card>
            )}
            {monitor && (
              <Disclosure summary="KQL source for Activator">
                <CodeBlock code={ruleKql(monitor)} title="Activator KQL source" note="Activator runs this every 5 minutes and sets startTime and endTime to the window it reads." />
              </Disclosure>
            )}
          </div>
        </div>

        <div className="rb-bar">
          <div className="rb-bar__status" aria-live="polite">
            {showErrors && errorCount > 0 ? (
              <span className="field__error" role="alert">
                Fix {errorCount} {errorCount === 1 ? 'field' : 'fields'} to save the rule.
              </span>
            ) : (
              <span className="muted small">{busy ? 'Waiting for Fabric to persist the alert...' : 'Saved to your Fabric workspace. Starts only when you choose Save and start.'}</span>
            )}
            {saveError && <p className="field__error" role="alert">{saveError}</p>}
          </div>
          <div className="rb-bar__buttons">
            <LinkButton href={href(back)}>Cancel</LinkButton>
            {!editing && <Button disabled={busy || !liveAlerts.connected || liveAlerts.loading} onClick={() => void save(false)}>Save stopped in Fabric</Button>}
            <Button type="submit" variant="primary" disabled={busy || !liveAlerts.connected || liveAlerts.loading}>
              {busy ? 'Saving in Fabric...' : editing?.authored?.fabric ? 'Save changes in Fabric' : 'Save and start in Fabric'}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function NumberInput({ id, value, unit, error, onChange, placeholder }: { id: string; value: string; unit: string; error?: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <>
      <div className="rb-num">
        <input
          id={id}
          className="input"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : `${id}-unit`}
          onChange={(event) => onChange(event.target.value.replace(',', '.'))}
        />
        <span className="rb-num__unit" id={`${id}-unit`}>
          {unit}
        </span>
      </div>
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </>
  );
}

function ActionRow({ id, icon: Icon, title, detail, checked, onToggle, children }: { id: string; icon: LucideIcon; title: string; detail: string; checked: boolean; onToggle: (checked: boolean) => void; children: ReactNode }) {
  return (
    <div className={`rb-act ${checked ? 'rb-act--on' : ''}`}>
      <label className="rb-act__head" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} />
        <span className="rb-act__icon" aria-hidden>
          <Icon size={16} />
        </span>
        <span className="rb-act__text">
          <strong>{title}</strong>
          <span className="muted small">{detail}</span>
        </span>
      </label>
      {checked && <div className="rb-act__body">{children}</div>}
    </div>
  );
}

function Recipients({ id, label, value, onChange, members, lookup, error }: { id: string; label: string; value: string[]; onChange: (value: string[]) => void; members: User[]; lookup: Map<string, User>; error?: string }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const byEmail = new Map([...lookup.values()].map((user) => [user.email.toLowerCase(), user]));
  const commit = () => {
    const added = parseRecipients(text).filter((address) => !value.includes(address));
    if (added.length) onChange([...value, ...added]);
    setText('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const suggestions = members.filter((user) => !value.some((address) => address.toLowerCase() === user.email.toLowerCase()));
  return (
    <div className="rb-rcpt">
      <div className={`rb-rcpt__box ${error ? 'rb-rcpt__box--invalid' : ''}`} onClick={() => input.current?.focus()}>
        {value.map((address) => {
          const user = byEmail.get(address.toLowerCase());
          const valid = EMAIL.test(address);
          return (
            <span key={address} className={`rb-rcpt__chip ${valid ? '' : 'rb-rcpt__chip--invalid'}`} title={address}>
              {user?.name ?? address}
              <button type="button" aria-label={`Remove ${user?.name ?? address}`} onClick={() => onChange(value.filter((item) => item !== address))}>
                <X size={12} aria-hidden />
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          id={id}
          className="rb-rcpt__input"
          type="email"
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          value={text}
          placeholder={value.length ? 'Add another address' : 'Type an email address'}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      </div>
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="rb-rcpt__suggest">
          <span className="muted small">Team</span>
          {suggestions.slice(0, 6).map((user) => (
            <button key={user.id} type="button" className="rb-rcpt__add" onClick={() => onChange([...value, user.email])}>
              <Plus size={12} aria-hidden />
              {user.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useEvaluation(monitor: Monitor | null, history: History, now: number) {
  return useMemo(() => (monitor ? evaluateMonitors([monitor], history, now) : null), [monitor, history, now]);
}

function firedText(episodes: AlertEpisode[], span: string): string {
  if (!episodes.length) return `Would not have fired in ${span}`;
  const alerts = episodes.filter((episode) => episode.status !== 'warn' || episode.upgradedAt !== null).length;
  const warnings = episodes.length - alerts;
  const parts = [alerts && `${alerts} alert${alerts === 1 ? '' : 's'}`, warnings && `${warnings} warning${warnings === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  return `Would have fired ${episodes.length} time${episodes.length === 1 ? '' : 's'} in ${span} (${parts})`;
}

/** One line under the thresholds, so the effect of a change is visible where it is made. */
function PreviewLine({ monitor, history, now }: { monitor: Monitor | null; history: History; now: number }) {
  const { span } = useOnCall();
  const result = useEvaluation(monitor, history, now);
  if (!monitor || !result) return <p className="rb-line muted small">Enter valid thresholds to preview the rule.</p>;
  const status = result.status[0];
  return (
    <p className="rb-line small">
      <strong>{firedText(result.episodes, span)}.</strong>{' '}
      {status && monitor.signal !== 'no_data' && <span className="muted">Latest value {formatMonitorValue(monitor, status.value)}.</span>}
    </p>
  );
}

function Preview({ monitor, history, now }: { monitor: Monitor | null; history: History; now: number }) {
  const { span } = useOnCall();
  const result = useEvaluation(monitor, history, now);
  const status = result?.status[0];
  const episodes = [...(result?.episodes ?? [])].reverse();
  return (
    <Card title="Historical preview (snapshot)" icon={Activity} subtitle={`Estimated activations over ${span} of OTELTraces; the chart shows the last 24 hours`}>
      {!monitor || !result ? (
        <EmptyState icon={Activity} title="Nothing to preview yet">
          Enter a service and valid thresholds.
        </EmptyState>
      ) : (
        <div className="stack">
          <div className="rb-sum">
            {status && <StateBadge state={status.state} />}
            <span className="small">{firedText(result.episodes, span)}.</span>
          </div>
          {status ? monitor.signal === 'no_data' ? <StateStrip points={status.points} now={now} /> : <MonitorChart monitor={monitor} points={status.points} now={now} height={200} /> : <p className="muted small">No evaluations in this window.</p>}
          {episodes.length > 0 && (
            <ol className="rb-eps" aria-label={`Activations in ${span}`}>
              {episodes.slice(0, 5).map((episode) => (
                <li key={episode.start}>
                  <span className="rb-eps__when">{dateTime(episode.start)} UTC</span>
                  <StateBadge state={episode.upgradedAt !== null ? 'alert' : episode.status} />
                  <span className="small">
                    {monitor.signal === 'no_data' ? 'Silent' : `${monitor.comparison === 'below' ? 'Low' : 'Peak'} ${formatMonitorValue(monitor, episode.peak)}`} · {episode.end === null ? 'still firing' : `recovered after ${duration(episode.end - episode.start)}`}
                  </span>
                </li>
              ))}
              {episodes.length > 5 && <li className="muted small">and {episodes.length - 5} earlier</li>}
            </ol>
          )}
          <p className="muted small rb-note">
            Activator runs the same KQL every 5 minutes and fires when the value crosses a threshold, so counts can differ slightly at window edges.
            {monitor.signal === 'request_rate' && monitor.comparison === 'below' && ' When no service reports at all, the query returns zero, which can fire a drop rule the preview skips.'}
          </p>
        </div>
      )}
    </Card>
  );
}
