import type { TraceSpan } from '@telemetry';

export interface SpanTree {
  /** Depth-first order, children sorted by start offset. */
  order: TraceSpan[];
  depth: Map<string, number>;
  /** Number of descendants per span. */
  descendants: Map<string, number>;
}

export function buildTree(spans: readonly TraceSpan[]): SpanTree {
  const ids = new Set(spans.map((span) => span.spanId));
  const children = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    const key = ids.has(span.parentId) ? span.parentId : '';
    children.set(key, [...(children.get(key) ?? []), span]);
  }
  for (const list of children.values()) list.sort((a, b) => a.offsetMs - b.offsetMs);

  const order: TraceSpan[] = [];
  const depth = new Map<string, number>();
  const descendants = new Map<string, number>();
  const walk = (span: TraceSpan, level: number): number => {
    order.push(span);
    depth.set(span.spanId, level);
    let count = 0;
    for (const child of children.get(span.spanId) ?? []) count += 1 + walk(child, level + 1);
    descendants.set(span.spanId, count);
    return count;
  };
  for (const root of children.get('') ?? []) walk(root, 0);
  return { order, depth, descendants };
}

/** Rows to draw once the subtrees of collapsed spans are hidden. */
export function visibleSpans(tree: SpanTree, collapsed: ReadonlySet<string>): TraceSpan[] {
  const rows: TraceSpan[] = [];
  let hideBelow: number | null = null;
  for (const span of tree.order) {
    const level = tree.depth.get(span.spanId) ?? 0;
    if (hideBelow !== null && level > hideBelow) continue;
    hideBelow = null;
    rows.push(span);
    if (collapsed.has(span.spanId)) hideBelow = level;
  }
  return rows;
}

export function traceExtent(spans: readonly TraceSpan[], fallback: number): number {
  return Math.max(fallback, ...spans.map((span) => span.offsetMs + span.durationMs), 0.001);
}
