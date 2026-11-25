import { useSyncExternalStore } from 'react';
import type { DatadogIncident, IncidentAction } from './incidentModel';
import { updateIncident } from './incidentModel';

const STORAGE_KEY = 'ddmock.oncall.incidents.v1';
const EMPTY: DatadogIncident[] = [];

function read(): DatadogIncident[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value as DatadogIncident[] : EMPTY;
  } catch {
    return EMPTY;
  }
}

let incidents = read();
const listeners = new Set<() => void>();
function commit(next: DatadogIncident[]) {
  incidents = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents));
  } catch {
    // Keep the current session usable when browser storage is blocked.
  }
  listeners.forEach((listener) => listener());
}

export const incidentStore = {
  get: () => incidents,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  add(incident: DatadogIncident) {
    if (!incidents.some((item) => item.id === incident.id)) commit([incident, ...incidents]);
  },
  update(id: string, action: IncidentAction) {
    const current = incidents.find((incident) => incident.id === id);
    if (!current) return;
    const updated = updateIncident(current, action);
    if (updated !== current) commit(incidents.map((incident) => incident.id === id ? updated : incident));
  },
  clear() {
    commit([]);
  },
};

export function useDatadogIncidents(): DatadogIncident[] {
  return useSyncExternalStore(incidentStore.subscribe, incidentStore.get, () => EMPTY);
}
