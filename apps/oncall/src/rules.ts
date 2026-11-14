import type { Monitor, MonitorSignal, RuleActions, Team } from './types.ts';

/** Ids for rules built in the app start here, clear of the seeded Datadog monitor ids. */
export const FIRST_RULE_ID = 900_001;
export const RULE_WINDOWS = [5, 10, 15, 30, 60] as const;
export const SERVICES = ['gateway', 'checkout', 'payment', 'inventory', 'shipping', 'notifications'] as const;

/** The rule builder form. Thresholds are in display units: percent for error rate, ms, req/min or minutes. */
export interface RuleDraft {
  name: string;
  signal: MonitorSignal;
  /** Null only for a cluster-wide no-data rule. */
  service: string | null;
  comparison: 'above' | 'below';
  windowMinutes: number;
  warn: number | null;
  alert: number | null;
  teamId: string;
  priority: number;
  message: string;
  actions: RuleActions;
}

export type DraftErrors = Partial<Record<'name' | 'service' | 'warn' | 'alert' | 'teamId' | 'actions' | 'teams' | 'email', string>>;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export const SIGNAL_UNIT: Record<MonitorSignal, Monitor['unit']> = {
  error_rate: 'ratio',
  p95_latency: 'ms',
  request_rate: 'rpm',
  no_data: 'minutes',
};

/** The suffix shown next to a threshold input. */
export const DISPLAY_UNIT: Record<MonitorSignal, string> = {
  error_rate: '%',
  p95_latency: 'ms',
  request_rate: 'req/min',
  no_data: 'min',
};

export function toDisplay(signal: MonitorSignal, value: number): number {
  return signal === 'error_rate' ? +(value * 100).toFixed(4) : value;
}

export function fromDisplay(signal: MonitorSignal, value: number): number {
  return signal === 'error_rate' ? +(value / 100).toFixed(6) : value;
}

export function emptyDraft(teamId: string, viewerEmail: string): RuleDraft {
  return {
    name: '',
    signal: 'error_rate',
    service: 'checkout',
    comparison: 'above',
    windowMinutes: 10,
    warn: null,
    alert: 5,
    teamId,
    priority: 2,
    message: '',
    actions: { page: { urgency: 'routing' }, teams: { recipients: [viewerEmail] }, email: null },
  };
}

export function monitorToDraft(monitor: Monitor): RuleDraft {
  return {
    name: monitor.name,
    signal: monitor.signal,
    service: monitor.service,
    comparison: monitor.comparison ?? 'above',
    windowMinutes: monitor.windowMinutes,
    warn: monitor.warn === null ? null : toDisplay(monitor.signal, monitor.warn),
    alert: toDisplay(monitor.signal, monitor.alert),
    teamId: monitor.teamId,
    priority: monitor.priority,
    message: monitor.message,
    actions: monitor.authored?.actions ?? { page: { urgency: 'routing' }, teams: null, email: null },
  };
}

export function parseRecipients(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean))];
}

export function validateDraft(draft: RuleDraft, teams: Team[]): DraftErrors {
  const errors: DraftErrors = {};
  const heartbeat = draft.signal === 'no_data';
  if (!draft.name.trim()) errors.name = 'Name the rule so responders recognize the page.';
  else if (draft.name.trim().length > 80) errors.name = 'Keep the name under 80 characters.';
  if (!heartbeat && !draft.service) errors.service = 'Choose the service to watch.';
  if (!teams.some((team) => team.id === draft.teamId)) errors.teamId = 'Choose the team that owns the rule.';
  const below = !heartbeat && draft.comparison === 'below';
  const limit = draft.signal === 'error_rate' ? 100 : Infinity;
  if (draft.alert === null || !Number.isFinite(draft.alert)) errors.alert = 'Enter the alert threshold.';
  else if (heartbeat && (!Number.isInteger(draft.alert) || draft.alert < 5 || draft.alert > 1440)) errors.alert = 'Use a whole number of minutes from 5 to 1440.';
  else if (!heartbeat && (draft.alert < 0 || draft.alert > limit)) errors.alert = draft.signal === 'error_rate' ? 'Use a percentage from 0 to 100.' : 'Use a value of 0 or more.';
  else if (!heartbeat && draft.alert === 0 && !below) errors.alert = 'An alert above 0 fires on any traffic; use a higher threshold.';
  if (draft.warn !== null && !heartbeat && draft.alert !== null && !errors.alert) {
    if (!Number.isFinite(draft.warn) || draft.warn < 0 || draft.warn > limit) errors.warn = 'Enter a valid warning threshold, or clear it.';
    else if (below ? draft.warn <= draft.alert : draft.warn >= draft.alert) errors.warn = below ? 'The warning threshold must be above the alert threshold.' : 'The warning threshold must be below the alert threshold.';
  }
  const { page, teams: chat, email } = draft.actions;
  if (!page && !chat && !email) errors.actions = 'Choose at least one action.';
  if (chat && (!chat.recipients.length || chat.recipients.some((address) => !EMAIL.test(address)))) {
    errors.teams = chat.recipients.length ? 'Each recipient needs a valid email address.' : 'Add at least one recipient.';
  }
  if (email && (!email.to.length || email.to.some((address) => !EMAIL.test(address)))) {
    errors.email = email.to.length ? 'Each recipient needs a valid email address.' : 'Add at least one recipient.';
  }
  return errors;
}

