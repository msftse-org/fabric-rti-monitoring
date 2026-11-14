import { Eraser, ThermometerSun } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip, HealthChip } from '../components/Chips';
import { FilterSelect } from '../components/FilterSelect';
import { ServiceGlyph } from '../components/ServiceGlyph';
import { EmptyState } from '../components/States';
import { Tabs } from '../components/Tabs';
import { TimeControls } from '../components/TimeControls';
import { useData } from '../lib/data';
import { href, SERVICE_TABS, paths, type ServiceTab } from '../lib/router';
import { useToast } from '../lib/toast';
import { ApiErrors } from './service/ApiErrors';
import { Operations } from './service/Operations';
import { Overview } from './service/Overview';
import { Resources } from './service/Resources';
import { ServiceLogs } from './service/ServiceLogs';
import { Slo } from './service/Slo';
import { Transactions } from './service/Transactions';
import type { DrillFilters } from './service/types';

const TAB_LABELS: Record<ServiceTab, string> = {
  overview: 'Overview',
  operations: 'Operations',
  transactions: 'Transactions',
  'api-errors': 'API Errors',
  resources: 'Resources',
  logs: 'Logs',
  slo: 'SLO',
};

const NO_FILTERS: DrillFilters = { cluster: null, transaction: null, env: null, statusCode: null };

export function ServiceDrilldown({ name, tab }: { name: string; tab: ServiceTab }) {
  const { bundle, derived } = useData();
  const { inert } = useToast();
  const [filters, setFilters] = useState<DrillFilters>(NO_FILTERS);
  const service = derived.byName.get(name);
  const scenarios = useMemo(() => [...new Set((service?.summary.operations ?? []).map((operation) => operation.scenario))].sort(), [service]);

  if (!service) {
    return (
      <div className="page">
        <EmptyState
          title={`No service named ${name}`}
          hint="It did not report any telemetry in this bundle."
          action={
            <a className="btn" href={href(paths.catalog())}>
              Back to Service Catalog
            </a>
          }
        />
      </div>
    );
  }

  const { environment } = bundle;
  const set = (patch: Partial<DrillFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const props = { service, filters };

  return (
    <div className="page">
      <header className="page-head drill-head">
        <a className="crumb-link" href={href(paths.catalog())}>
          Service Catalog - Health
        </a>
        <div className="drill-title">
          <ServiceGlyph name={service.name} />
          <h1>{service.name}</h1>
          <span className="health-line">
            <ThermometerSun size={14} aria-hidden /> Health : <HealthChip health={service.health} />
          </span>
          <Chip tone={service.active ? 'ok' : 'neutral'}>{service.active ? 'Active' : 'Inactive'}</Chip>
        </div>
        <div className="page-head-row">
          <Tabs
            ariaLabel={`${service.name} sections`}
            active={tab}
            onSelect={(id) => (id === 'analyze' || id === 'profiles') && inert()}
            items={[
              ...SERVICE_TABS.map((id) => ({ id, label: TAB_LABELS[id], href: href(paths.service(service.name, id)) })),
              { id: 'analyze', label: 'Analyze', badge: <span className="tab-badge">Preview</span> },
              { id: 'profiles', label: 'Profiles', badge: <span className="tab-badge tab-badge--new">New</span> },
            ]}
          />
          <TimeControls />
        </div>
      </header>

      <div className="filter-row filter-row--drill">
        <FilterSelect label="cluster" value={filters.cluster} options={[environment.cluster]} onChange={(cluster) => set({ cluster })} />
        <FilterSelect label="Transaction" value={filters.transaction} options={scenarios} onChange={(transaction) => set({ transaction })} />
        <FilterSelect label="env" value={filters.env} options={[environment.environment]} onChange={(env) => set({ env })} />
        <FilterSelect label="Status_Code" value={filters.statusCode} options={['ok', 'error']} onChange={(statusCode) => set({ statusCode })} />
        <button type="button" className="icon-btn" aria-label="Clear filters" title="Clear filters" onClick={() => setFilters(NO_FILTERS)}>
          <Eraser size={13} />
        </button>
      </div>

      {tab === 'overview' && <Overview {...props} />}
      {tab === 'operations' && <Operations {...props} />}
      {tab === 'transactions' && <Transactions {...props} />}
      {tab === 'api-errors' && <ApiErrors {...props} />}
      {tab === 'resources' && <Resources {...props} />}
      {tab === 'logs' && <ServiceLogs {...props} />}
      {tab === 'slo' && <Slo {...props} />}
    </div>
  );
}
