import { Activity, Bell, BellOff, Check, ChevronRight, Clock3, ExternalLink, Mail, MessageSquare, Plus, Radio, Save, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AlertDefinition, AlertDestination, AlertEvaluation, AlertSignal, AlertSeverity, DestinationKind } from '../lib/alerts';
import { ALERT_STORAGE_KEY } from '../lib/alerts';
import { evaluateAlert, formatAlertValue, readAlertDefinitions, SIGNALS } from '../lib/alerts';
import { useData } from '../lib/data';
import { useToast } from '../lib/toast';

const DESTINATIONS: { id: DestinationKind; label: string; description: string; placeholder: string; icon: typeof Mail }[] = [
  { id: 'email', label: 'Email', description: 'Notify an email recipient', placeholder: 'team@company.com', icon: Mail },
  { id: 'teams', label: 'Microsoft Teams', description: 'Route to a Teams channel', placeholder: '#channel-name', icon: MessageSquare },
  { id: 'pagerduty', label: 'PagerDuty', description: 'Route to a connected PagerDuty service', placeholder: 'Service name', icon: Radio },
];

type Draft = Omit<AlertDefinition, 'id' | 'createdAt' | 'updatedAt'>;

function newDraft(service: string): Draft {
  return {
    name: '',
    signal: 'error_rate',
    service,
    comparison: 'above',
    threshold: 5,
    severity: 'critical',
    destinations: [{ id: 'email', target: '' }],
    enabled: true,
  };
}

function valueForThreshold(rule: AlertDefinition): string {
  if (rule.signal === 'error_rate') return `${rule.comparison === 'above' ? '>' : '<'} ${rule.threshold}%`;
  return `${rule.comparison === 'above' ? '>' : '<'} ${rule.threshold} ${SIGNALS[rule.signal].unit}`;
}

function ruleEvaluation(rule: AlertDefinition, evaluations: AlertEvaluation[]) {
  return evaluations.find((evaluation) => evaluation.rule.id === rule.id);
}

