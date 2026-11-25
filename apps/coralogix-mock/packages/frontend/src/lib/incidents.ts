import type { AlertComparison, AlertEvaluation, AlertSeverity, AlertSignal } from './alerts';

export type IncidentStatus = 'triggered' | 'acknowledged' | 'resolved';
export type IncidentEventKind = 'triggered' | 'acknowledged' | 'snoozed' | 'assigned' | 'resolved';

export interface IncidentEvent {
  kind: IncidentEventKind;
  at: number;
  by?: string;
  until?: number;
}

export interface AlertIncident {
  id: string;
  alertId: string;
  alertName: string;
  service: string;
  signal: AlertSignal;
  comparison: AlertComparison;
  severity: AlertSeverity;
  threshold: number;
  value: number;
  status: IncidentStatus;
  triggeredAt: number;
  acknowledgedAt: number | null;
  assignedTo: string | null;
  snoozedUntil: number | null;
  resolvedAt: number | null;
  resolvedBy: 'alert' | 'user' | null;
  events: IncidentEvent[];
}

export interface IncidentState {
  incidents: AlertIncident[];
  /** Previous evaluation state prevents duplicate incidents during a sustained alert. */
  triggeredByRule: Record<string, boolean>;
}

export const INCIDENT_STORAGE_KEY = 'coralogix-mock.alert-incidents.v1';

export type IncidentAction =
  | { kind: 'acknowledge'; by: string; at: number }
  | { kind: 'assign'; by: string; at: number }
  | { kind: 'snooze'; by: string; at: number; until: number }
  | { kind: 'resolve'; by: string; at: number };

export function createIncidentState(): IncidentState {
  return { incidents: [], triggeredByRule: {} };
}

function resolveIncident(incident: AlertIncident, at: number, resolvedBy: 'alert' | 'user', by?: string): AlertIncident {
  if (incident.status === 'resolved') return incident;
  return {
    ...incident,
    status: 'resolved',
    resolvedAt: at,
    resolvedBy,
    ...(by ? { assignedTo: by } : {}),
    events: [...incident.events, { kind: 'resolved', at, ...(by ? { by } : {}) }],
  };
}

/** Reconciles alert threshold edges with local incident history; no network calls are made. */
export function reconcileIncidents(
  state: IncidentState,
  evaluations: AlertEvaluation[],
  at: number,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): IncidentState {
  const incidents = [...state.incidents];
  const triggeredByRule = { ...state.triggeredByRule };
  const seenRules = new Set(evaluations.map(({ rule }) => rule.id));

  for (const evaluation of evaluations) {
    const { rule, value, triggered } = evaluation;
    const wasTriggered = triggeredByRule[rule.id] ?? false;
    const activeIndex = incidents.findIndex((incident) => incident.alertId === rule.id && incident.status !== 'resolved');
    if (triggered && !wasTriggered) {
      incidents.unshift({
        id: createId(),
        alertId: rule.id,
        alertName: rule.name,
        service: rule.service,
        signal: rule.signal,
        comparison: rule.comparison,
        severity: rule.severity,
        threshold: rule.threshold,
        value: value ?? 0,
        status: 'triggered',
        triggeredAt: at,
        acknowledgedAt: null,
        assignedTo: null,
        snoozedUntil: null,
        resolvedAt: null,
        resolvedBy: null,
        events: [{ kind: 'triggered', at }],
      });
    } else if (!triggered && activeIndex >= 0) {
      incidents[activeIndex] = resolveIncident(incidents[activeIndex], at, 'alert');
    }
    triggeredByRule[rule.id] = triggered;
  }

  // Removed or disabled definitions no longer have an active condition.
  for (const [ruleId, wasTriggered] of Object.entries(triggeredByRule)) {
    if (seenRules.has(ruleId)) continue;
    if (wasTriggered) {
      const activeIndex = incidents.findIndex((incident) => incident.alertId === ruleId && incident.status !== 'resolved');
      if (activeIndex >= 0) incidents[activeIndex] = resolveIncident(incidents[activeIndex], at, 'alert');
    }
    triggeredByRule[ruleId] = false;
  }
  return { incidents, triggeredByRule };
}

/** Applies a local responder action. Manual status changes assign the current user. */
export function applyIncidentAction(state: IncidentState, incidentId: string, action: IncidentAction): IncidentState {
  const index = state.incidents.findIndex((incident) => incident.id === incidentId);
  if (index < 0) return state;
  const current = state.incidents[index];
  if (current.status === 'resolved') return state;
  let next: AlertIncident;
  switch (action.kind) {
    case 'acknowledge':
      if (current.status !== 'triggered') return state;
      next = {
        ...current,
        status: 'acknowledged',
        acknowledgedAt: action.at,
        assignedTo: action.by,
        events: [...current.events, { kind: 'acknowledged', by: action.by, at: action.at }],
      };
      break;
    case 'assign':
      if (current.assignedTo === action.by) return state;
      next = {
        ...current,
        assignedTo: action.by,
        events: [...current.events, { kind: 'assigned', by: action.by, at: action.at }],
      };
      break;
    case 'snooze':
      next = {
        ...current,
        snoozedUntil: action.until,
        events: [...current.events, { kind: 'snoozed', by: action.by, at: action.at, until: action.until }],
      };
      break;
    case 'resolve':
      next = resolveIncident(current, action.at, 'user', action.by);
      break;
  }
  const incidents = [...state.incidents];
  incidents[index] = next;
  return { ...state, incidents };
}

export function readIncidentState(): IncidentState {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(INCIDENT_STORAGE_KEY) ?? 'null');
    if (
      value && typeof value === 'object' &&
      Array.isArray((value as IncidentState).incidents) &&
      (value as IncidentState).triggeredByRule &&
      typeof (value as IncidentState).triggeredByRule === 'object'
    ) return value as IncidentState;
  } catch {
    // A blocked or malformed local store falls back to an empty demo history.
  }
  return createIncidentState();
}
