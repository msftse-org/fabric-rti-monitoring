/**
 * Turns a rule built in the app into a Fabric Activator (Reflex) item definition: a scheduled
 * KQL source on the Eventhouse, the event view over it, and one Activator rule per threshold and
 * action. The JSON follows the public `ReflexEntities.json` schema, so the item can be created
 * with `POST /v1/workspaces/{workspaceId}/items`.
 *
 * Activator's public definition has Teams and email actions but no Power Automate action, so the
 * "page the team" action is connected in the Activator editor after import. Every rule needs exactly
 * one action (Fabric rejects an empty ActStep), so a page-only rule carries a placeholder Teams
 * message until then.
 */
import type { Monitor } from './types.ts';

export interface FabricTarget {
  workspaceId: string;
  /** The KQL database item id inside the Eventhouse. */
  databaseItemId: string;
}

export interface ExportOptions {
  /** Start the rules on import. Off by default so recipients can be checked first. */
  start: boolean;
  /** Every Activator rule needs one action, so a page-only rule gets a placeholder Teams message to this address. */
  placeholderRecipient: string;
  /** Initial time-axis window; Activator advances it on every run. */
  now: number;
}

export interface ExportedRule {
  name: string;
  level: 'warn' | 'alert';
  action: 'Teams' | 'Email';
  /** A stand-in for the paging flow, imported stopped. */
  placeholder: boolean;
  condition: string;
}

export interface ReflexExport {
  displayName: string;
  description: string;
  query: string;
  entities: unknown[];
  rules: ExportedRule[];
  /** Body for `POST /v1/workspaces/{workspaceId}/items`. */
  createBody: { displayName: string; description: string; type: 'Reflex'; definition: { parts: { path: string; payload: string; payloadType: 'InlineBase64' }[] } };
  /** What still has to be done in Fabric after import. */
  followUps: string[];
}

const TEMPLATE_VERSION = '1.2.4';
const BUCKET_MINUTES = 5;
const POLL_SECONDS = 300;
/** The app holds an error-rate or latency rule's state below this many requests per window; the query does the same. */
const MIN_REQUESTS = 40;
const SERVICE = "tostring(ResourceAttributes['service.name'])";