function AlertEditor({
  draft,
  editing,
  services,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  editing: boolean;
  services: string[];
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [error, setError] = useState('');
  const toggleDestination = (kind: DestinationKind, checked: boolean) => {
    const destinations = checked
      ? [...draft.destinations, { id: kind, target: '' }]
      : draft.destinations.filter((destination) => destination.id !== kind);
    onChange({ ...draft, destinations });
  };
  const setTarget = (kind: DestinationKind, target: string) => {
    onChange({ ...draft, destinations: draft.destinations.map((destination) => destination.id === kind ? { ...destination, target } : destination) });
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return setError('Enter a name for this alert.');
    if (!Number.isFinite(draft.threshold) || draft.threshold < 0) return setError('Enter a threshold of zero or greater.');
    if (!draft.destinations.length) return setError('Choose at least one notification destination.');
    if (draft.destinations.some((destination) => !destination.target.trim())) return setError('Add a destination for each selected channel.');
    setError('');
    onSave(event);
  };
  return (
    <form className="alert-editor" onSubmit={save} aria-label={editing ? 'Edit alert definition' : 'Create alert definition'}>
      <header className="alert-editor-head">
        <div>
          <h2>{editing ? 'Edit alert definition' : 'New alert definition'}</h2>
          <p>Define a condition and route the notification.</p>
        </div>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close editor"><X size={16} /></button>
      </header>
      <div className="alert-form-grid">
        <label className="alert-field alert-field--wide">
          <span>Alert name</span>
          <input value={draft.name} maxLength={100} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="e.g. Checkout error rate elevated" />
        </label>
        <label className="alert-field">
          <span>Signal</span>
          <select value={draft.signal} onChange={(event) => onChange({ ...draft, signal: event.target.value as AlertSignal })}>
            {Object.entries(SIGNALS).map(([id, signal]) => <option key={id} value={id}>{signal.label} · {signal.source}</option>)}
          </select>
        </label>
        <label className="alert-field">
          <span>Service</span>
          <select value={draft.service} onChange={(event) => onChange({ ...draft, service: event.target.value })}>
            <option value="All services">All services</option>
            {services.map((service) => <option key={service} value={service}>{service}</option>)}
          </select>
        </label>
        <label className="alert-field">
          <span>Condition</span>
          <select value={draft.comparison} onChange={(event) => onChange({ ...draft, comparison: event.target.value as Draft['comparison'] })}>
            <option value="above">Above threshold</option>
            <option value="below">Below threshold</option>
          </select>
        </label>
        <label className="alert-field">
          <span>Threshold <small>({SIGNALS[draft.signal].unit})</small></span>
          <input
            type="number"
            min="0"
            step={draft.signal === 'error_rate' ? '0.1' : '1'}
            value={draft.threshold}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              if (raw === '') return onChange({ ...draft, threshold: 0 });
              const threshold = Number.parseFloat(raw);
              if (Number.isFinite(threshold)) onChange({ ...draft, threshold });
            }}
          />
        </label>
        <label className="alert-field">
          <span>Severity</span>
          <select value={draft.severity} onChange={(event) => onChange({ ...draft, severity: event.target.value as AlertSeverity })}>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </select>
        </label>
      </div>
      <fieldset className="alert-destinations">
        <legend>Notification destinations</legend>
        <p>Channels are previewed locally; no message is sent.</p>
        <div className="alert-destination-options">
          {DESTINATIONS.map(({ id, label, description, placeholder, icon: Icon }) => {
            const selected = draft.destinations.find((destination) => destination.id === id);
            return (
              <div className={`alert-destination${selected ? ' is-selected' : ''}`} key={id}>
                <label className="alert-destination-check">
                  <input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleDestination(id, event.target.checked)} />
                  <Icon size={16} aria-hidden />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </label>
                {selected && <input aria-label={`${label} destination`} value={selected.target} onChange={(event) => setTarget(id, event.target.value)} placeholder={placeholder} />}
              </div>
            );
          })}
        </div>
        {draft.destinations.some((destination) => destination.id === 'pagerduty') && (
          <p className="alert-pagerduty-note">PagerDuty is a notification integration. On-call schedules and escalation policies are managed in PagerDuty, not in this mock.</p>
        )}
      </fieldset>
      {error && <p className="alert-form-error" role="alert">{error}</p>}
      <footer className="alert-editor-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary"><Save size={14} /> {editing ? 'Save changes' : 'Create alert'}</button>
      </footer>
    </form>
  );
}

function Destinations({ destinations }: { destinations: AlertDestination[] }) {
  return (
    <div className="alert-channel-list">
      {destinations.map((destination) => {
        const Icon = DESTINATIONS.find((item) => item.id === destination.id)?.icon ?? Bell;
        return <span key={destination.id} className="alert-channel"><Icon size={12} aria-hidden />{destination.target}</span>;
      })}
    </div>
  );
}

