import type { LogEntry, ServicePoint, TelemetryBundle, TraceSummary } from './types';

/** Parsed free-text and `key:value` terms; `-key:value` negates, `key:a,b` matches any value. */
export interface ParsedQuery {
  terms: { key: string | null; values: string[]; negated: boolean }[];
}

export function parseQuery(text: string): ParsedQuery {
  const terms: ParsedQuery['terms'] = [];
  const pattern = /(-?)(?:([A-Za-z_][\w.@-]*):)?("([^"]*)"|\S+)/g;
  for (const match of text.matchAll(pattern)) {
    const [, negation, key, raw, quoted] = match;
    const value = quoted ?? raw;
    if (!value || value === 'AND') continue;
    terms.push({ key: key ?? null, values: key ? value.split(',').filter(Boolean) : [value], negated: negation === '-' });
  }
  return { terms };
}

/**
 * Evaluates a parsed query. `field(key)` returns the value for a key (or
 * `undefined` for unknown keys, which then match against the free text);
 * `text` is the haystack for bare words.
 */
export function matchQuery(query: ParsedQuery, field: (key: string) => string | undefined, text: string): boolean {
  const haystack = text.toLowerCase();
  return query.terms.every((term) => {
    const known = term.key ? field(term.key) : undefined;
    const hit = term.key && known !== undefined
      ? term.values.some((value) => wildcard(value, known))
      : term.values.some((value) => haystack.includes(value.toLowerCase().replace(/\*/g, '')));
    return term.negated ? !hit : hit;
  });
}

function wildcard(pattern: string, value: string): boolean {
  const lower = value.toLowerCase();
  const needle = pattern.toLowerCase();
  if (!needle.includes('*')) return lower === needle;
  const escaped = needle.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(lower);
}

export const WINDOWS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
] as const;

/** Cuts a bundle down to the newest `minutes`, relative to its newest record. */
export function windowBundle(bundle: TelemetryBundle, minutes: number) {
  const newest = Math.max(
    Date.parse(bundle.environment.lastSeen),
    bundle.logs.length ? Date.parse(bundle.logs[0].ts) : 0,
  );
  const since = newest - minutes * 60_000;
  const after = (iso: string) => Date.parse(iso) >= since;
  const logs: LogEntry[] = bundle.logs.filter((log) => after(log.ts));
  const traces: TraceSummary[] = bundle.traces.filter((trace) => after(trace.start));
  const servicePoints: ServicePoint[] = bundle.servicePoints.filter((point) => after(point.t));
  return {
    since,
    newest,
    logs,
    traces,
    servicePoints,
    logBuckets: bundle.logBuckets.filter((bucket) => after(bucket.t)),
    metrics: bundle.metrics.map((series) => ({ ...series, points: series.points.filter((point) => after(point.t)) })),
  };
}
