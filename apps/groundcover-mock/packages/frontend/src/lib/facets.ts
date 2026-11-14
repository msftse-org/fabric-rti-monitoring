import { matchQuery, parseQuery } from '@telemetry';

export interface FacetDef<T> {
  id: string;
  label: string;
  /** Query keys (lower-case) that address this facet. The first is canonical. */
  keys: string[];
  value: (item: T) => string;
  display?: (value: string) => string;
  color?: (value: string) => string | undefined;
  /** Show a search box above the values. */
  searchable?: boolean;
  collapsed?: boolean;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  color?: string;
}

export interface FacetGroup {
  id: string;
  label: string;
  keys: string[];
  values: FacetValue[];
  checked: Set<string>;
  searchable: boolean;
  collapsed: boolean;
}

export type FieldResolver<T> = (item: T, key: string) => string | undefined;

const TOKEN_PATTERN = /-?(?:[A-Za-z_][\w.@-]*:)?(?:"[^"]*"|\S+)/g;

export function tokenize(text: string): string[] {
  return (text.match(TOKEN_PATTERN) ?? []).filter((token) => token !== 'AND');
}

export function tokenKey(token: string): string | null {
  const match = /^-?([A-Za-z_][\w.@-]*):/.exec(token);
  return match ? match[1].toLowerCase() : null;
}

export function quoteValue(value: string): string {
  return /[\s,"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
}

export function addToken(tokens: readonly string[], key: string, value: string, negate: boolean): string[] {
  const token = `${negate ? '-' : ''}${key}:${quoteValue(value)}`;
  return tokens.includes(token) ? [...tokens] : [...tokens, token];
}

export function filterItems<T>(
  items: readonly T[],
  tokens: readonly string[],
  resolve: FieldResolver<T>,
  text: (item: T) => string,
): T[] {
  if (!tokens.length) return [...items];
  const query = parseQuery(tokens.join(' '));
  return items.filter((item) => matchQuery(query, (key) => resolve(item, key), text(item)));
}

/**
 * Builds the checkbox groups. Counts for a group ignore that group's own
 * tokens, so unchecking a value never makes its siblings disappear.
 */
export function buildGroups<T>(
  items: readonly T[],
  defs: readonly FacetDef<T>[],
  tokens: readonly string[],
  resolve: FieldResolver<T>,
  text: (item: T) => string,
): FacetGroup[] {
  return defs.map((def) => {
    const others = tokens.filter((token) => !def.keys.includes(tokenKey(token) ?? ''));
    const own = tokens.filter((token) => def.keys.includes(tokenKey(token) ?? ''));
    const scoped = filterItems(items, others, resolve, text);
    const counts = new Map<string, number>();
    for (const item of scoped) counts.set(def.value(item), (counts.get(def.value(item)) ?? 0) + 1);
    // Values that are currently filtered out still need a row so they can be re-checked.
    for (const item of items) if (!counts.has(def.value(item))) counts.set(def.value(item), 0);

    const ownQuery = parseQuery(own.join(' '));
    const checked = new Set<string>();
    for (const value of counts.keys()) {
      if (!own.length || matchQuery(ownQuery, (key) => (def.keys.includes(key.toLowerCase()) ? value : undefined), '')) checked.add(value);
    }
    const values = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count, label: def.display?.(value) ?? value, color: def.color?.(value) }));
    return {
      id: def.id,
      label: def.label,
      keys: def.keys,
      values,
      checked,
      searchable: def.searchable ?? false,
      collapsed: def.collapsed ?? false,
    };
  });
}

function withoutKey(tokens: readonly string[], keys: string[]): string[] {
  return tokens.filter((token) => !keys.includes(tokenKey(token) ?? ''));
}

/** Rewrites the tokens so that exactly `selected` values of the group pass. */
function applySelection(tokens: readonly string[], group: FacetGroup, selected: Set<string>): string[] {
  const rest = withoutKey(tokens, group.keys);
  const all = group.values.map((entry) => entry.value);
  if (selected.size === all.length) return rest;
  const key = group.keys[0];
  if (selected.size > 0 && selected.size * 2 <= all.length) {
    return [...rest, `${key}:${[...selected].map(quoteValue).join(',')}`];
  }
  const excluded = all.filter((value) => !selected.has(value));
  return [...rest, `-${key}:${excluded.map(quoteValue).join(',')}`];
}

export function toggleFacet(tokens: readonly string[], group: FacetGroup, value: string): string[] {
  const selected = new Set(group.checked);
  if (!selected.delete(value)) selected.add(value);
  return applySelection(tokens, group, selected);
}

export function onlyFacet(tokens: readonly string[], group: FacetGroup, value: string): string[] {
  return applySelection(tokens, group, new Set([value]));
}
