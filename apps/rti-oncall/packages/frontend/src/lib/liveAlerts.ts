import { useCallback, useEffect, useRef, useState } from 'react';
import { RayfinClient } from '@microsoft/rayfin-client';
import { ensureSignedInWithFabric, initEmbeddedAuth } from '@microsoft/rayfin-auth-provider-fabric';
import { monitorToDraft, type AlertRequest, type AlertResponse, type Monitor } from '@oncall';
import type { AppFunctionsSchema } from '../../../functions/src/types';

const env = import.meta.env;
const configured = Boolean(env.VITE_RAYFIN_API_URL && env.VITE_RAYFIN_PUBLISHABLE_KEY && env.VITE_FABRIC_WORKSPACE_ID && env.VITE_FABRIC_ITEM_ID);
const client = configured ? new RayfinClient<Record<string, never>, AppFunctionsSchema>({
  baseUrl: env.VITE_RAYFIN_API_URL,
  publishableKey: env.VITE_RAYFIN_PUBLISHABLE_KEY,
  authStorage: false,
}) : null;
const options = {
  workspaceId: env.VITE_FABRIC_WORKSPACE_ID,
  projectId: env.VITE_FABRIC_ITEM_ID,
  fabricPortalUrl: env.VITE_FABRIC_PORTAL_URL || 'https://app.fabric.microsoft.com',
  returnOrigin: window.location.origin,
};

export const alertError = (error: unknown) => error instanceof Error ? error.message : 'Fabric could not complete this operation. Refresh and retry.';

export function useLiveAlerts() {
  const [rules, setRules] = useState<Monitor[]>([]);
  const [email, setEmail] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const invoke = useCallback(async (request: AlertRequest): Promise<AlertResponse> => {
    if (!client?.auth.getSession()?.isAuthenticated) throw new Error('Sign in to Fabric before managing live alerts.');
    const output = await client.functions.alertRules.invoke({ request: JSON.stringify(request) }, { timeoutMs: 240_000 });
    const result = typeof output === 'string' ? JSON.parse(output) : output;
    if (!result?.workspaceId || !result?.databaseItemId) throw new Error('Fabric returned an incomplete response. Refresh before retrying.');
    return result;
  }, []);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke({ operation: 'list' });
      if (current === generation.current) setRules(result.rules ?? []);
    } catch (error) {
      if (current === generation.current) setError(alertError(error));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [invoke]);

  const connect = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      // Called directly from the sign-in button so Fabric can open its SSO popup.
      const session = await ensureSignedInWithFabric(client.auth, options);
      if (!session.isAuthenticated) throw new Error('Sign-in was not completed.');
      setConnected(true);
      setEmail(session.user?.email ?? '');
      await refresh();
    } catch (error) {
      setError(alertError(error));
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.auth.onSessionChange((session) => {
      setConnected(Boolean(session?.isAuthenticated));
      setEmail(session?.user?.email ?? '');
      if (!session?.isAuthenticated) {
        generation.current++;
        setRules([]);
        setLoading(false);
      }
    });
    let active = true;
    void initEmbeddedAuth(client.auth, options).then((session) => {
      if (active && session?.isAuthenticated) void refresh();
    }).catch((error) => { if (active) setError(alertError(error)); });
    return () => { active = false; unsubscribe(); };
  }, [refresh]);

  const save = useCallback(async (monitor: Monitor) => {
    const fabric = monitor.authored?.fabric;
    const result = await invoke({
      operation: 'save', draft: monitorToDraft(monitor), ruleId: monitor.id,
      enabled: monitor.authored?.enabled ?? false, itemId: fabric?.itemId, revision: fabric?.revision,
    });
    if (!result.rule?.authored?.fabric) throw new Error('Fabric has not confirmed the saved alert. Refresh before retrying.');
    const saved = result.rule;
    generation.current++;
    setLoading(false);
    setRules((rules) => [...rules.filter((rule) => rule.id !== saved.id), saved]);
    return saved;
  }, [invoke]);

  const remove = useCallback(async (monitor: Monitor) => {
    const fabric = monitor.authored?.fabric;
    if (!fabric) throw new Error('This is not a live alert.');
    const result = await invoke({ operation: 'delete', itemId: fabric.itemId, revision: fabric.revision });
    if (!result.deleted) throw new Error('Fabric has not confirmed deletion. Refresh before retrying.');
    generation.current++;
    setLoading(false);
    setRules((rules) => rules.filter((rule) => rule.id !== monitor.id));
  }, [invoke]);

  return { configured, connected, loading, error, rules, email, connect, refresh, save, remove };
}