/** Deterministic version-4-shaped GUIDs, so exporting the same rule twice gives the same definition. */
function guid(seed: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((part) => (part >>> 0).toString(16).padStart(8, '0')).join('');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * The KQL the Activator source runs every five minutes. It returns one row per completed
 * five-minute bucket whose end falls in Activator's `startTime`..`endTime` window, with the
 * rule's value computed over the rule's trailing window, the way this app evaluates it.
 */
export function activatorSourceKql(monitor: Monitor): string {
  const service = monitor.service ? quote(monitor.service) : null;
  const scope = service ? ` | extend Service = ${SERVICE} | where Service == ${service}` : " | extend Service = 'otel-demo'";
  if (monitor.signal === 'no_data') {
    return [
      'declare query_parameters(startTime:datetime, endTime:datetime);',
      `OTELTraces | where StartTime >= startTime - ${BUCKET_MINUTES}m and StartTime < endTime${scope}`,
      `| summarize Requests = count() by Service, BucketStart = bin(StartTime, ${BUCKET_MINUTES}m)`,
      `| extend Timestamp = BucketStart + ${BUCKET_MINUTES}m`,
      '| where Timestamp > startTime and Timestamp <= endTime',
      '| project Timestamp, Service, Requests',
    ].join(' ');
  }
  const size = Math.max(1, Math.round(monitor.windowMinutes / BUCKET_MINUTES));
  const value =
    monitor.signal === 'error_rate'
      ? 'round(WindowErrors / WindowRequests, 4)'
      : monitor.signal === 'p95_latency'
        ? 'round(WindowLatency / WindowRequests, 1)'
        : `round(WindowRequests / ${monitor.windowMinutes}.0, 1)`;
  const guard = monitor.signal === 'request_rate' ? '' : ` | where WindowRequests >= ${MIN_REQUESTS}`;
  return [
    'declare query_parameters(startTime:datetime, endTime:datetime);',
    `let lookback = ${monitor.windowMinutes}m;`,
    `OTELTraces | where StartTime >= startTime - lookback and StartTime < endTime and SpanKind == 'SPAN_KIND_SERVER'${scope}`,
    "| extend DurationMs = datetime_diff('microsecond', EndTime, StartTime) / 1000.0",
    `| make-series kind=nonempty Requests = count(), Errors = countif(SpanStatus == 'STATUS_CODE_ERROR'), P95 = percentile(DurationMs, 95) default = 0 on StartTime from bin(startTime - lookback, ${BUCKET_MINUTES}m) to endTime step ${BUCKET_MINUTES}m`,
    `| extend WindowRequests = series_fir(Requests, repeat(1, ${size}), false, false), WindowErrors = series_fir(Errors, repeat(1, ${size}), false, false), WindowLatency = series_fir(series_multiply(P95, Requests), repeat(1, ${size}), false, false)`,
    '| mv-expand BucketStart = StartTime to typeof(datetime), WindowRequests to typeof(real), WindowErrors to typeof(real), WindowLatency to typeof(real)',
    `| extend Timestamp = BucketStart + ${BUCKET_MINUTES}m`,
    `| where Timestamp > startTime and Timestamp <= endTime${guard}`,
    `| project Timestamp, Service = ${service ?? "'otel-demo'"}, Requests = tolong(WindowRequests), Value = ${value}`,
  ].join(' ');
}

const text = (value: string) => ({ type: 'string', value });
const strings = (name: string, values: string[]) => ({ name, type: 'array', values: values.map(text) });
const arg = (name: string, type: string, value: unknown) => ({ name, type, value });

function view(id: string, name: string, container: string, definition: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { uniqueIdentifier: id, payload: { name, ...extra, parentContainer: { targetUniqueIdentifier: container }, definition }, type: 'timeSeriesView-v1' };
}

export function reflexDefinition(monitor: Monitor, target: FabricTarget, teamName: string, options: ExportOptions): ReflexExport {
  const actions = monitor.authored?.actions ?? { page: { urgency: 'routing' as const }, teams: null, email: null };
  const key = `rti-oncall:${monitor.id}`;
  const ids = {
    container: guid(`${key}:container`),
    source: guid(`${key}:source`),
    event: guid(`${key}:event`),
  };
  const query = activatorSourceKql(monitor);
  const windowStart = Math.floor(options.now / (BUCKET_MINUTES * 60_000)) * BUCKET_MINUTES * 60_000;
  const entities: unknown[] = [
    { uniqueIdentifier: ids.container, payload: { name: monitor.name, type: 'kqlQueries' }, type: 'container-v1' },
    {
      uniqueIdentifier: ids.source,
      payload: {
        name: `${monitor.name} query`,
        runSettings: { executionIntervalInSeconds: POLL_SECONDS },
        query: { queryString: query },
        eventhouseItem: { itemId: target.databaseItemId, workspaceId: target.workspaceId, itemType: 'KustoDatabase' },
        queryParameters: [
          { name: 'startTime', type: 'DURATION_START', value: new Date(windowStart - BUCKET_MINUTES * 60_000).toISOString() },
          { name: 'endTime', type: 'DURATION_END', value: new Date(windowStart).toISOString() },
        ],
        eventTimeSettings: { timeFieldName: 'Timestamp', ingestionDelayInSeconds: 120, timeZone: 'UTC' },
        metadata: { workspaceId: target.workspaceId, measureName: '', querySetId: '', queryId: '' },
        parentContainer: { targetUniqueIdentifier: ids.container },
      },
      type: 'kqlSource-v1',
    },
    view(ids.event, `${monitor.name} events`, ids.container, {
      type: 'Event',
      instance: JSON.stringify({
        templateId: 'SourceEvent',
        templateVersion: TEMPLATE_VERSION,
        steps: [{ name: 'SourceEventStep', id: guid(`${key}:event:step`), rows: [{ name: 'SourceSelector', kind: 'SourceReference', arguments: [arg('entityId', 'string', ids.source)] }] }],
      }),
    }),
  ];

  const levels: { level: 'warn' | 'alert'; threshold: number }[] =
    monitor.signal === 'no_data' ? [{ level: 'alert', threshold: monitor.alert }] : [...(monitor.warn !== null ? [{ level: 'warn' as const, threshold: monitor.warn }] : []), { level: 'alert', threshold: monitor.alert }];
  const below = monitor.comparison === 'below';
  const bindings: { action: ExportedRule['action']; placeholder: boolean; row: (level: string) => unknown }[] = [];
  const headline = (level: string) => `${level === 'warn' ? 'Warning' : 'Alert'}: ${monitor.name}`;
  const body = monitor.message || `${monitor.name} fired for ${monitor.service ?? 'the cluster'} (team ${teamName}).`;
  const teams = (recipients: string[], placeholder: boolean) =>
    bindings.push({
      action: 'Teams',
      placeholder,
      row: (level) => ({
        name: 'TeamsBinding',
        kind: 'TeamsMessage',
        arguments: [
          arg('messageLocale', 'string', ''),
          strings('recipients', recipients),
          strings('headline', [placeholder ? `Page ${teamName}: ${headline(level)}` : headline(level)]),
          strings('optionalMessage', [placeholder ? `Placeholder for the "Page ${teamName}" paging flow. ${body}` : body]),
          { name: 'additionalInformation', type: 'array', values: [] },
        ],
      }),
    });
  if (actions.teams?.recipients.length) teams(actions.teams.recipients, false);
  if (actions.email?.to.length) {
    const to = actions.email.to;
    bindings.push({
      action: 'Email',
      placeholder: false,
      row: (level) => ({
        name: 'EmailBinding',
        kind: 'EmailMessage',
        arguments: [
          arg('messageLocale', 'string', 'en-us'),
          strings('sentTo', to),
          { name: 'copyTo', type: 'array', values: [] },
          { name: 'bCCTo', type: 'array', values: [] },
          strings('subject', [headline(level)]),
          strings('headline', [headline(level)]),
          strings('optionalMessage', [body]),
          { name: 'additionalInformation', type: 'array', values: [] },
        ],
      }),
    });
  }
  if (!bindings.length) teams([options.placeholderRecipient], true);

  const rules: ExportedRule[] = [];
  for (const { level, threshold } of levels) {
    for (const binding of bindings) {
      const name = `${monitor.name} - ${level}${bindings.length > 1 ? ` - ${binding.action}` : ''}`;
      const ruleKey = `${key}:rule:${level}:${binding.action}`;
      const detect =
        monitor.signal === 'no_data'
          ? [{ name: 'NoHeartbeat', kind: 'NoHeartbeat', arguments: [arg('duration', 'timeSpan', threshold * 60_000)] }]
          : [
              { name: 'EventFieldSelector', kind: 'EventField', arguments: [arg('fieldName', 'string', 'Value')] },
              { name: 'NumberBecomes', kind: 'NumberBecomes', arguments: [arg('op', 'string', below ? 'BecomesLessThanOrEqualTo' : 'BecomesGreaterThanOrEqualTo'), arg('value', 'number', threshold)] },
            ];
      entities.push(
        view(
          guid(ruleKey),
          name,
          ids.container,
          {
            type: 'Rule',
            instance: JSON.stringify({
              templateId: 'EventTrigger',
              templateVersion: TEMPLATE_VERSION,
              steps: [
                {
                  name: 'FieldsDefaultsStep',
                  id: guid(`${ruleKey}:fields`),
                  rows: [{ name: 'EventSelector', kind: 'Event', arguments: [{ name: 'event', kind: 'EventReference', type: 'complex', arguments: [arg('entityId', 'string', ids.event)] }] }],
                },
                { name: 'EventDetectStep', id: guid(`${ruleKey}:detect`), rows: detect },
                { name: 'ActStep', id: guid(`${ruleKey}:act`), rows: [binding.row(level)] },
              ],
            }),
            settings: { shouldRun: options.start && !binding.placeholder, shouldApplyRuleOnUpdate: false },
          },
          { description: 'Created by: rti-oncall rule builder' },
        ),
      );
      rules.push({
        name,
        level,
        action: binding.action,
        placeholder: binding.placeholder,
        condition: monitor.signal === 'no_data' ? `No new rows for ${threshold} minutes` : `Value ${below ? 'becomes less than or equal to' : 'becomes greater than or equal to'} ${threshold}`,
      });
    }
  }

  const followUps: string[] = [];
  const placeholder = bindings[0].placeholder;
  if (actions.page && placeholder) {
    followUps.push(`Replace each rule's placeholder Teams message with the custom action "Page ${teamName}" (the Power Automate paging flow), then start the rules. The public definition has no Power Automate action, and Activator needs one action per rule.`);
  } else if (actions.page) {
    followUps.push(`Add a rule with the custom action "Page ${teamName}" (the Power Automate paging flow) for each threshold; the public definition has no Power Automate action.`);
  }
  const fictional = [...(actions.teams?.recipients ?? []), ...(actions.email?.to ?? []), ...(placeholder ? [options.placeholderRecipient] : [])].filter((address) => address.endsWith('.example'));
  if (fictional.length) followUps.push(`Replace the demo roster addresses (${[...new Set(fictional)].join(', ')}) with real people before starting the rules.`);
  if (!options.start && !placeholder) followUps.push('Start the rules in Activator once the recipients are right.');

  const displayName = `rti-oncall ${monitor.name}`.replace(/[^\w\s.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const description = `Activator rules for "${monitor.name}", generated by the RTI On-Call rule builder.`;
  const json = JSON.stringify(entities, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return {
    displayName,
    description,
    query,
    entities,
    rules,
    createBody: { displayName, description, type: 'Reflex', definition: { parts: [{ path: 'ReflexEntities.json', payload: btoa(binary), payloadType: 'InlineBase64' }] } },
    followUps,
  };
}

/** The Azure CLI command that creates the item from the downloaded request body. */
export function createCommand(workspaceId: string, file: string): string {
  return `az rest --method post --resource https://api.fabric.microsoft.com --url https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/items --headers Content-Type=application/json --body @${file}`;
}

export interface IssueAlertActions {
  /** Teams recipients (users or channels' email addresses). */
  teams: string[];
  email: string[];
}

/**
 * The KQL an issue-alert source runs every five minutes. `IssueAlerts()` decides each trigger
 * once, on the transition (first seen, first event after resolution, mute expiry), so every row
 * is a new alert and the rule fires on every row.
 */
export const ISSUE_ALERTS_KQL = [
  'declare query_parameters(startTime:datetime, endTime:datetime);',
  'IssueAlerts(now() - startTime)',
  '| extend Timestamp = endTime',
  '| project Timestamp, AlertType, Fingerprint, Title, Service, Environment, Events, ExampleTraceID',
].join(' ');

/**
 * An Activator item that notifies on `new_issue`, `regression`, and `unmute` issue alerts, the
 * triggers an error tracker raises instead of thresholds. One rule per action; each fires on every
 * alert row (`OnEveryValue`). Imported stopped unless `options.start` is set.
 */
export function issueAlertsDefinition(target: FabricTarget, actions: IssueAlertActions, options: ExportOptions): ReflexExport {
  const key = 'rti-oncall:issue-alerts';
  const ids = { container: guid(`${key}:container`), source: guid(`${key}:source`), event: guid(`${key}:event`) };
  const windowStart = Math.floor(options.now / (BUCKET_MINUTES * 60_000)) * BUCKET_MINUTES * 60_000;
  const name = 'Issue alerts';
  const entities: unknown[] = [
    { uniqueIdentifier: ids.container, payload: { name, type: 'kqlQueries' }, type: 'container-v1' },
    {
      uniqueIdentifier: ids.source,
      payload: {
        name: `${name} query`,
        runSettings: { executionIntervalInSeconds: POLL_SECONDS },
        query: { queryString: ISSUE_ALERTS_KQL },
        eventhouseItem: { itemId: target.databaseItemId, workspaceId: target.workspaceId, itemType: 'KustoDatabase' },
        queryParameters: [
          { name: 'startTime', type: 'DURATION_START', value: new Date(windowStart - BUCKET_MINUTES * 60_000).toISOString() },
          { name: 'endTime', type: 'DURATION_END', value: new Date(windowStart).toISOString() },
        ],
        eventTimeSettings: { timeFieldName: 'Timestamp', ingestionDelayInSeconds: 120, timeZone: 'UTC' },
        metadata: { workspaceId: target.workspaceId, measureName: '', querySetId: '', queryId: '' },
        parentContainer: { targetUniqueIdentifier: ids.container },
      },
      type: 'kqlSource-v1',
    },
    view(ids.event, `${name} events`, ids.container, {
      type: 'Event',
      instance: JSON.stringify({
        templateId: 'SourceEvent',
        templateVersion: TEMPLATE_VERSION,
        steps: [{ name: 'SourceEventStep', id: guid(`${key}:event:step`), rows: [{ name: 'SourceSelector', kind: 'SourceReference', arguments: [arg('entityId', 'string', ids.source)] }] }],
      }),
    }),
  ];

  const headline = 'Issue alert: new issue, regression, or unmute';
  const body = 'An error issue was first seen, came back after it was resolved, or kept occurring after its mute expired. Open the Issues dashboard and search for the fingerprint in this event.';
  const fields = ['AlertType', 'Title', 'Service', 'Environment', 'Fingerprint', 'ExampleTraceID'];
  const bindings: { action: ExportedRule['action']; placeholder: boolean; row: unknown }[] = [];
  const recipients = actions.teams.length ? actions.teams : actions.email.length ? [] : [options.placeholderRecipient];
  if (recipients.length) {
    bindings.push({
      action: 'Teams',
      placeholder: !actions.teams.length,
      row: {
        name: 'TeamsBinding',
        kind: 'TeamsMessage',
        arguments: [arg('messageLocale', 'string', ''), strings('recipients', recipients), strings('headline', [headline]), strings('optionalMessage', [body]), strings('additionalInformation', fields)],
      },
    });
  }
  if (actions.email.length) {
    bindings.push({
      action: 'Email',
      placeholder: false,
      row: {
        name: 'EmailBinding',
        kind: 'EmailMessage',
        arguments: [
          arg('messageLocale', 'string', 'en-us'),
          strings('sentTo', actions.email),
          { name: 'copyTo', type: 'array', values: [] },
          { name: 'bCCTo', type: 'array', values: [] },
          strings('subject', [headline]),
          strings('headline', [headline]),
          strings('optionalMessage', [body]),
          strings('additionalInformation', fields),
        ],
      },
    });
  }

  const rules: ExportedRule[] = bindings.map((binding) => {
    const ruleName = `${name} - ${binding.action}`;
    const ruleKey = `${key}:rule:${binding.action}`;
    entities.push(
      view(
        guid(ruleKey),
        ruleName,
        ids.container,
        {
          type: 'Rule',
          instance: JSON.stringify({
            templateId: 'EventTrigger',
            templateVersion: TEMPLATE_VERSION,
            steps: [
              { name: 'FieldsDefaultsStep', id: guid(`${ruleKey}:fields`), rows: [{ name: 'EventSelector', kind: 'Event', arguments: [{ name: 'event', kind: 'EventReference', type: 'complex', arguments: [arg('entityId', 'string', ids.event)] }] }] },
              { name: 'EventDetectStep', id: guid(`${ruleKey}:detect`), rows: [{ name: 'OnEveryValue', kind: 'OnEveryValue', arguments: [] }] },
              { name: 'ActStep', id: guid(`${ruleKey}:act`), rows: [binding.row] },
            ],
          }),
          settings: { shouldRun: options.start && !binding.placeholder, shouldApplyRuleOnUpdate: false },
        },
        { description: 'Created by: rti-oncall issue alerts' },
      ),
    );
    return { name: ruleName, level: 'alert', action: binding.action, placeholder: binding.placeholder, condition: 'On every new_issue, regression, or unmute row from IssueAlerts()' };
  });

  const followUps: string[] = [];
  if (bindings.some((binding) => binding.placeholder)) followUps.push(`Replace the placeholder Teams recipient (${options.placeholderRecipient}) with real people, then start the rule.`);
  else if (!options.start) followUps.push('Start the rules in Activator once the recipients are right.');
  const json = JSON.stringify(entities, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const displayName = 'rti-oncall Issue alerts';
  const description = 'Activator rules for new issues, regressions, and unmutes, generated by the RTI On-Call app.';
  return {
    displayName,
    description,
    query: ISSUE_ALERTS_KQL,
    entities,
    rules,
    createBody: { displayName, description, type: 'Reflex', definition: { parts: [{ path: 'ReflexEntities.json', payload: btoa(binary), payloadType: 'InlineBase64' }] } },
    followUps,
  };
}
