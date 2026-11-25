import { defaultOtel, parseTargets } from './otel.ts';
import type { OtelSettings } from './otel.ts';

const targetFields = ['workspaceName', 'eventhouseName', 'queryUri', 'database', 'grafanaUrl', 'collectorName', 'collectorEndpoint'] as const;
type InventoryDraft = { settings: OtelSettings; onChange: (settings: OtelSettings) => void; autoAllowed: boolean; onAutoComplete?: () => void };
// A cancellable external resource: stable snapshots for useSyncExternalStore.
// Inventory is loaded once on subscription, and never applied over an edited/imported draft.
export function createTargetInventory(readDraft: () => InventoryDraft) {
  let snapshot = { status: '', loading: false };
  let controller: AbortController | null = null;
  let autoAttempted = false;
  const listeners = new Set<() => void>();
  function publish(update: Partial<typeof snapshot>) {
    snapshot = { ...snapshot, ...update };
    listeners.forEach(notify => notify());
  }
  async function load(auto = false) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const draft = readDraft().settings;
    publish({ loading: true, status: 'Loading deployment destination…' });
    try {
      const response = await fetch('./deployment-targets.json', { cache: 'no-store', signal: request.signal });
      if (!response.ok) throw new Error('Inventory unavailable');
      const targets = parseTargets(await response.json());
      if (request.signal.aborted) return;
      const current = readDraft();
      if (current.settings !== draft || (auto && !current.autoAllowed)) {
        publish({ status: 'Inputs changed while loading. Kept your draft; use Refresh destination to try again.' });
        return;
      }
      const next = { ...draft };
      for (const key of targetFields) next[key] = targets[key];
      current.onChange(next);
      publish({ status: `Destination loaded from deployment inventory (${new Date(targets.discoveredAt).toLocaleString()}). No live connection was made.` });
    } catch {
      if (!request.signal.aborted) publish({ status: 'Deployment inventory is unavailable. Enter the KQL query URI and database below, or retry under Edit destination.' });
    } finally {
      if (auto && controller === request) {
        autoAttempted = !request.signal.aborted;
        if (autoAttempted) readDraft().onAutoComplete?.();
      }
      if (!request.signal.aborted) publish({ loading: false });
    }
  }
  function subscribe(notify: () => void) {
    listeners.add(notify);
    const draft = readDraft();
    if (!autoAttempted && (!controller || controller.signal.aborted) && draft.autoAllowed && JSON.stringify(draft.settings) === JSON.stringify(defaultOtel())) void load(true);
    return () => {
      listeners.delete(notify);
      if (!listeners.size) controller?.abort();
    };
  }
  return { subscribe, getSnapshot: () => snapshot, load };
}
