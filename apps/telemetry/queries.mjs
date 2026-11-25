import { query } from './kusto.mjs';
import { createTelemetryQueries } from './query-bundle.mjs';

export { clampMinutes } from './query-bundle.mjs';
export const { fetchBundle, fetchHistory } = createTelemetryQueries(query);
