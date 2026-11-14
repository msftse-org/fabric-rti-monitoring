import type { TraceSpan } from '@telemetry';

export interface TreeRow {
  span: TraceSpan;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

export interface TraceTree {
  roots: TraceSpan[];
  children: Map<string, TraceSpan[]>;
  parents: Map<string, string>;
  totalMs: number;
  maxDepth: number;
}

const byStart = (a: TraceSpan, b: TraceSpan) => a.offsetMs - b.offsetMs || a.depth - b.depth;

export function buildTree(spans: TraceSpan[]): TraceTree {
  const ids = new Set(spans.map((span) => span.spanId));
  const children = new Map<string, TraceSpan[]>();
  const parents = new Map<string, string>();
  const roots: TraceSpan[] = [];
  for (const span of spans) {
    if (span.parentId && ids.has(span.parentId)) {
      parents.set(span.spanId, span.parentId);
      children.set(span.parentId, [...(children.get(span.parentId) ?? []), span]);
    } else {
      roots.push(span);
    }
  }
  children.forEach((list) => list.sort(byStart));
  roots.sort(byStart);
  const totalMs = Math.max(0.001, ...spans.map((span) => span.offsetMs + span.durationMs));
  const maxDepth = Math.max(0, ...spans.map((span) => span.depth)) + 1;
  return { roots, children, parents, totalMs, maxDepth };
}

/** Ids of every span accepted by `test`, plus their ancestors so the tree stays connected. */
export function keepMatching(tree: TraceTree, spans: TraceSpan[], test: (span: TraceSpan) => boolean): { keep: Set<string>; matches: number } {
  const keep = new Set<string>();
  let matches = 0;
  for (const span of spans) {
    if (!test(span)) continue;
    matches += 1;
    let id: string | undefined = span.spanId;
    while (id && !keep.has(id)) {
      keep.add(id);
      id = tree.parents.get(id);
    }
  }
  return { keep, matches };
}

export function visibleRows(tree: TraceTree, collapsed: ReadonlySet<string>, keep: ReadonlySet<string> | null): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (span: TraceSpan, depth: number) => {
    if (keep && !keep.has(span.spanId)) return;
    const kids = (tree.children.get(span.spanId) ?? []).filter((child) => !keep || keep.has(child.spanId));
    const isCollapsed = collapsed.has(span.spanId);
    rows.push({ span, depth, hasChildren: kids.length > 0, collapsed: isCollapsed });
    if (!isCollapsed) kids.forEach((child) => walk(child, depth + 1));
  };
  tree.roots.forEach((root) => walk(root, 0));
  return rows;
}
