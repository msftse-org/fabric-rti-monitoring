import { inWindow, nextWindowStart } from './time.ts';
import type { AlertStatus, Monitor, RoutingCondition, RoutingField, RoutingRule, Team } from './types.ts';

export interface RoutingContext {
  env: string;
  service: string | null;
  priority: number;
  alertStatus: AlertStatus;
  monitorType: string;
}

const QUERY_FIELD: Record<RoutingField, string> = {
  env: 'tags.env',
  service: 'groups.service',
  priority: 'priority',
  alert_status: 'alert_status',
  monitor_type: 'monitor.type',
};

/** Datadog-style query text for a rule, for example `tags.env:prod priority:(1 OR 2)`. */
export function ruleQuery(rule: RoutingRule): string {
  if (!rule.conditions.length) return '*';
  return rule.conditions
    .map(({ field, values }) => `${QUERY_FIELD[field]}:${values.length > 1 ? `(${values.join(' OR ')})` : values[0]}`)
    .join(' ');
}

function value(context: RoutingContext, field: RoutingField): string {
  switch (field) {
    case 'env':
      return context.env;
    case 'service':
      return context.service ?? '';
    case 'priority':
      return String(context.priority);
    case 'alert_status':
      return context.alertStatus;
    case 'monitor_type':
      return context.monitorType;
  }
}

export function matches(conditions: RoutingCondition[], context: RoutingContext): boolean {
  return conditions.every(({ field, values }) => values.includes(value(context, field)));
}

export function contextFor(monitor: Monitor, alertStatus: AlertStatus): RoutingContext {
  return { env: monitor.env, service: monitor.service, priority: monitor.priority, alertStatus, monitorType: monitor.type };
}

/** Rules run in order and the first match wins, as in Datadog team page routing. */
export function routeFor(team: Team, context: RoutingContext): RoutingRule | null {
  return team.routingRules.find((rule) => matches(rule.conditions, context)) ?? null;
}

export function heldUntil(rule: RoutingRule, t: number): number | null {
  if (!rule.supportHours || inWindow(t, rule.supportHours)) return null;
  return nextWindowStart(t, rule.supportHours);
}
