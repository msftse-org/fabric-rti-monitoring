/**
 * Vendor-neutral on-call model. The Datadog mock and the Fabric RTI on-call app
 * render the same objects with their own vocabulary, so a page has the same
 * number, responders and timestamps in both.
 */

export type Urgency = 'high' | 'low';
export type PageStatus = 'triggered' | 'acknowledged' | 'resolved';
/** `warn` and `alert` follow monitor thresholds; `no_data` is a heartbeat monitor. */
export type AlertStatus = 'alert' | 'warn' | 'no_data';
export type MonitorState = 'ok' | AlertStatus;
/** Contact channels a responder can be reached on. */
export type Channel = 'push' | 'sms' | 'voice' | 'email' | 'chat';

export interface NotificationRule {
  /** Minutes after the responder is paged. */
  delayMinutes: number;
  channel: Channel;
}

export interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  title: string;
  timezone: string;
  /** Avatar background colour. */
  color: string;
  teamIds: string[];
  preferences: { high: NotificationRule[]; low: NotificationRule[] };
}

export interface Restriction {
  /** 0 = Sunday ... 6 = Saturday, evaluated in the schedule time zone. */
  days: number[];
  startHour: number;
  /** Exclusive; 24 means end of day. */
  endHour: number;
}

export interface Layer {
  id: string;
  name: string;
  /** ISO UTC instant of the first handoff. */
  rotationStart: string;
  shiftHours: number;
  memberIds: string[];
  restriction?: Restriction;
}

export interface Override {
  id: string;
  userId: string;
  start: number;
  end: number;
  note: string;
}

export interface Schedule {
  id: string;
  name: string;
  teamId: string;
  timezone: string;
  /** Later layers take precedence over earlier ones; overrides win over every layer. */
  layers: Layer[];
  overrides: Override[];
}

export interface TargetRef {
  kind: 'user' | 'team' | 'schedule';
  id: string;
}

export interface EscalationStep {
  id: string;
  /** Minutes to wait for an acknowledgment before moving to the next step. */
  escalateAfterMinutes: number;
  targets: TargetRef[];
  assignment: 'notify-all' | 'round-robin';
}

export interface EscalationPolicy {
  id: string;
  name: string;
  teamId: string;
  steps: EscalationStep[];
  /** Extra passes through every step when nobody acknowledges. */
  repeat: number;
  resolveAfterExhausted: boolean;
}

export type RoutingField = 'env' | 'service' | 'priority' | 'alert_status' | 'monitor_type';

export interface RoutingCondition {
  field: RoutingField;
  values: string[];
}

export interface SupportHours {
  timezone: string;
  days: number[];
  startHour: number;
  endHour: number;
}

export type RoutingAction =
  | { kind: 'escalation'; policyId: string; urgency: Urgency | 'dynamic'; ackTimeoutMinutes?: number }
  | { kind: 'message'; channel: string };

export interface RoutingRule {
  id: string;
  /** Empty means "match everything". */
  conditions: RoutingCondition[];
  /** Outside these hours notifications are held until the next window opens. */
  supportHours?: SupportHours;
  actions: RoutingAction[];
}

export interface Team {
  id: string;
  name: string;
  /** Mention handle, for example `oncall-payments`. */
  handle: string;
  description: string;
  color: string;
  memberIds: string[];
  adminIds: string[];
  services: string[];
  scheduleIds: string[];
  escalationPolicyId: string;
  chatChannel: string;
  routingRules: RoutingRule[];
}

export type MonitorSignal = 'error_rate' | 'p95_latency' | 'request_rate' | 'no_data';

/** What an authored rule does when it fires, mirroring the Activator action types. */
export interface RuleActions {
  /** Start the team's paging flow. `routing` lets the team routing rules pick the urgency. */
  page: { urgency: 'routing' | Urgency } | null;
  /** Activator Teams message to people, by email address. */
  teams: { recipients: string[] } | null;
  /** Activator email. */
  email: { to: string[] } | null;
}

/** Present on rules created in the app's rule builder; seeded rules mirror Datadog monitors instead. */
export interface AuthoredRule {
  /** Stopped rules are kept but not evaluated, like a stopped Activator rule. */
  enabled: boolean;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  actions: RuleActions;
  /** Present only after the backend reads back a persisted Activator item. */
  fabric?: {
    itemId: string;
    workspaceId: string;
    revision: string;
    url: string;
  };
}