function datadogQuery(draft: RuleDraft, alert: number): string {
  const scope = `env:prod,service:${draft.service}`;
  const op = draft.comparison === 'below' ? '<' : '>';
  const range = `last_${draft.windowMinutes}m`;
  if (draft.signal === 'error_rate') return `sum(${range}):sum:trace.server.request.errors{${scope}}.as_count() / sum:trace.server.request.hits{${scope}}.as_count() ${op} ${alert}`;
  if (draft.signal === 'p95_latency') return `percentile(${range}):p95:trace.server.request{${scope}} ${op} ${alert / 1000}`;
  if (draft.signal === 'request_rate') return `sum(${range}):sum:trace.server.request.hits{${scope}}.as_rate() * 60 ${op} ${alert}`;
  return `"datadog.agent.up".over(${draft.service ? `"service:${draft.service}"` : '"kube_namespace:otel-demo"'}).by("host").last(2).count_by_status()`;
}

/** Builds the stored rule from a valid draft. `previous` keeps the creation stamp when editing. */
export function draftToMonitor(draft: RuleDraft, id: number, by: string, now: number, previous?: Monitor, enabled = true): Monitor {
  const heartbeat = draft.signal === 'no_data';
  const alert = fromDisplay(draft.signal, draft.alert ?? 0);
  const warn = heartbeat || draft.warn === null ? null : fromDisplay(draft.signal, draft.warn);
  return {
    id,
    name: draft.name.trim(),
    type: heartbeat ? 'heartbeat' : 'apm',
    signal: draft.signal,
    service: draft.service,
    env: 'prod',
    teamId: draft.teamId,
    priority: draft.priority,
    windowMinutes: heartbeat ? 5 : draft.windowMinutes,
    warn,
    alert,
    ...(heartbeat ? {} : { comparison: draft.comparison }),
    unit: SIGNAL_UNIT[draft.signal],
    query: datadogQuery(draft, alert),
    message: draft.message.trim(),
    authored: {
      enabled: previous?.authored?.enabled ?? enabled,
      createdAt: previous?.authored?.createdAt ?? now,
      createdBy: previous?.authored?.createdBy ?? by,
      updatedAt: now,
      actions: {
        page: draft.actions.page,
        teams: draft.actions.teams ? { recipients: [...draft.actions.teams.recipients] } : null,
        email: draft.actions.email ? { to: [...draft.actions.email.to] } : null,
      },
    },
  };
}

export function nextRuleId(rules: Monitor[]): number {
  return Math.max(FIRST_RULE_ID - 1, ...rules.map((rule) => rule.id)) + 1;
}

export interface RuleStore {
  get: () => Monitor[];
  subscribe: (listener: () => void) => () => void;
  save: (rule: Monitor) => void;
  remove: (id: number) => void;
  clear: () => void;
}

function isRule(value: unknown): value is Monitor {
  const rule = value as Monitor | null;
  return Boolean(rule && typeof rule.id === 'number' && typeof rule.name === 'string' && typeof rule.signal === 'string' && rule.authored && typeof rule.authored.enabled === 'boolean');
}

/** Keeps rules built in the app in localStorage, like the viewer's page actions; falls back to memory. */
export function createRuleStore(key: string): RuleStore {
  const storage = (() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  })();
  let rules: Monitor[] = (() => {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isRule) : [];
    } catch {
      return [];
    }
  })();
  const listeners = new Set<() => void>();
  const commit = (next: Monitor[]) => {
    rules = next;
    try {
      storage?.setItem(key, JSON.stringify(rules));
    } catch {
      // Storage can be full or blocked in embedded contexts.
    }
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => rules,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    save: (rule) => commit(rules.some((item) => item.id === rule.id) ? rules.map((item) => (item.id === rule.id ? rule : item)) : [...rules, rule]),
    remove: (id) => commit(rules.filter((item) => item.id !== id)),
    clear: () => commit([]),
  };
}