function DefinitionList({ rules, evaluations, onEdit, onToggle, onDelete }: {
  rules: AlertDefinition[];
  evaluations: AlertEvaluation[];
  onEdit: (rule: AlertDefinition) => void;
  onToggle: (rule: AlertDefinition) => void;
  onDelete: (rule: AlertDefinition) => void;
}) {
  if (!rules.length) return <div className="alert-empty"><Bell size={22} /><strong>No alert definitions yet</strong><span>Create an alert to watch service health, logs or traces.</span></div>;
  return (
    <div className="alert-rule-list">
      {rules.map((rule) => {
        const evaluation = ruleEvaluation(rule, evaluations);
        const triggered = rule.enabled && Boolean(evaluation?.triggered);
        return (
          <article className="alert-rule" key={rule.id}>
            <div className="alert-rule-main">
              <span className={`alert-rule-mark${triggered ? ' is-triggered' : ''}`}><TriangleAlert size={16} aria-hidden /></span>
              <div className="alert-rule-copy">
                <div className="alert-rule-title"><h3>{rule.name}</h3><span className={`alert-severity alert-severity--${rule.severity}`}>{rule.severity}</span></div>
                <p>{SIGNALS[rule.signal].label} for <strong>{rule.service}</strong> {valueForThreshold(rule)}</p>
                <Destinations destinations={rule.destinations} />
              </div>
            </div>
            <div className="alert-rule-state">
              <span className={`alert-state${!rule.enabled ? ' is-disabled' : triggered ? ' is-triggered' : ''}`}>
                {!rule.enabled ? 'Disabled' : triggered ? 'Triggered' : 'OK'}
              </span>
              <span className="alert-current">{formatAlertValue(rule.signal, evaluation?.value ?? null)}</span>
            </div>
            <div className="alert-rule-actions">
              <button type="button" className="btn btn--small" onClick={() => onEdit(rule)}>Edit</button>
              <button type="button" className="btn btn--small" onClick={() => onToggle(rule)} aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}>
                {rule.enabled ? <BellOff size={13} /> : <Bell size={13} />}{rule.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" className="icon-btn" onClick={() => onDelete(rule)} aria-label={`Delete ${rule.name}`}><Trash2 size={14} /></button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function AlertDefinitions() {
  const { bundle, derived } = useData();
  const { notify } = useToast();
  const services = useMemo(() => derived.services.map((service) => service.name), [derived.services]);
  const [rules, setRules] = useState(() => readAlertDefinitions(derived.services));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'triggered'>('all');
  const [storageError, setStorageError] = useState('');
  const evaluations = useMemo(() => rules.map((rule) => evaluateAlert(rule, derived.services, bundle.logs, bundle.traces)), [rules, derived.services, bundle.logs, bundle.traces]);
  const enabledCount = rules.filter((rule) => rule.enabled).length;
  const triggeredCount = evaluations.filter((evaluation) => evaluation.rule.enabled && evaluation.triggered).length;
  const visible = rules.filter((rule) => filter === 'all' || filter === 'enabled' && rule.enabled || filter === 'triggered' && rule.enabled && ruleEvaluation(rule, evaluations)?.triggered);

  useEffect(() => {
    try {
      window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(rules));
      setStorageError('');
    } catch {
      setStorageError('This browser blocked local storage. Changes may not survive a reload.');
    }
  }, [rules]);

  const beginNew = () => {
    setEditingId(null);
    setDraft(newDraft(services[0] ?? 'All services'));
  };
  const beginEdit = (rule: AlertDefinition) => {
    setEditingId(rule.id);
    setDraft({
      name: rule.name,
      signal: rule.signal,
      service: rule.service,
      comparison: rule.comparison,
      threshold: rule.threshold,
      severity: rule.severity,
      destinations: rule.destinations.map((destination) => ({ ...destination })),
      enabled: rule.enabled,
    });
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = new Date().toISOString();
    if (editingId) {
      setRules((current) => current.map((rule) => rule.id === editingId ? { ...rule, ...draft!, name: draft!.name.trim(), updatedAt: now } : rule));
      notify('Alert definition updated');
    } else {
      setRules((current) => [{ ...draft!, id: crypto.randomUUID(), name: draft!.name.trim(), createdAt: now, updatedAt: now }, ...current]);
      notify('Alert definition created');
    }
    setDraft(null);
    setEditingId(null);
  };
  const toggle = (rule: AlertDefinition) => {
    setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled, updatedAt: new Date().toISOString() } : item));
    notify(rule.enabled ? 'Alert disabled' : 'Alert enabled');
  };
  const remove = (rule: AlertDefinition) => {
    setRules((current) => current.filter((item) => item.id !== rule.id));
    notify('Alert definition deleted');
  };
  return (
    <div className="page alert-page">
      <header className="alert-page-head">
        <div>
          <div className="alert-breadcrumb">Alerts <ChevronRight size={13} aria-hidden /> Alert Definitions</div>
          <h1>Alert Definitions</h1>
          <p>Monitor logs, service metrics and traces, then route notifications to your response tools.</p>
        </div>
        {!draft && <button type="button" className="btn-primary" onClick={beginNew}><Plus size={15} /> New alert</button>}
      </header>
      <div className="alert-demo-note" role="note">
        <Activity size={15} aria-hidden />
        <span><strong>Coralogix alerting demo.</strong> Rules evaluate the current telemetry window. Notification destinations are simulated and no external messages are sent.</span>
      </div>
      {storageError && <p className="alert-form-error" role="alert">{storageError}</p>}
      <div className="alert-summary">
        <div><strong>{rules.length}</strong><span>Definitions</span></div>
        <div><strong>{enabledCount}</strong><span>Enabled</span></div>
        <div className={triggeredCount ? 'is-triggered' : ''}><strong>{triggeredCount}</strong><span>Triggered now</span></div>
      </div>
      <div className={`alert-workspace${draft ? ' has-editor' : ''}`}>
        <section className="alert-list-section">
          <div className="alert-list-head">
            <div><h2>Rules</h2><span>{visible.length} shown</span></div>
            <div className="alert-filter" role="group" aria-label="Filter alert definitions">
              {(['all', 'enabled', 'triggered'] as const).map((value) => <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
            </div>
          </div>
          <DefinitionList rules={visible} evaluations={evaluations} onEdit={beginEdit} onToggle={toggle} onDelete={remove} />
          <div className="alert-destination-footer"><span>Channels are configured per alert definition.</span><span>Email · Microsoft Teams · PagerDuty</span></div>
        </section>
        {draft && <AlertEditor draft={draft} editing={Boolean(editingId)} services={services} onChange={setDraft} onCancel={() => { setDraft(null); setEditingId(null); }} onSave={save} />}
      </div>
      <p className="alert-workspace-footnote">Evaluation uses the current {bundle.source === 'snapshot' ? 'snapshot' : 'live preview'} window, not a continuous Coralogix alerting service.</p>
    </div>
  );
}

export function AlertIncidents() {
  const { bundle, derived } = useData();
  const [rules] = useState(() => readAlertDefinitions(derived.services));
  const evaluations = useMemo(() => rules.map((rule) => evaluateAlert(rule, derived.services, bundle.logs, bundle.traces)), [rules, derived.services, bundle.logs, bundle.traces]);
  const triggered = evaluations.filter((evaluation) => evaluation.rule.enabled && evaluation.triggered);
  const recovered = evaluations.filter((evaluation) => evaluation.rule.enabled && !evaluation.triggered);
  return (
    <div className="page alert-page">
      <header className="alert-page-head">
        <div>
          <div className="alert-breadcrumb">Alerts <ChevronRight size={13} aria-hidden /> Incidents</div>
          <h1>Incidents</h1>
          <p>Current alert conditions derived from the telemetry window.</p>
        </div>
        <a className="btn" href="#/alerts/definitions"><Bell size={14} /> Alert definitions <ExternalLink size={12} /></a>
      </header>
      <div className="alert-demo-note" role="note"><Activity size={15} aria-hidden /><span>Incident state is simulated from the current telemetry window. A triggered alert does not send an external notification.</span></div>
      <div className="alert-summary">
        <div className={triggered.length ? 'is-triggered' : ''}><strong>{triggered.length}</strong><span>Triggered</span></div>
        <div><strong>{recovered.length}</strong><span>Not triggered</span></div>
        <div><strong>{rules.filter((rule) => rule.enabled).length}</strong><span>Enabled rules</span></div>
      </div>
      <section className="alert-incident-section">
        <div className="alert-list-head"><div><h2>Triggered conditions</h2><span>Evaluated against this window</span></div><span className="alert-snapshot-time"><Clock3 size={13} /> {new Date(bundle.generatedAt).toLocaleString()}</span></div>
        {triggered.length ? (
          <div className="alert-rule-list">
            {triggered.map(({ rule, value }) => (
              <article className="alert-rule alert-incident" key={rule.id}>
                <span className="alert-rule-mark is-triggered"><TriangleAlert size={16} aria-hidden /></span>
                <div className="alert-rule-copy">
                  <div className="alert-rule-title"><h3>{rule.name}</h3><span className={`alert-severity alert-severity--${rule.severity}`}>{rule.severity}</span><span className="alert-state is-triggered">Triggered</span></div>
                  <p>{SIGNALS[rule.signal].label} for <strong>{rule.service}</strong> measured <strong>{formatAlertValue(rule.signal, value)}</strong>, crossing {valueForThreshold(rule)}.</p>
                  <Destinations destinations={rule.destinations} />
                  <span className="alert-simulation-caption"><Check size={12} /> Simulated notification route; no external delivery</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="alert-empty"><Check size={22} /><strong>No active incidents</strong><span>Enabled definitions are below their thresholds in the current telemetry window.</span><a className="link-btn" href="#/alerts/definitions">Review alert definitions <ChevronRight size={13} /></a></div>
        )}
      </section>
    </div>
  );
}
