import { useEffect, useState } from 'react';

export const PAGE_SIZE = 200;

/** Shows the first `PAGE_SIZE` rows and grows in steps; resets whenever the row set changes. */
export function usePaging<T>(rows: T[]) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [rows]);
  return {
    visible: rows.length > limit ? rows.slice(0, limit) : rows,
    total: rows.length,
    hasMore: rows.length > limit,
    more: () => setLimit((current) => current + PAGE_SIZE),
  };
}
