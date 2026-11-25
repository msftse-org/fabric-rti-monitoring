declare module '*query-bundle.mjs' {
  type TelemetryBundle = import('./types').TelemetryBundle;
  type TelemetryHistory = import('./types').TelemetryHistory;
  type Target = { uri: string; database: string };
  export function createTelemetryQueries(query: (csl: string, target: Target) => Promise<Record<string, unknown>[]>): {
    clampMinutes: (minutes: number) => number;
    fetchBundle: (options: { target: Target; minutes?: number; source?: 'live' | 'snapshot'; history?: TelemetryHistory | Promise<TelemetryHistory> }) => Promise<TelemetryBundle>;
    fetchHistory: (options: { target: Target; historyDays?: number }) => Promise<TelemetryHistory>;
  };
}
