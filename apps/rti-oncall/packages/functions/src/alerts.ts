import { createHash } from 'node:crypto';
import { reflexDefinition } from '../../../../oncall/src/activator.ts';
import { buildSeed } from '../../../../oncall/src/seed.ts';
import { draftToMonitor, monitorToDraft, RULE_WINDOWS, SERVICES, validateDraft, type RuleDraft } from '../../../../oncall/src/rules.ts';
import type { AlertRequest, AlertResponse } from '../../../../oncall/src/live.ts';
import type { Monitor } from '../../../../oncall/src/types.ts';

const API = 'https://api.fabric.microsoft.com/v1';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKER = 'RTI On-Call alert v1:';
const SPEC = 'rti-oncall-spec-v1:';
type Item = { id: string; displayName: string; description?: string; type: string };
type Entity = { uniqueIdentifier: string; type: string; payload: { description?: string; definition?: { type: string; settings?: { shouldRun: boolean } } } };
type Definition = { parts: { path: string; payload: string; payloadType: string }[] };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function appCoordinates(baseUrl: string) {
  const url = new URL(baseUrl);
  const match = url.pathname.match(/\/workspaces\/([0-9a-f-]{36})\/appbackends\/([0-9a-f-]{36})\/?$/i);
  assert(url.protocol === 'https:' && url.hostname.endsWith('.pbidedicated.windows.net') && match, 'The platform app workspace could not be resolved.');
  assert(GUID.test(match[1]) && GUID.test(match[2]), 'Invalid app coordinates.');
  return { workspaceId: match[1], appId: match[2] };
}

