import type { LogEntry, TraceSummary } from '@telemetry';
import type { ServiceStats } from './derive';

export type AlertSignal = 'error_rate' | 'p95_latency' | 'request_rate' | 'error_logs' | 'trace_errors';
export type AlertComparison = 'above' | 'below';
export type AlertSeverity = 'critical' | 'warning';
export type DestinationKind = 'email' | 'teams' | 'pagerduty';

export interface AlertDestination {
  id: DestinationKind;
  target: string;
}

export interface AlertDefinition {
  id: string;
  name: string;
  signal: AlertSignal;
  service: string;
  comparison: AlertComparison;
  threshold: number;
  severity: AlertSeverity;
  destinations: AlertDestination[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvaluation {
  rule: AlertDefinition;
  value: number | null;
  triggered: boolean;
}

export const ALERT_STORAGE_KEY = 'coralogix-mock.alert-definitions.v1';

export const SIGNALS: Record<AlertSignal, { label: string; source: string; unit: string }> = {
  error_rate: { label: 'Error rate', source: 'Metrics', unit: '%' },
  p95_latency: { label: 'p95 latency', source: 'Metrics', unit: 'ms' },
  request_rate: { label: 'Request rate', source: 'Metrics', unit: 'rpm' },
  error_logs: { label: 'Error log count', source: 'Logs', unit: 'logs' },
  trace_errors: { label: 'Failed trace count', source: 'Tracing', unit: 'traces' },
};

const isDestinationKind = (value: unknown): value is DestinationKind => value === 'email' || value === 'teams' || value === 'pagerduty';

function isAlertDefinition(value: unknown): value is AlertDefinition {
  if (!value || typeof value !== 'object') return false;
  const rule = value as AlertDefinition;
  return typeof rule.id === 'string' && typeof rule.name === 'string' &&
    Object.hasOwn(SIGNALS, rule.signal) && typeof rule.service === 'string' &&
    (rule.comparison === 'above' || rule.comparison === 'below') &&
    typeof rule.threshold === 'number' && Number.isFinite(rule.threshold) &&
    (rule.severity === 'critical' || rule.severity === 'warning') &&
    Array.isArray(rule.destinations) && rule.destinations.every((destination) =>
      destination && isDestinationKind(destination.id) && typeof destination.target === 'string') &&
    typeof rule.enabled === 'boolean' && typeof rule.createdAt === 'string' && typeof rule.updatedAt === 'string';
}

export function seedAlertDefinitions(services: ServiceStats[], now = Date.now()): AlertDefinition[] {
  const service = services.find((item) => /checkout/i.test(item.name)) ?? services[0];
  if (!service) return [];
  const createdAt = new Date(now).toISOString();
  return [
    {
      id: 'seed-checkout-error-rate',
      name: 'Checkout error rate elevated',
      signal: 'error_rate',
      service: service.name,
      comparison: 'above',
      threshold: Math.max(1, Math.ceil(service.errorRate * 100 / 5) * 5),
      severity: 'critical',
      destinations: [{ id: 'pagerduty', target: 'RTI operations service' }, { id: 'email', target: 'sre@coralogix-demo.example' }],
      enabled: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'seed-checkout-latency',
      name: `${service.name} latency warning`,
      signal: 'p95_latency',
      service: service.name,
      comparison: 'above',
      threshold: Math.max(250, Math.ceil(service.p95 / 250) * 250),
      severity: 'warning',
      destinations: [{ id: 'teams', target: '#platform-alerts' }],
      enabled: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'seed-payment-error-logs',
      name: 'Error logs need review',
      signal: 'error_logs',
      service: service.name,
      comparison: 'above',
      threshold: Math.max(5, service.errorLogs + 1),
      severity: 'warning',
      destinations: [{ id: 'email', target: 'platform@coralogix-demo.example' }],
      enabled: false,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

export function readAlertDefinitions(services: ServiceStats[]): AlertDefinition[] {
  try {
    const saved = window.localStorage.getItem(ALERT_STORAGE_KEY);
    if (saved === null) return seedAlertDefinitions(services);
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.every(isAlertDefinition) ? parsed : seedAlertDefinitions(services);
  } catch {
    return seedAlertDefinitions(services);
  }
}

export function evaluateAlert(rule: AlertDefinition, services: ServiceStats[], logs: LogEntry[], traces: TraceSummary[]): AlertEvaluation {
  const serviceRows = rule.service === 'All services' ? services : services.filter((service) => service.name === rule.service);
  if (!serviceRows.length) return { rule, value: null, triggered: false };
  let value: number;
  switch (rule.signal) {
    case 'error_rate': {
      const requests = serviceRows.reduce((total, service) => total + service.requests, 0);
      const errors = serviceRows.reduce((total, service) => total + service.errors, 0);
      value = requests ? (errors / requests) * 100 : 0;
      break;
    }
    case 'p95_latency':
      value = Math.max(...serviceRows.map((service) => service.p95));
      break;
    case 'request_rate':
      value = serviceRows.reduce((total, service) => total + service.rpm, 0);
      break;
    case 'error_logs':
      value = logs.filter((log) => (rule.service === 'All services' || log.service === rule.service) && (log.severity === 'ERROR' || log.severity === 'FATAL')).length;
      break;
    case 'trace_errors':
      value = traces.filter((trace) => (rule.service === 'All services' || trace.rootService === rule.service) && trace.errorCount > 0).length;
      break;
  }
  const triggered = rule.comparison === 'above' ? value > rule.threshold : value < rule.threshold;
  return { rule, value, triggered };
}

export function formatAlertValue(signal: AlertSignal, value: number | null): string {
  if (value === null) return 'No data';
  const unit = SIGNALS[signal].unit;
  if (signal === 'error_rate') return `${value.toFixed(2)}${unit}`;
  if (signal === 'p95_latency') return `${Math.round(value)} ${unit}`;
  return `${Math.round(value)} ${unit}`;
}
