import type { ReactNode } from 'react';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function Value({ value, depth }: { value: Json; depth: number }): ReactNode {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'string') return <span className="json-string">"{value}"</span>;
  if (typeof value === 'number') return <span className="json-number">{value}</span>;
  if (typeof value === 'boolean') return <span className="json-bool">{String(value)}</span>;
  const entries: [string, Json][] = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0) return <>{open + close}</>;
  const indent = '  '.repeat(depth + 1);
  return (
    <>
      {open}
      {entries.map(([key, child], index) => (
        <div key={key}>
          {indent}
          {!Array.isArray(value) && <span className="json-key">"{key}"</span>}
          {!Array.isArray(value) && ': '}
          <Value value={child} depth={depth + 1} />
          {index < entries.length - 1 ? ',' : ''}
        </div>
      ))}
      {'  '.repeat(depth)}
      {close}
    </>
  );
}

export function JsonView({ value }: { value: { [key: string]: Json } }) {
  return (
    <pre className="json-view">
      <Value value={value} depth={0} />
    </pre>
  );
}

export type { Json };
