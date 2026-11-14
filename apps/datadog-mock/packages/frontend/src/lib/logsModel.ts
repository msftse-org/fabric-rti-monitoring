import { matchQuery, parseQuery, type ParsedQuery } from '@telemetry';
import type { LogRow } from './window';

export interface FieldDef {
  key: string;
  label: string;
  aliases: string[];
  get: (log: LogRow, env: string) => string;
}

/** Facets shown in the sidebar, in display order; the first four mirror Datadog's "core" group. */
export const LOG_FIELDS: FieldDef[] = [
  { key: 'source', label: 'Source', aliases: [], get: () => 'otel' },
  { key: 'host', label: 'Host', aliases: ['node'], get: (log) => log.node },
  { key: 'service', label: 'Service', aliases: [], get: (log) => log.service },
  { key: 'status', label: 'Status', aliases: ['severity', 'level'], get: (log) => log.severity.toLowerCase() },
  { key: 'env', label: 'Env', aliases: [], get: (_log, env) => env },
  { key: 'pod', label: 'Pod', aliases: ['pod_name', 'kube_pod_name'], get: (log) => log.pod },
  { key: 'version', label: 'Version', aliases: [], get: (log) => log.version },
  { key: 'scenario', label: 'Scenario', aliases: [], get: (log) => log.scenario },
  { key: 'outcome', label: 'Outcome', aliases: [], get: (log) => log.outcome },
  { key: 'span_name', label: 'Span name', aliases: ['span.name', 'spanname'], get: (log) => log.spanName },
];

const HIDDEN_FIELDS: FieldDef[] = [
  { key: 'trace_id', label: 'Trace ID', aliases: ['traceid', 'dd.trace_id'], get: (log) => log.traceId },
  { key: 'span_id', label: 'Span ID', aliases: ['spanid', 'dd.span_id'], get: (log) => log.spanId },
];

const ALL_FIELDS = [...LOG_FIELDS, ...HIDDEN_FIELDS];

export type KeyResolver = (key: string) => string | undefined;

export function canonicalKey(key: string): string | undefined {
  const normal = key.replace(/^@/, '').toLowerCase();
  return ALL_FIELDS.find((field) => field.key === normal || field.aliases.includes(normal))?.key;
}

const DURATION_TERM = /^@?duration:(>=|<=|>|<)(\d+(?:\.\d+)?)(ms|s)?$/i;

interface DurationBound {
  op: string;
  value: number;
  negated: boolean;
}

function holds(duration: number | null, bound: DurationBound): boolean {
  if (duration === null) return false;
  const result = bound.op === '>' ? duration > bound.value : bound.op === '>=' ? duration >= bound.value : bound.op === '<' ? duration < bound.value : duration <= bound.value;
  return bound.negated ? !result : result;
}

export interface CompiledQuery {
  parsed: ParsedQuery;
  test: (log: LogRow) => boolean;
}

/** `ignore` drops every term on that facet so its own counts stay visible while it is filtered. */
export function compileLogQuery(text: string, env: string, ignore?: string): CompiledQuery {
  const parsed = parseQuery(text);
  const bounds: DurationBound[] = [];
  const terms = parsed.terms.filter((term) => {
    if (term.key === null) {
      const match = DURATION_TERM.exec(term.values[0] ?? '');
      if (match) {
        bounds.push({ op: match[1], value: Number(match[2]) * (match[3]?.toLowerCase() === 's' ? 1000 : 1), negated: term.negated });
        return false;
      }
    }
    return !(ignore && term.key !== null && canonicalKey(term.key) === ignore);
  });
  const query: ParsedQuery = { terms };
  const lookup = (log: LogRow) => (key: string) => {
    const canonical = canonicalKey(key);
    return canonical ? ALL_FIELDS.find((field) => field.key === canonical)?.get(log, env) : undefined;
  };
  const test = (log: LogRow) => {
    if (bounds.some((bound) => !holds(log.durationMs, bound))) return false;
    if (!terms.length) return true;
    const haystack = `${log.body} ${log.service} ${log.spanName} ${log.scenario} ${log.outcome} ${log.traceId} ${log.pod}`;
    return matchQuery(query, lookup(log), haystack);
  };
  return { parsed, test };
}

function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
}

export function serializeQuery(parsed: ParsedQuery): string {
  return parsed.terms
    .map((term) => `${term.negated ? '-' : ''}${term.key ? `${term.key}:` : ''}${term.values.map(quote).join(',')}`)
    .join(' ');
}

export function facetSelection(parsed: ParsedQuery, key: string, canonical: KeyResolver = canonicalKey): { include: string[]; exclude: string[] } {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const term of parsed.terms) {
    if (term.key && canonical(term.key) === key) (term.negated ? exclude : include).push(...term.values.map((value) => value.toLowerCase()));
  }
  return { include, exclude };
}

/** Adds or removes `value` from the matching `key:` (or `-key:`) term and returns the new query text. */
export function toggleFacet(text: string, key: string, value: string, exclude = false, canonical: KeyResolver = canonicalKey): string {
  const parsed = parseQuery(text);
  const index = parsed.terms.findIndex((term) => term.key && canonical(term.key) === key && term.negated === exclude);
  if (index < 0) {
    parsed.terms.push({ key, values: [value], negated: exclude });
  } else {
    const term = parsed.terms[index];
    const has = term.values.some((existing) => existing.toLowerCase() === value.toLowerCase());
    term.values = has ? term.values.filter((existing) => existing.toLowerCase() !== value.toLowerCase()) : [...term.values, value];
    if (!term.values.length) parsed.terms.splice(index, 1);
  }
  return serializeQuery(parsed);
}

export function facetCounts(logs: LogRow[], text: string, env: string): Record<string, Map<string, number>> {
  const out: Record<string, Map<string, number>> = {};
  for (const field of LOG_FIELDS) {
    const { test } = compileLogQuery(text, env, field.key);
    const counts = new Map<string, number>();
    for (const log of logs) {
      if (!test(log)) continue;
      const value = field.get(log, env);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    out[field.key] = counts;
  }
  return out;
}

export function fieldValue(log: LogRow, key: string, env: string): string {
  return ALL_FIELDS.find((field) => field.key === key)?.get(log, env) ?? '';
}

export const GROUP_FIELDS = LOG_FIELDS.filter((field) => ['status', 'service', 'pod', 'scenario', 'outcome', 'span_name'].includes(field.key));

export function isErrorLog(log: Pick<LogRow, 'severity'>): boolean {
  return log.severity === 'ERROR' || log.severity === 'FATAL';
}