export function validateLiveDraft(input: unknown): RuleDraft {
  assert(input && typeof input === 'object', 'Provide an alert rule.');
  const draft = input as RuleDraft;
  assert(typeof draft.name === 'string' && typeof draft.message === 'string' && draft.message.length <= 2000, 'Use a name and a message of at most 2,000 characters.');
  assert(['error_rate', 'p95_latency', 'request_rate', 'no_data'].includes(draft.signal), 'Choose a supported signal.');
  assert(draft.service === null && draft.signal === 'no_data' || SERVICES.includes(draft.service as typeof SERVICES[number]), 'Choose one of the demo services.');
  assert(RULE_WINDOWS.includes(draft.windowMinutes as typeof RULE_WINDOWS[number]), 'Choose a supported evaluation window.');
  assert(['above', 'below'].includes(draft.comparison), 'Choose above or below.');
  assert(Number.isInteger(draft.priority) && draft.priority >= 1 && draft.priority <= 5, 'Priority must be between 1 and 5.');
  assert(typeof draft.alert === 'number' && (draft.warn === null || typeof draft.warn === 'number'), 'Enter numeric thresholds.');
  assert(draft.actions && draft.actions.page === null, 'Live alerts support native Teams and email actions. Simulated paging cannot be published.');
  const { teams, email } = draft.actions;
  assert(teams === null || teams && Array.isArray(teams.recipients), 'Provide Teams recipients.');
  assert(email === null || email && Array.isArray(email.to), 'Provide email recipients.');
  const recipients = [...(teams?.recipients ?? []), ...(email?.to ?? [])];
  assert(recipients.length <= 40 && recipients.every((value) => typeof value === 'string' && value.length <= 254), 'Use at most 40 valid recipients.');
  assert(recipients.every((value) => !/\.(example|invalid|test)$/i.test(value) && !/@(?:example\.(?:com|org|net)|localhost)$/i.test(value)), 'Replace demo addresses with real recipients before publishing.');
  const errors = validateDraft(draft, buildSeed(Date.now()).teams);
  assert(!Object.keys(errors).length, Object.values(errors).join(' '));
  return draft;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function revision(entities: Entity[]) {
  return createHash('sha256').update(JSON.stringify(canonical([...entities].sort((a, b) => a.uniqueIdentifier.localeCompare(b.uniqueIdentifier))))).digest('hex');
}

/** Only this app's workspace and its marked Activator items are reachable. */
export class AlertService {
  private readonly root: string;
  private readonly owner: string;
  private readonly deadline: number;
  constructor(
    private readonly workspaceId: string,
    private readonly appId: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    assert(GUID.test(workspaceId) && GUID.test(appId), 'Invalid app coordinates.');
    this.root = `/workspaces/${workspaceId}/items`;
    this.owner = `${MARKER}${appId}:`;
    this.deadline = Date.now() + 210_000;
  }

  private async request(path: string, method = 'GET', body?: unknown): Promise<Response> {
    assert(path.startsWith('/') && !path.includes('://'), 'Invalid Fabric API path.');
    for (let attempt = 0; ; attempt++) {
      assert(Date.now() < this.deadline, 'Fabric is still processing. Refresh the rule list before retrying; do not create another copy.');
      const response = await this.fetcher(`${API}${path}`, {
        method, redirect: 'error',
        headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, this.deadline - Date.now()))),
      });
      if (response.status === 429 && attempt < 3) {
        await this.sleep(this.delay(response));
        continue;
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { errorCode?: string; message?: string };
        const hint = response.status === 401 ? 'Sign in again.' : response.status === 403 ? 'The app owner needs Contributor access to the workspace and read access to the Eventhouse.' : response.status === 404 ? 'Refresh the rule list; this item may have been deleted.' : 'Refresh and retry.';
        throw new Error(`Fabric ${error.errorCode ?? response.status}: ${hint}`);
      }
      return response;
    }
  }

  private delay(response: Response) {
    const seconds = Number(response.headers.get('Retry-After') ?? 2);
    return Math.min(10_000, Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : 2000));
  }

  private async readJson(response: Response): Promise<any> {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  private async complete(response: Response, needsResult: boolean): Promise<any> {
    if (response.status !== 202) return this.readJson(response);
    const location = response.headers.get('Location');
    let id = response.headers.get('x-ms-operation-id');
    if (location) {
      const url = new URL(location, API);
      assert(url.origin === new URL(API).origin && /^\/v1\/operations\/[0-9a-f-]{36}\/?$/i.test(url.pathname), 'Fabric returned an unexpected operation URL.');
      id = url.pathname.split('/')[3];
    }
    assert(id && GUID.test(id), 'Fabric did not return an operation ID. Refresh before retrying.');
    for (let attempt = 0; attempt < 90; attempt++) {
      await this.sleep(this.delay(response));
      response = await this.request(`/operations/${id}`);
      const state = await this.readJson(response);
      if (state.status === 'Succeeded') return needsResult ? this.readJson(await this.request(`/operations/${id}/result`)) : null;
      assert(!['Failed', 'Cancelled', 'Canceled'].includes(state.status), `Fabric operation ${state.status}. Refresh before retrying.`);
    }
    throw new Error('Fabric is still processing. Refresh before retrying.');
  }

  private async items(type: string): Promise<Item[]> {
    const items: Item[] = [];
    let continuation: string | undefined;
    do {
      const page = await this.readJson(await this.request(`${this.root}?type=${type}${continuation ? `&continuationToken=${encodeURIComponent(continuation)}` : ''}`));
      assert(Array.isArray(page.value), 'Fabric returned an invalid item list.');
      items.push(...page.value);
      continuation = page.continuationToken;
      assert(items.length < 10_000, 'Too many items to enumerate.');
    } while (continuation);
    return items;
  }

  private async read(itemId: string) {
    assert(GUID.test(itemId), 'Invalid alert item ID.');
    const item = await this.readJson(await this.request(`${this.root}/${itemId}`)) as Item;
    assert(item.type === 'Reflex' && item.description?.startsWith(this.owner), 'This item is not an alert managed by this app.');
    const value = await this.complete(await this.request(`${this.root}/${itemId}/getDefinition`, 'POST'), true);
    const definition = value.definition as Definition;
    const part = definition.parts.find((part) => part.path === 'ReflexEntities.json');
    assert(part?.payloadType === 'InlineBase64', 'The alert definition cannot be read.');
    const entities = JSON.parse(Buffer.from(part.payload, 'base64').toString('utf8')) as Entity[];
    const spec = entities.find((entity) => entity.type === 'timeSeriesView-v1' && entity.payload.definition?.type === 'Event' && entity.payload.description?.startsWith(SPEC));
    assert(spec?.payload.description, 'This alert has no editable app definition. Open it in Fabric.');
    const monitor = JSON.parse(spec.payload.description.slice(SPEC.length)) as Monitor;
    assert(monitor.authored && Number.isSafeInteger(monitor.id) && item.description === `${this.owner}${monitor.id}`, 'The alert metadata does not match this app.');
    validateLiveDraft(monitorToDraft(monitor));
    const rules = entities.filter((entity) => entity.payload.definition?.type === 'Rule');
    assert(rules.length, 'The alert definition contains no rules.');
    monitor.authored.enabled = rules.some((entity) => entity.payload.definition?.settings?.shouldRun);
    monitor.authored.fabric = {
      itemId, workspaceId: this.workspaceId, revision: revision(entities),
      url: `https://app.fabric.microsoft.com/groups/${this.workspaceId}/reflexes/${itemId}`,
    };
    return { monitor, entities };
  }

  async handle(request: AlertRequest): Promise<AlertResponse> {
    assert(request && ['list', 'save', 'delete'].includes(request.operation), 'Choose a supported alert operation.');
    const databases = await this.items('KQLDatabase');
    const database = databases.find((item) => item.displayName === 'observability');
    assert(database, 'The observability KQL database was not found in this app workspace.');
    const result = { workspaceId: this.workspaceId, databaseItemId: database.id };
    if (request.operation === 'list') {
      const items = (await this.items('Reflex')).filter((item) => item.description?.startsWith(this.owner));
      const rules: Monitor[] = [];
      for (const item of items) rules.push((await this.read(item.id)).monitor);
      return { ...result, rules };
    }
    if (request.operation === 'delete') {
      const { monitor } = await this.read(request.itemId);
      assert(request.revision === monitor.authored!.fabric!.revision, 'This alert changed in Fabric. Refresh before deleting.');
      await this.complete(await this.request(`${this.root}/${request.itemId}`, 'DELETE'), false);
      return { ...result, deleted: true };
    }
    const draft = validateLiveDraft(request.draft);
    assert(Number.isSafeInteger(request.ruleId) && request.ruleId >= 900_001, 'Invalid alert rule ID.');
    assert(typeof request.enabled === 'boolean', 'Choose whether to start the alert.');
    let previous: Monitor | undefined;
    if (request.itemId) {
      previous = (await this.read(request.itemId)).monitor;
      assert(previous.id === request.ruleId, 'The rule ID does not match the Fabric item.');
      assert(request.revision === previous.authored!.fabric!.revision, 'This alert changed in Fabric. Refresh before saving.');
    } else {
      // A retry after a network failure must not create another alert.
      const existing = (await this.items('Reflex')).find((item) => item.description === `${this.owner}${request.ruleId}`);
      if (existing) {
        const saved = (await this.read(existing.id)).monitor;
        const expected = draftToMonitor(draft, request.ruleId, 'fabric-app', Date.now());
        assert(saved.authored?.enabled === request.enabled && JSON.stringify(canonical(monitorToDraft(saved))) === JSON.stringify(canonical(monitorToDraft(expected))), 'This request ID already belongs to a different alert or running state. Refresh or duplicate the rule before saving.');
        return { ...result, rule: saved };
      }
    }
    const team = buildSeed(Date.now()).teams.find((team) => team.id === draft.teamId)!;
    const monitor = draftToMonitor(draft, request.ruleId, 'fabric-app', Date.now(), previous, request.enabled);
    monitor.authored!.enabled = request.enabled;
    const exported = reflexDefinition(monitor, result, team.name, { start: request.enabled, placeholderRecipient: '', now: Date.now() });
    assert(!exported.rules.some((rule) => rule.placeholder), 'Choose a native action; placeholder actions cannot be published.');
    const entities = exported.entities as Entity[];
    const event = entities.find((entity) => entity.type === 'timeSeriesView-v1' && entity.payload.definition?.type === 'Event')!;
    event.payload.description = `${SPEC}${JSON.stringify(monitor)}`;
    const definition = { parts: [{ path: 'ReflexEntities.json', payloadType: 'InlineBase64', payload: Buffer.from(JSON.stringify(entities)).toString('base64') }] };
    let itemId = request.itemId;
    if (itemId) {
      await this.complete(await this.request(`${this.root}/${itemId}/updateDefinition`, 'POST', { definition }), false);
    } else {
      const item = await this.complete(await this.request(this.root, 'POST', {
        displayName: `${exported.displayName} ${monitor.id}`.slice(0, 150),
        description: `${this.owner}${monitor.id}`, type: 'Reflex', definition,
      }), true);
      assert(item?.id && GUID.test(item.id), 'Fabric accepted the alert but returned no item ID. Refresh before retrying.');
      itemId = item.id as string;
    }
    // Success is reported only after Fabric returns the persisted definition and actions.
    return { ...result, rule: (await this.read(itemId)).monitor };
  }
}
