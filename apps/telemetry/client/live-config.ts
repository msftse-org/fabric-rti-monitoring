export interface LiveConfig {
  clientId: string;
  tenantId: string;
  target: { uri: string; database: string };
}

export const KUSTO_SCOPE = 'https://kusto.kusto.windows.net/user_impersonation';

/** Deliberately excludes arbitrary hosts so a config typo cannot receive a token. */
export function validateTarget(uri: string, database: string): LiveConfig['target'] {
  const url = new URL(uri);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.kusto\.fabric\.microsoft\.com$/i.test(url.hostname)
    || url.username || url.password || url.search || url.hash || url.port || !/^\/?$/.test(url.pathname)) {
    throw new Error('Live telemetry requires an HTTPS Fabric Eventhouse cluster URL.');
  }
  if (!database.trim()) throw new Error('Live telemetry requires a Kusto database.');
  return { uri: url.origin, database: database.trim() };
}

export function readLiveConfig(env: Record<string, unknown>): { config: LiveConfig | null; error: string | null } {
  const values = ['VITE_ENTRA_CLIENT_ID', 'VITE_ENTRA_TENANT_ID', 'VITE_KUSTO_CLUSTER_URI', 'VITE_KUSTO_DATABASE']
    .map((key) => typeof env[key] === 'string' ? (env[key] as string).trim() : '');
  if (values.every((value) => !value)) return { config: null, error: null };
  try {
    if (values.some((value) => !value)) throw new Error('Live telemetry configuration is incomplete. Set all four public Entra/Kusto variables.');
    const [clientId, tenantId, uri, database] = values;
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guid.test(clientId) || !guid.test(tenantId)) throw new Error('Live telemetry requires a single-tenant Entra client and tenant ID.');
    return { config: { clientId, tenantId, target: validateTarget(uri, database) }, error: null };
  } catch (error) {
    return { config: null, error: error instanceof Error ? error.message : 'Invalid live telemetry configuration.' };
  }
}

export function telemetryTransport(env: Record<string, unknown>, configured: boolean, invalid = false): 'browser' | 'local' | 'snapshot' {
  if (env.VITE_TELEMETRY_MODE === 'snapshot') return 'snapshot';
  if (configured) return 'browser';
  // A production static host has no /api/telemetry endpoint.
  return env.PROD || invalid ? 'snapshot' : 'local';
}
