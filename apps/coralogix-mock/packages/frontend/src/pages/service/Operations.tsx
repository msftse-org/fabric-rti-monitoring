import { useMemo } from 'react';
import { formatCount, formatDuration, type ServiceOperation } from '@telemetry';
import { Chip } from '../../components/Chips';
import { DataTable, useSortedRows, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/States';
import { useData } from '../../lib/data';
import { percent } from '../../lib/format';
import type { ServiceTabProps } from './types';

const COLUMNS: Column<ServiceOperation>[] = [
  { id: 'name', title: 'Operation', label: 'Operation', sortValue: (op) => op.name, render: (op) => <span className="mono">{op.name}</span> },
  { id: 'scenario', title: 'Resource', label: 'Resource', sortValue: (op) => op.scenario, render: (op) => <Chip>{op.scenario}</Chip> },
  { id: 'requests', title: 'Requests', label: 'Requests', align: 'right', sortValue: (op) => op.requests, render: (op) => formatCount(op.requests) },
  { id: 'errors', title: 'Errors', label: 'Errors', align: 'right', sortValue: (op) => op.errors, render: (op) => formatCount(op.errors) },
  { id: 'errorRate', title: 'Error rate', label: 'Error rate', align: 'right', sortValue: (op) => (op.requests ? op.errors / op.requests : 0), render: (op) => percent(op.requests ? op.errors / op.requests : 0) },
  { id: 'avg', title: 'Avg latency', label: 'Avg latency', align: 'right', sortValue: (op) => op.avgMs, render: (op) => formatDuration(op.avgMs) },
  { id: 'p50', title: 'P50', label: 'P50', align: 'right', sortValue: (op) => op.p50, render: (op) => formatDuration(op.p50) },
  { id: 'p95', title: 'P95', label: 'P95', align: 'right', sortValue: (op) => op.p95, render: (op) => formatDuration(op.p95) },
  { id: 'p99', title: 'P99', label: 'P99', align: 'right', sortValue: (op) => op.p99, render: (op) => formatDuration(op.p99) },
];

export function Operations({ service, filters }: ServiceTabProps) {
  const { bundle, win } = useData();
  const rows = useMemo(
    () =>
      service.summary.operations.filter((operation) => {
        if (filters.transaction && operation.scenario !== filters.transaction) return false;
        if (filters.statusCode === 'error' && operation.errors === 0) return false;
        return true;
      }),
    [service.summary.operations, filters.transaction, filters.statusCode],
  );
  const { sorted, sort, onSort } = useSortedRows(rows, COLUMNS, { id: 'requests', dir: 'desc' });
  const narrowed = win.since > Date.parse(bundle.environment.firstSeen);

  return (
    <section className="panel tab-panel">
      {narrowed && <p className="note">Operation statistics are computed over the whole telemetry bundle and are not narrowed by the time picker.</p>}
      {sorted.length === 0 ? (
        <EmptyState title="No operations match these filters" />
      ) : (
        <DataTable ariaLabel={`Operations of ${service.name}`} columns={COLUMNS} rows={sorted} rowKey={(op) => `${op.name}/${op.scenario}`} sort={sort} onSort={onSort} />
      )}
    </section>
  );
}
