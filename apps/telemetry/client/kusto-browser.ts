import { validateTarget } from './live-config.ts';

export class ConnectRequiredError extends Error {
  constructor() {
    super('Sign in to connect live Eventhouse data.');
    this.name = 'ConnectRequiredError';
  }
}

export class KustoHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 401 ? 'Live session expired. Connect live data again.'
      : status === 403 ? 'Eventhouse access denied. Ask an administrator for database viewer access, then retry.'
        : status === 429 ? 'Eventhouse is busy. Automatic refresh will retry.'
          : `Eventhouse request failed (HTTP ${status}). Automatic refresh will retry.`);
    this.name = 'KustoHttpError';
    this.status = status;
  }
}

/** v1 can return HTTP 200 alongside partial query failures. Never publish those rows. */
export function parseKustoRows(body: unknown): Record<string, unknown>[] {
  const result = body as {
    error?: unknown; Exceptions?: unknown[]; HasErrors?: boolean;
    Tables?: { TableName?: string; Columns: { ColumnName: string }[]; Rows: unknown[][] }[];
  } | null;
  if (!result || result.error || result.HasErrors || result.Exceptions?.length || !Array.isArray(result.Tables)) {
    throw new Error('Eventhouse returned incomplete results. Automatic refresh will retry.');
  }
  for (const table of result.Tables) {
    if (!Array.isArray(table.Columns) || !Array.isArray(table.Rows)) throw new Error('Unexpected Eventhouse response.');
    if (table.TableName === 'QueryStatus') {
      const severity = table.Columns.findIndex((column) => column.ColumnName === 'Severity');
      if (severity >= 0 && table.Rows.some((row) => row[severity] !== null && Number(row[severity]) <= 2)) {
        throw new Error('Eventhouse returned a partial query failure. Automatic refresh will retry.');
      }
    }
    if (table.TableName === 'QueryCompletionInformation') {
      const info = table.Columns.findIndex((column) => column.ColumnName === 'StatusDescription');
      if (info >= 0 && table.Rows.some((row) => row[info] && row[info] !== 'Query completed successfully')) {
        throw new Error('Eventhouse did not complete the query. Automatic refresh will retry.');
      }
    }
  }
  const table = result.Tables.find((item) => item.TableName === 'PrimaryResult') ?? result.Tables[0];
  if (!table || table.TableName === 'QueryStatus') throw new Error('Eventhouse returned no result table.');
  return table.Rows.map((row) => Object.fromEntries(table.Columns.map((column, index) => [column.ColumnName, row[index]])));
}

export function createBrowserQuery(
  token: (forceRefresh?: boolean) => Promise<string>,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  return async (csl: string, input: { uri: string; database: string }): Promise<Record<string, unknown>[]> => {
    const target = validateTarget(input.uri, input.database);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetcher(`${target.uri}/v1/rest/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token(attempt > 0)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db: target.database, csl,
          properties: { Options: { request_readonly: true, servertimeout: '00:00:20' } },
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) throw new KustoHttpError(response.status);
      return parseKustoRows(await response.json());
    }
    throw new KustoHttpError(401);
  };
}