export interface Monitor {
  id: number;
  name: string;
  type: 'apm' | 'heartbeat';
  signal: MonitorSignal;
  /** Null for cluster-wide monitors. */
  service: string | null;
  env: string;
  teamId: string;
  priority: number;
  /** Evaluation window, a multiple of the history bucket size. */
  windowMinutes: number;
  warn: number | null;
  alert: number;
  /** `below` fires when the value drops to a threshold, for example a falling request rate. Defaults to `above`. */
  comparison?: 'above' | 'below';
  unit: 'ratio' | 'ms' | 'minutes' | 'rpm';
  /** Datadog-style monitor query, shown for reference. */
  query: string;
  message: string;
  authored?: AuthoredRule;
}

export interface MonitorPoint {
  t: number;
  value: number | null;
  state: MonitorState;
}

export interface MonitorStatus {
  monitorId: number;
  state: MonitorState;
  since: number;
  value: number | null;
  points: MonitorPoint[];
}

export interface AlertEpisode {
  monitorId: number;
  start: number;
  /** Null while the monitor is still in alert. */
  end: number | null;
  /** First non-OK status. */
  status: AlertStatus;
  /** When a `warn` episode crossed the alert threshold, if it did. */
  upgradedAt: number | null;
  /** The worst value: the highest, or the lowest for `below` rules. */
  peak: number | null;
}

export type PageEventKind =
  | 'triggered'
  | 'routed'
  | 'held'
  | 'notified'
  | 'skipped'
  | 'escalated'
  | 'repeated'
  | 'acknowledged'
  | 'ack_timeout'
  | 'urgency_changed'
  | 'message_sent'
  | 'reassigned'
  | 'snoozed'
  | 'commented'
  | 'incident_declared'
  | 'resolved';

export interface PageEvent {
  at: number;
  kind: PageEventKind;
  /** User who performed the action, when a person did. */
  actorId?: string;
  userIds?: string[];
  channels?: Channel[];
  stepIndex?: number;
  cycle?: number;
  scheduleId?: string;
  teamId?: string;
  urgency?: Urgency;
  /** `monitor`, `policy` or `user` for resolutions. */
  reason?: string;
  /** End of a snooze, for `snoozed` events. */
  until?: number;
  text: string;
}

export interface Page {
  id: number;
  source: 'monitor' | 'manual';
  title: string;
  description: string;
  urgency: Urgency;
  status: PageStatus;
  teamId: string;
  service: string | null;
  monitorId: number | null;
  alertStatus: AlertStatus | null;
  value: number | null;
  triggeredAt: number;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  resolvedAt: number | null;
  resolvedBy: string | null;
  resolution: 'monitor_recovered' | 'manual' | 'policy_exhausted' | null;
  /** Everyone notified so far. */
  responderIds: string[];
  /** Step currently waiting for an acknowledgment, while triggered. */
  currentStep: number | null;
  nextEscalationAt: number | null;
  ruleId: string | null;
  policyId: string | null;
  heldUntil: number | null;
  snoozedUntil: number | null;
  incidentId: string | null;
  /** Chronological. */
  events: PageEvent[];
}

export interface Segment {
  userId: string;
  start: number;
  end: number;
}

export interface ScheduleView {
  final: Segment[];
  layers: { layerId: string; segments: Segment[] }[];
  overrides: Segment[];
}

export interface OnCallSeed {
  users: User[];
  teams: Team[];
  schedules: Schedule[];
  policies: EscalationPolicy[];
  monitors: Monitor[];
  /** The persona the demo is viewed as, for "My Pages". */
  currentUserId: string;
}

export interface OnCallModel extends OnCallSeed {
  /** Evaluation instant: the bundle generation time, so live and snapshot data agree. */
  now: number;
  bucketMinutes: number;
  dataFrom: number;
  dataTo: number;
  monitorStatus: MonitorStatus[];
  episodes: AlertEpisode[];
  /** Newest first. */
  pages: Page[];
}

export type UserAction =
  | { kind: 'ack'; pageId: number; at: number; by: string }
  | { kind: 'resolve'; pageId: number; at: number; by: string }
  | { kind: 'reassign'; pageId: number; at: number; by: string; toUserId?: string; toTeamId?: string; comment?: string }
  | { kind: 'snooze'; pageId: number; at: number; by: string; until: number }
  | { kind: 'comment'; pageId: number; at: number; by: string; text: string }
  | { kind: 'incident'; pageId: number; at: number; by: string; incidentId: string; title: string }
  | { kind: 'manual'; pageId: number; at: number; by: string; teamId: string; title: string; description: string; urgency: Urgency };
