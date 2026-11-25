import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import { createTelemetryQueries } from '../query-bundle.mjs';
import { KUSTO_SCOPE, type LiveConfig } from './live-config';
import { ConnectRequiredError, createBrowserQuery } from './kusto-browser';
import { createHistoryCache } from './refresh-state';

export function createLiveClient(config: LiveConfig, redirectUri: string) {
  const msal = new PublicClientApplication({
    auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri },
    cache: { cacheLocation: 'sessionStorage' },
    system: { loggerOptions: { loggerCallback: () => undefined, piiLoggingEnabled: false } },
  });
  const ready = msal.initialize();
  // Attach a handler immediately; initialization failures are surfaced by load/connect.
  void ready.catch(() => undefined);
  let tokenRequest: Promise<string> | null = null;
  const token = async (forceRefresh = false) => {
    await ready;
    if (tokenRequest) return tokenRequest;
    const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
    if (!account) throw new ConnectRequiredError();
    tokenRequest = msal.acquireTokenSilent({ scopes: [KUSTO_SCOPE], account, forceRefresh })
      .then((result) => result.accessToken)
      .catch((error: unknown) => {
        if (error instanceof InteractionRequiredAuthError) throw new ConnectRequiredError();
        // Offline/token-endpoint outages must not disable automatic retry.
        // Never surface the original MSAL error (which may contain identity data).
        throw new Error('Silent session renewal failed. Automatic refresh will retry.');
      })
      .finally(() => { tokenRequest = null; });
    return tokenRequest;
  };
  const queries = createTelemetryQueries(createBrowserQuery(token));
  const history = createHistoryCache(() => queries.fetchHistory({ target: config.target }));
  return {
    async connect() {
      await ready;
      // Only called by the explicit button, never by polling or an effect.
      try {
        const result = await msal.acquireTokenPopup({ scopes: [KUSTO_SCOPE], redirectUri });
        msal.setActiveAccount(result.account);
      } catch {
        throw new ConnectRequiredError();
      }
    },
    async load(minutes: number, signal?: AbortSignal) {
      // Avoid issuing the full parallel bundle when no account can be restored.
      await token();
      signal?.throwIfAborted();
      const request = createBrowserQuery(token, fetch, signal);
      const pending = new Set<Promise<Record<string, unknown>[]>>();
      const currentQueries = createTelemetryQueries(async (csl, target) => {
        const result = request(csl, target);
        pending.add(result);
        try { return await result; } finally { pending.delete(result); }
      });
      const historyValue = history();
      try {
        return await currentQueries.fetchBundle({ target: config.target, minutes, source: 'live', history: historyValue });
      } finally {
        // Promise.all in the bundle factory rejects early. Drain sibling requests
        // before allowing another refresh, including on partial failures.
        await Promise.allSettled([...pending, historyValue]);
      }
    },
  };
}
