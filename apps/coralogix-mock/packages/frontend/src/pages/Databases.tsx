import { formatCount, formatDuration } from '@telemetry';
import { ApmHeader } from '../components/ApmHeader';
import { HealthChip, healthColor } from '../components/Chips';
import { DataTable, useSortedRows, type Column } from '../components/DataTable';
import { ServiceGlyph } from '../components/ServiceGlyph';
import { EmptyState } from '../components/States';
import { useData } from '../lib/data';
import { healthRank, type DatabaseStats } from '../lib/derive';
import { percent } from '../lib/format';
import { href, paths } from '../lib/router';

const COLUMNS: Column<DatabaseStats>[] = [
  {
    id: 'name',
    title: 'Database',
    label: 'Database',
    sortValue: (db) => db.name,
    render: (db) => (
      <span className="svc-link">
        <ServiceGlyph name={db.name} database />
        {db.name}
      </span>
    ),
  },
  {
    id: 'callers',
    title: 'Called by',
    label: 'Called by',
    render: (db) => (
      <span className="chip-group">
        {db.callers.map((caller) => (
          <a key={caller} className="chip chip--neutral" href={href(paths.service(caller))} onClick={(event) => event.stopPropagation()}>
            {caller}
          </a>
        ))}
      </span>
    ),
  },
  { id: 'calls', title: 'Total calls', label: 'Total calls', align: 'right', sortValue: (db) => db.calls, render: (db) => formatCount(db.calls) },
  { id: 'errors', title: 'Errors', label: 'Errors', align: 'right', sortValue: (db) => db.errors, render: (db) => formatCount(db.errors) },
  { id: 'errorRate', title: 'Errors rate', label: 'Errors rate', align: 'right', sortValue: (db) => db.errorRate, render: (db) => percent(db.errorRate) },
  { id: 'avg', title: 'Average latency', label: 'Average latency', align: 'right', sortValue: (db) => db.avgMs, render: (db) => formatDuration(db.avgMs) },
  { id: 'p95', title: 'P95 latency', label: 'P95 latency', align: 'right', sortValue: (db) => db.p95, render: (db) => formatDuration(db.p95) },
  { id: 'health', title: 'Health', label: 'Health', sortValue: (db) => healthRank(db.health), render: (db) => <HealthChip health={db.health} /> },
];

export function Databases() {
  const { bundle, derived } = useData();
  const { sorted, sort, onSort } = useSortedRows(derived.databases, COLUMNS, { id: 'calls', dir: 'desc' });

  return (
    <div className="page">
      <ApmHeader active="databases" environment={bundle.environment.environment} />
      <section className="panel catalog-panel">
        {sorted.length === 0 ? (
          <EmptyState title="No databases observed" hint="No client spans to a datastore were found in this window." />
        ) : (
          <DataTable ariaLabel="Databases" className="catalog-table" columns={COLUMNS} rows={sorted} rowKey={(db) => db.name} sort={sort} onSort={onSort} rowBar={(db) => healthColor(db.health)} />
        )}
        <footer className="table-footer">
          <span>
            {sorted.length ? `1 - ${sorted.length}` : '0'} of {derived.databases.length}
          </span>
        </footer>
      </section>
    </div>
  );
}
