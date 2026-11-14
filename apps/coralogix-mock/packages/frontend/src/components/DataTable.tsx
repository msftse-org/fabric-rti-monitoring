import { ArrowDown, ArrowUp } from 'lucide-react';
import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface Column<T> {
  id: string;
  label: ReactNode;
  /** Plain text used for the accessible name of the sort button and CSV headers. */
  title: string;
  align?: 'right';
  width?: number | string;
  sortValue?: (row: T) => number | string;
  render: (row: T) => ReactNode;
}

export interface SortState {
  id: string;
  dir: 'asc' | 'desc';
}

export function useSortedRows<T>(rows: T[], columns: Column<T>[], initial: SortState | null, tieBreak?: (a: T, b: T) => number) {
  const [sort, setSort] = useState<SortState | null>(initial);

  const onSort = useCallback((id: string) => {
    setSort((current) => (current?.id === id ? { id, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' }));
  }, []);

  const sorted = useMemo(() => {
    const column = sort ? columns.find((candidate) => candidate.id === sort.id) : undefined;
    if (!sort || !column?.sortValue) return rows;
    const pick = column.sortValue;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = pick(a);
      const right = pick(b);
      const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return order * sign || (tieBreak ? tieBreak(a, b) : 0);
    });
  }, [rows, columns, sort, tieBreak]);

  return { sorted, sort, onSort };
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  ariaLabel: string;
  sort?: SortState | null;
  onSort?: (id: string) => void;
  /** Colour of the 3px bar drawn on the left edge of a row. */
  rowBar?: (row: T) => string | undefined;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  /** Click plus keyboard activation; makes rows focusable. */
  onRowActivate?: (row: T) => void;
  selectedKey?: string | null;
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, ariaLabel, sort, onSort, rowBar, rowClassName, onRowClick, onRowActivate, selectedKey, className = '' }: DataTableProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowActivate?.(row);
    }
  };

  return (
    <div className={`table-scroll ${className}`}>
      <table className="data-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort?.id === column.id ? sort.dir : null;
              return (
                <th
                  key={column.id}
                  scope="col"
                  className={column.align === 'right' ? 'is-right' : undefined}
                  style={column.width === undefined ? undefined : { width: column.width }}
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                >
                  {column.sortValue && onSort ? (
                    <button type="button" className="th-sort" onClick={() => onSort(column.id)} aria-label={`Sort by ${column.title}`}>
                      {column.label}
                      {sorted === 'asc' && <ArrowUp size={12} aria-hidden />}
                      {sorted === 'desc' && <ArrowDown size={12} aria-hidden />}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const bar = rowBar?.(row);
            const classes = [onRowClick || onRowActivate ? 'is-clickable' : '', key === selectedKey ? 'is-selected' : '', rowClassName?.(row) ?? ''].filter(Boolean).join(' ');
            return (
              <tr
                key={key}
                className={classes || undefined}
                style={bar ? { boxShadow: `inset 3px 0 0 ${bar}` } : undefined}
                tabIndex={onRowActivate ? 0 : undefined}
                aria-selected={onRowActivate ? key === selectedKey : undefined}
                onClick={onRowActivate ? () => onRowActivate(row) : onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowActivate ? (event) => onKeyDown(event, row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.id} className={column.align === 'right' ? 'is-right' : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
