import { matchQuery, parseQuery, type ParsedQuery, type TraceSpan } from '@telemetry';
import type { TraceRow } from './window';

export interface TraceFieldDef {
  key: string;
  label: string;
  aliases: string[];
  values: (trace: TraceRow) => string[];
}

export const TRACE_FIELDS: TraceFieldDef[] = [
  { key: 'status', label: 'Status', aliases: [], values: (trace) => [trace.status === 'error' ? 'error' : 'ok'] },
  { key: 'service', label: 'Service', aliases: [], values: (trace) => trace.services },
  { key: 'resource', label: 'Resource', aliases: ['resource_name', 'operation_name'], values: (trace) => [trace.rootName] },
  { key: 'scenario', label: 'Scenario', aliases: [], values: (trace) => [trace.scenario] },
  { key: 'trace_id', label: 'Trace ID', aliases: ['traceid'], values: (trace) => [trace.traceId] },
];

export function traceKey(key: string): string | undefined {
  const normal = key.replace(/^@/, '').toLowerCase();
  return TRACE_FIELDS.find((field) => field.key === normal || field.aliases.includes(normal))?.key;
}

const DURATION_TERM = /^@?duration:(>=|<=|>|<)(\d+(?:\.\d+)?)(ms|s)?$/i;

export interface CompiledTraceQuery {
  parsed: ParsedQuery;
  test: (trace: TraceRow) => boolean;
}

export function compileTraceQuery(text: string, ignore?: string): CompiledTraceQuery {
  const parsed = parseQuery(text);
  const bounds: { op: string; value: number }[] = [];
  const terms = parsed.terms.filter((term) => {
    if (term.key === null) {
      const match = DURATION_TERM.exec(term.values[0] ?? '');
      if (match) {
        bounds.push({ op: match[1], value: Number(match[2]) * (match[3]?.toLowerCase() === 's' ? 1000 : 1) });
        return false;
      }
    }
    return !(ignore && term.key !== null && traceKey(term.key) === ignore);
  });
  const test = (trace: TraceRow) => {
    for (const bound of bounds) {
      const d = trace.durationMs;
      const ok = bound.op === '>' ? d > bound.value : bound.op === '>=' ? d >= bound.value : bound.op === '<' ? d < bound.value : d <= bound.value;
      if (!ok) return false;
    }
    return terms.every((term) => {
      const canonical = term.key ? traceKey(term.key) : undefined;
      let hit: boolean;
      if (canonical) {
        const def = TRACE_FIELDS.find((field) => field.key === canonical);
        const candidates = def ? def.values(trace) : [];
        hit = candidates.some((candidate) => matchQuery({ terms: [{ key: canonical, values: term.values, negated: false }] }, () => candidate, ''));
      } else {
        const haystack = `${trace.traceId} ${trace.rootName} ${trace.services.join(' ')} ${trace.scenario} ${trace.outcome}`;
        hit = matchQuery({ terms: [{ key: term.key, values: term.values, negated: false }] }, () => undefined, haystack);
      }
      return term.negated ? !hit : hit;
    });
  };
  return { parsed, test };
}

export function traceFacetCounts(traces: TraceRow[], text: string): Record<string, Map<string, number>> {
  const out: Record<string, Map<string, number>> = {};
  for (const field of TRACE_FIELDS) {
    if (field.key === 'trace_id') continue;
    const { test } = compileTraceQuery(text, field.key);
    const counts = new Map<string, number>();
    for (const trace of traces) {
      if (!test(trace)) continue;
      for (const value of new Set(field.values(trace))) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    out[field.key] = counts;
  }
  return out;
}

export interface SpanNode {
  span: TraceSpan;
  children: SpanNode[];
}

export function buildTree(spans: TraceSpan[]): SpanNode[] {
  const nodes = new Map<string, SpanNode>(spans.map((span) => [span.spanId, { span, children: [] }]));
  const roots: SpanNode[] = [];
  for (const span of spans) {
    const node = nodes.get(span.spanId)!;
    const parent = span.parentId ? nodes.get(span.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const order = (list: SpanNode[]) => {
    list.sort((a, b) => a.span.offsetMs - b.span.offsetMs);
    list.forEach((node) => order(node.children));
  };
  order(roots);
  return roots;
}

export interface FlatRow {
  node: SpanNode;
  depth: number;
}

export function flatten(roots: SpanNode[], collapsed: ReadonlySet<string>): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (node: SpanNode, depth: number) => {
    rows.push({ node, depth });
    if (!collapsed.has(node.span.spanId)) node.children.forEach((child) => walk(child, depth + 1));
  };
  roots.forEach((root) => walk(root, 0));
  return rows;
}

export function countDescendants(node: SpanNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000];

export function durationTicks(totalMs: number, target = 6): number[] {
  const step = TICK_STEPS.find((candidate) => totalMs / candidate <= target) ?? 10_000;
  const ticks: number[] = [];
  for (let value = 0; value <= totalMs + 1e-9; value += step) ticks.push(Number(value.toFixed(3)));
  return ticks;
}

export function formatTickMs(ms: number): string {
  if (ms === 0) return '0';
  if (ms >= 1000) return `${Number((ms / 1000).toFixed(2))}s`;
  return `${Number(ms.toFixed(2))}ms`;
}

export interface DurationBin {
  from: number;
  /** `Infinity` for the open-ended last bin. */
  to: number;
  label: string;
  ok: number;
  error: number;
}

const BIN_WIDTHS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** Equal-width duration bins up to the 99th percentile, with everything slower folded into the last bin. */
export function durationBins(traces: TraceRow[], count = 16): DurationBin[] {
  if (!traces.length) return [];
  const sorted = traces.map((trace) => trace.durationMs).sort((a, b) => a - b);
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  const width = BIN_WIDTHS.find((candidate) => p99 / candidate <= count) ?? 5000;
  const n = Math.max(2, Math.min(count, Math.ceil(p99 / width)));
  const bins: DurationBin[] = Array.from({ length: n }, (_, i) => ({
    from: i * width,
    to: i === n - 1 ? Infinity : (i + 1) * width,
    label: i === n - 1 ? `≥${formatTickMs(i * width)}` : formatTickMs(i * width),
    ok: 0,
    error: 0,
  }));
  for (const trace of traces) {
    const bin = bins[Math.min(n - 1, Math.floor(trace.durationMs / width))];
    if (trace.status === 'error') bin.error += 1;
    else bin.ok += 1;
  }
  return bins;
}
