import { useMemo } from 'react';
import { formatCount, formatDuration } from '@telemetry';
import { Chip } from '../../components/Chips';
import { DataTable, useSortedRows, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/States';
import { useData } from '../../lib/data';
import { percent } from '../../lib/format';
import { transactionsFor, type TransactionRow } from '../../lib/transactions';
import type { ServiceTabProps } from './types';

const COLUMNS: Column<TransactionRow>[] = [
  { id: 'scenario', title: 'Transaction', label: 'Transaction', sortValue: (row) => row.scenario, render: (row) => <Chip>{row.scenario}</Chip> },
  { id: 'requests', title: 'Requests', label: 'Requests', align: 'right', sortValue: (row) => row.requests, render: (row) => formatCount(row.requests) },
  { id: 'errors', title: 'Errors', label: 'Errors', align: 'right', sortValue: (row) => row.errors, render: (row) => formatCount(row.errors) },
  { id: 'errorRate', title: 'Error rate', label: 'Error rate', align: 'right', sortValue: (row) => row.errorRate, render: (row) => percent(row.errorRate) },
  { id: 'avg', title: 'Avg latency', label: 'Avg latency', align: 'right', sortValue: (row) => row.avgMs, render: (row) => formatDuration(row.avgMs) },
];

export function Transactions({ service, filters }: ServiceTabProps) {
  const { win } = useData();
  const rows = useMemo(
    () => transactionsFor(win, service.name).filter((row) => (!filters.transaction || row.scenario === filters.transaction) && (filters.statusCode !== 'error' || row.errors > 0)),
    [win, service.name, filters.transaction, filters.statusCode],
  );
  const { sorted, sort, onSort } = useSortedRows(rows, COLUMNS, { id: 'requests', dir: 'desc' });

  return (
    <section className="panel tab-panel">
      <p className="note">Transactions are the request scenarios reported by the demo.requests and demo.request.duration metrics.</p>
      {sorted.length === 0 ? (
        <EmptyState title="No transactions match these filters" />
      ) : (
        <DataTable ariaLabel={`Transactions of ${service.name}`} columns={COLUMNS} rows={sorted} rowKey={(row) => row.scenario} sort={sort} onSort={onSort} />
      )}
    </section>
  );
}
