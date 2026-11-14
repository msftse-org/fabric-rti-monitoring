import { matchQuery, parseQuery, type ParsedQuery } from '@telemetry';

export type FieldResolver = (key: string) => string | undefined;

export type CompiledQuery =
  | { ok: true; empty: boolean; test: (fields: FieldResolver, text: string) => boolean }
  | { ok: false; error: string };

type Node =
  | { kind: 'term'; parsed: ParsedQuery }
  | { kind: 'cmp'; key: string; op: string; value: number }
  | { kind: 'not'; node: Node }
  | { kind: 'and' | 'or'; left: Node; right: Node };

interface Token {
  type: 'lparen' | 'rparen' | 'and' | 'or' | 'not' | 'term';
  text: string;
}

const TOKEN_PATTERN = /\(|\)|-?(?:[A-Za-z_][\w.@-]*:)?(?:"[^"]*"|[^\s()"]+)|"[^"]*"/g;
const COMPARISON = /^([A-Za-z_][\w.@-]*):(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/;

function tokenize(text: string): Token[] | string {
  if ((text.match(/"/g) ?? []).length % 2 === 1) return 'Unterminated quote';
  return [...text.matchAll(TOKEN_PATTERN)].map<Token>(([raw]) => {
    if (raw === '(') return { type: 'lparen', text: raw };
    if (raw === ')') return { type: 'rparen', text: raw };
    if (raw === 'AND' || raw === '&&') return { type: 'and', text: raw };
    if (raw === 'OR' || raw === '||') return { type: 'or', text: raw };
    if (raw === 'NOT') return { type: 'not', text: raw };
    return { type: 'term', text: raw };
  });
}

class SyntaxProblem extends Error {}

function parseTokens(tokens: Token[]): Node | null {
  let position = 0;
  const peek = () => tokens[position];

  function parseOr(): Node {
    let left = parseAnd();
    while (peek()?.type === 'or') {
      position += 1;
      left = { kind: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): Node {
    let left = parseUnary();
    for (;;) {
      const next = peek();
      if (!next || next.type === 'or' || next.type === 'rparen') return left;
      if (next.type === 'and') position += 1;
      left = { kind: 'and', left, right: parseUnary() };
    }
  }

  function parseUnary(): Node {
    const token = peek();
    if (!token) throw new SyntaxProblem('Unexpected end of query');
    position += 1;
    if (token.type === 'not') return { kind: 'not', node: parseUnary() };
    if (token.type === 'lparen') {
      const inner = parseOr();
      if (peek()?.type !== 'rparen') throw new SyntaxProblem('Missing closing parenthesis');
      position += 1;
      return inner;
    }
    if (token.type === 'term') {
      const comparison = COMPARISON.exec(token.text);
      if (comparison) return { kind: 'cmp', key: comparison[1], op: comparison[2], value: Number(comparison[3]) };
      return { kind: 'term', parsed: parseQuery(token.text) };
    }
    throw new SyntaxProblem(`Unexpected ${token.text}`);
  }

  if (tokens.length === 0) return null;
  const root = parseOr();
  if (position < tokens.length) throw new SyntaxProblem(peek().type === 'rparen' ? 'Unmatched closing parenthesis' : `Unexpected ${peek().text}`);
  return root;
}

function compare(op: string, left: number, right: number): boolean {
  if (op === '>') return left > right;
  if (op === '>=') return left >= right;
  if (op === '<') return left < right;
  return left <= right;
}

function evaluate(node: Node, fields: FieldResolver, text: string): boolean {
  switch (node.kind) {
    case 'term':
      return matchQuery(node.parsed, fields, text);
    case 'cmp': {
      const raw = fields(node.key);
      return raw !== undefined && Number.isFinite(Number(raw)) && compare(node.op, Number(raw), node.value);
    }
    case 'not':
      return !evaluate(node.node, fields, text);
    case 'and':
      return evaluate(node.left, fields, text) && evaluate(node.right, fields, text);
    case 'or':
      return evaluate(node.left, fields, text) || evaluate(node.right, fields, text);
  }
}

/**
 * Lucene-style boolean layer on top of the shared `key:value` matcher:
 * AND / OR / NOT, `-negation`, parentheses, wildcards, `key:a,b` and `key:>n` comparisons.
 * Adjacent terms are implicitly ANDed.
 */
export function compileQuery(text: string): CompiledQuery {
  const tokens = tokenize(text);
  if (typeof tokens === 'string') return { ok: false, error: tokens };
  try {
    const root = parseTokens(tokens);
    if (!root) return { ok: true, empty: true, test: () => true };
    return { ok: true, empty: false, test: (fields, haystack) => evaluate(root, fields, haystack) };
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxProblem ? error.message : 'Invalid query' };
  }
}

/** Adds a `key:value` (or `NOT key:value`) clause to a query, used by the filter buttons in detail panels. */
export function appendClause(query: string, key: string, value: string, negate: boolean): string {
  const quoted = /[\s()"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
  const clause = `${negate ? 'NOT ' : ''}${key}:${quoted}`;
  const current = query.trim();
  if (!current) return clause;
  return /\bOR\b|\|\|/.test(current) ? `(${current}) AND ${clause}` : `${current} AND ${clause}`;
}
