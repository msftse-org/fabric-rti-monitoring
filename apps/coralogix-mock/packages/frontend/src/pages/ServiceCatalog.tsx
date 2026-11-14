import { Bell, Columns3, Download, Search, ThermometerSun, Waypoints } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatCount, formatDuration } from '@telemetry';
import { ApmHeader } from '../components/ApmHeader';
import { HealthChip, Chip, SloChips, healthColor } from '../components/Chips';
import { Segmented } from '../components/Controls';
import { DataTable, useSortedRows, type Column } from '../components/DataTable';
import { FilterSelect } from '../components/FilterSelect';
import { Popover } from '../components/Popover';
import { ServiceGlyph } from '../components/ServiceGlyph';
import { EmptyState } from '../components/States';
import { useData } from '../lib/data';
import { healthRank, type ServiceStats } from '../lib/derive';
import { downloadCsv } from '../lib/csv';
import { percent, perSecond } from '../lib/format';
import { href, navigate, paths } from '../lib/router';
import { formatTimestamp } from '../lib/time';
import { useToast } from '../lib/toast';

type CatalogColumn = Column<ServiceStats> & { optional?: boolean; csv: (service: ServiceStats) => string | number };

const COLUMNS: CatalogColumn[] = [
  {
    id: 'name',
    title: 'Service Name',
    label: 'Service Name',
    sortValue: (s) => s.name,
    render: (s) => (
      <a className="svc-link" href={href(paths.service(s.name))} onClick={(event) => event.stopPropagation()}>
        <ServiceGlyph name={s.name} />
        {s.name}
      </a>
    ),
    csv: (s) => s.name,
  },
  { id: 'env', title: 'Environments', label: 'Environments', render: () => <Chip>aks</Chip>, csv: () => 'aks' },
  { id: 'requests', title: 'Total requests', label: 'Total requests', sortValue: (s) => s.requests, render: (s) => formatCount(s.requests), csv: (s) => s.requests },
  { id: 'errorsPerSec', title: 'Errors/s', label: 'Errors/s', sortValue: (s) => s.errorsPerSec, render: (s) => perSecond(s.errorsPerSec), csv: (s) => s.errorsPerSec.toFixed(4) },
  { id: 'errorRate', title: 'Errors rate', label: 'Errors rate', sortValue: (s) => s.errorRate, render: (s) => percent(s.errorRate), csv: (s) => (s.errorRate * 100).toFixed(2) },
  { id: 'avgMs', title: 'Average latency', label: 'Average latency', sortValue: (s) => s.avgMs, render: (s) => formatDuration(s.avgMs), csv: (s) => s.avgMs.toFixed(2) },
  { id: 'slo', title: 'SLO status', label: 'SLO status', sortValue: (s) => s.sloBreached, render: (s) => <SloChips ok={s.sloOk} breached={s.sloBreached} />, csv: (s) => `${s.sloOk} OK / ${s.sloBreached} BREACHED` },
  {
    id: 'health',
    title: 'Health',
    label: (
      <>
        <ThermometerSun size={13} aria-hidden /> Health
      </>
    ),
    sortValue: (s) => healthRank(s.health),
    render: (s) => <HealthChip health={s.health} />,
    csv: (s) => s.health,
  },
  {
    id: 'incidents',
    title: 'Incidents',
    label: (
      <>
        <Bell size={13} aria-hidden /> Incidents
      </>
    ),
    sortValue: (s) => s.incidents,
    render: (s) =>
      s.incidents > 0 ? (
        <span className="incident-count" title="Derived from breached SLOs">
          <Bell size={14} aria-hidden /> {s.incidents}
        </span>
      ) : null,
    csv: (s) => s.incidents,
  },
  { id: 'status', title: 'Status', label: 'Status', sortValue: (s) => (s.active ? 0 : 1), render: (s) => <Chip tone={s.active ? 'ok' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Chip>, csv: (s) => (s.active ? 'Active' : 'Inactive') },
  { id: 'rps', title: 'Requests/s', label: 'Requests/s', optional: true, sortValue: (s) => s.rps, render: (s) => perSecond(s.rps), csv: (s) => s.rps.toFixed(4) },
  { id: 'outgoing', title: 'Outgoing calls/s', label: 'Outgoing calls/s', optional: true, sortValue: (s) => s.outgoingCallsPerSec, render: (s) => perSecond(s.outgoingCallsPerSec), csv: (s) => s.outgoingCallsPerSec.toFixed(4) },
  { id: 'p95', title: 'P95 latency', label: 'P95 latency', optional: true, sortValue: (s) => s.p95, render: (s) => formatDuration(s.p95), csv: (s) => s.p95.toFixed(2) },
  { id: 'apdex', title: 'Apdex', label: 'Apdex', optional: true, sortValue: (s) => s.apdex, render: (s) => s.apdex.toFixed(2), csv: (s) => s.apdex.toFixed(3) },
  { id: 'lastSeen', title: 'Last seen', label: 'Last seen', optional: true, sortValue: (s) => s.lastSeenMs, render: (s) => formatTimestamp(s.lastSeenMs), csv: (s) => new Date(s.lastSeenMs).toISOString() },
];

const DEFAULT_VISIBLE = COLUMNS.filter((column) => !column.optional).map((column) => column.id);

const byHealthThenErrors = (a: ServiceStats, b: ServiceStats) => healthRank(a.health) - healthRank(b.health) || b.errorRate - a.errorRate || a.name.localeCompare(b.name);

export function ServiceCatalog() {
  const { bundle, derived } = useData();
  const { inert } = useToast();
  const { environment } = bundle;
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<string | null>(null);
  const [env, setEnv] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);

  const columns = useMemo(() => COLUMNS.filter((column) => visible.includes(column.id)), [visible]);
  const operations = useMemo(() => [...new Set(bundle.services.flatMap((service) => service.operations.map((operation) => operation.name)))].sort(), [bundle.services]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return derived.services.filter((service) => {
      if (needle && !service.name.toLowerCase().includes(needle)) return false;
      if (cluster && cluster !== environment.cluster) return false;
      if (env && env !== environment.environment) return false;
      if (transaction && !service.summary.operations.some((operation) => operation.name === transaction)) return false;
      if (statusCode === 'error' && service.errors === 0) return false;
      if (statusCode === 'ok' && service.requests - service.errors === 0) return false;
      return true;
    });
  }, [derived.services, search, cluster, env, transaction, statusCode, environment]);

  const { sorted, sort, onSort } = useSortedRows(filtered, columns, { id: 'health', dir: 'asc' }, byHealthThenErrors);

  const exportCsv = () => downloadCsv('service-catalog.csv', columns.map((column) => column.title), sorted.map((service) => columns.map((column) => column.csv(service))));

  const toggleColumn = (id: string) => setVisible((current) => (current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]));

  return (
    <div className="page">
      <ApmHeader active="catalog" environment={environment.environment} />

      <div className="catalog-toolbar">
        <Segmented
          ariaLabel="Catalog view"
          value="health"
          onChange={(value) => value === 'profiles' && inert()}
          options={[
            { id: 'health', label: <><ThermometerSun size={13} aria-hidden /> Health</>, count: derived.services.length },
            { id: 'profiles', label: <><Waypoints size={13} aria-hidden /> Profiles</> },
          ]}
        />
      </div>

      <section className="panel catalog-panel">
        <div className="filter-row">
          <label className="search-box">
            <Search size={14} aria-hidden />
            <input type="search" placeholder="Search for services" aria-label="Search for services" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <FilterSelect label="cluster" value={cluster} options={[environment.cluster]} onChange={setCluster} />
          <FilterSelect label="Transaction" value={transaction} options={operations} onChange={setTransaction} />
          <FilterSelect label="env" value={env} options={[environment.environment]} onChange={setEnv} />
          <FilterSelect label="Status_Code" value={statusCode} options={['ok', 'error']} onChange={setStatusCode} />
          <span className="filter-spacer" />
          <button type="button" className="link-btn" onClick={inert}>
            No comparison
          </button>
          <button type="button" className="link-btn" onClick={exportCsv} disabled={sorted.length === 0}>
            <Download size={13} aria-hidden /> Export
          </button>
          <Popover ariaLabel="Manage Columns" triggerClassName="link-btn" trigger={<><Columns3 size={13} aria-hidden /> Manage Columns</>} align="right" panelClassName="columns-panel">
            <fieldset className="column-list">
              <legend>Visible columns</legend>
              {COLUMNS.map((column) => (
                <label key={column.id} className="check-row">
                  <input type="checkbox" checked={visible.includes(column.id)} disabled={column.id === 'name'} onChange={() => toggleColumn(column.id)} />
                  <span>{column.title}</span>
                </label>
              ))}
            </fieldset>
          </Popover>
        </div>

        {sorted.length === 0 ? (
          <EmptyState title="No services match these filters" hint="Clear the search or a filter to see every service again." />
        ) : (
          <DataTable
            ariaLabel="Service Catalog"
            className="catalog-table"
            columns={columns}
            rows={sorted}
            rowKey={(service) => service.name}
            sort={sort}
            onSort={onSort}
            rowBar={(service) => healthColor(service.health)}
            onRowClick={(service) => navigate(paths.service(service.name))}
          />
        )}

        <footer className="table-footer">
          <span>
            {sorted.length ? `1 - ${sorted.length}` : '0'} of {derived.services.length}
          </span>
        </footer>
      </section>
    </div>
  );
}
