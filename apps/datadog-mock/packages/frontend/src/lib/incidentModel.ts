import type { PageStatus } from '@oncall';

export type IncidentSeverity = 'Unknown' | 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4' | 'SEV-5';
export type IncidentEventKind = 'declared' | 'acknowledged' | 'assigned' | 'resolved';

export interface IncidentEvent {
  kind: IncidentEventKind;
  at: number;
  by: string;
  detail?: string;
}

export interface DatadogIncident {
  id: string;
  pageId: number;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  commanderId: string;
  status: PageStatus;
  assignedTo: string;
  createdAt: number;
  updatedAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  events: IncidentEvent[];
}

export type IncidentAction =
  | { kind: 'acknowledge'; by: string; at: number }
  | { kind: 'assign'; to: string; by: string; at: number }
  | { kind: 'resolve'; by: string; at: number };

export function declareIncident(input: {
  id: string;
  pageId: number;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  commanderId: string;
  declaredBy: string;
  at: number;
}): DatadogIncident {
  return {
    id: input.id,
    pageId: input.pageId,
    title: input.title.trim() || `Incident for Page #${input.pageId}`,
    summary: input.summary.trim(),
    severity: input.severity,
    commanderId: input.commanderId,
    status: 'triggered',
    assignedTo: input.commanderId,
    createdAt: input.at,
    updatedAt: input.at,
    acknowledgedAt: null,
    resolvedAt: null,
    events: [{ kind: 'declared', at: input.at, by: input.declaredBy, detail: `Declared from Page #${input.pageId}` }],
  };
}

export function updateIncident(incident: DatadogIncident, action: IncidentAction): DatadogIncident {
  if (incident.status === 'resolved') return incident;
  let update: Partial<DatadogIncident>;
  let event: IncidentEvent;
  switch (action.kind) {
    case 'acknowledge':
      if (incident.status !== 'triggered') return incident;
      update = { status: 'acknowledged', acknowledgedAt: action.at, assignedTo: action.by };
      event = { kind: 'acknowledged', at: action.at, by: action.by };
      break;
    case 'assign':
      if (!action.to || action.to === incident.assignedTo) return incident;
      update = { assignedTo: action.to };
      event = { kind: 'assigned', at: action.at, by: action.by, detail: `Assigned to ${action.to}` };
      break;
    case 'resolve':
      update = { status: 'resolved', resolvedAt: action.at };
      event = { kind: 'resolved', at: action.at, by: action.by };
      break;
  }
  return { ...incident, ...update, updatedAt: action.at, events: [...incident.events, event] };
}
