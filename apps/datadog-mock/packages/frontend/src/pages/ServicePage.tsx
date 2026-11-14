import { Fragment } from 'react';
import { FileText, Network } from 'lucide-react';
import { formatDuration, formatPercent } from '@telemetry';
import { useApp } from '../lib/app';
import { navigate, paths, type ServiceTab } from '../lib/router';
import type { Health } from '../lib/palette';
import { useInert } from '../lib/toast';
import { EmptyState, HealthChip, ServiceDot } from '../components/ui';
import { DependenciesTab } from './service/DependenciesTab';
import { LogsTab } from './service/LogsTab';
import { ResourcesTab } from './service/ResourcesTab';
import { SummaryTab } from './service/SummaryTab';
import { TracesTab } from './service/TracesTab';

interface NavItem {
  label: string;
  tab?: ServiceTab;
  group?: string;
}

const STRIP: { status: Health; label: string }[] = [
  { status: 'alert', label: 'ALERT' },
  { status: 'warn', label: 'WARN' },
  { status: 'nodata', label: 'NO DATA' },
  { status: 'ok', label: 'OK' },
];

const SUBNAV: NavItem[] = [
  { label: 'Service Summary', tab: 'summary', group: 'Overview' },
  { label: 'Resources', tab: 'resources' },
  { label: 'Deployments' },
  { label: 'Recent Changes' },
  { label: 'Traces', tab: 'traces', group: 'Investigate' },
  { label: 'Logs', tab: 'logs' },
  { label: 'Errors' },
  { label: 'Dependencies', tab: 'dependencies' },
  { label: 'Infrastructure', group: 'Infrastructure' },
  { label: 'Security' },
  { label: 'Cost' },
];

export function ServicePage({ service, tab }: { service: string; tab: ServiceTab }) {
  const data = useApp();
  const inert = useInert();
  const stat = data.statsByName[service];

  if (!stat) {
    return (
      <EmptyState
        title={`Service “${service}” not found`}
        action={
          <a className="btn btn--primary" href={`#${paths.catalog()}`}>
            Back to Service Catalog
          </a>
        }
      >
        Known services: {data.stats.map((item) => item.name).join(', ')}.
      </EmptyState>
    );
  }

  return (
    <div className="svc">
      <header className="svc__head">
        <span className="svc__glyph">
          <ServiceDot name={stat.name} size={20} />
        </span>
        <h1 className="svc__title">{stat.name}</h1>
        <span className="svc__var">env:{data.bundle.environment.environment}</span>
        <span className="svc__var">version:{stat.version}</span>
        <span className="svc__var">namespace:{data.bundle.environment.namespace}</span>
        <span className="grow" />
        <button type="button" className="btn" onClick={() => navigate(paths.traces(`service:${stat.name}`))}>
          <Network size={14} /> View traces
        </button>
        <button type="button" className="btn" onClick={() => navigate(paths.logs(`service:${stat.name}`))}>
          <FileText size={14} /> View logs
        </button>
      </header>
      <div className="svc__strip" role="list" aria-label="Monitor summary">
        {STRIP.map(({ status, label }) => {
          const count = stat.monitors.filter((monitor) => monitor.status === status).length;
          return count > 0 ? (
            <span key={status} role="listitem" className={`svc__strip-seg svc__strip-seg--${status}`} style={{ flexGrow: count }}>
              {label}: {count} Monitor{count === 1 ? '' : 's'}
            </span>
          ) : null;
        })}
      </div>
      <div className="svc__monitors" role="list" aria-label="Monitors">
        <HealthChip status={stat.status} />
        {stat.monitors.map((monitor) => (
          <span key={monitor.id} className="svc__monitor" role="listitem" title={monitor.threshold}>
            <span className={`svc__monitor-dot svc__monitor-dot--${monitor.status}`} aria-hidden="true" />
            {monitor.name}: <b>{monitor.value}</b>
          </span>
        ))}
        <span className="svc__monitor muted">
          p50 {formatDuration(stat.p50)} · p99 {formatDuration(stat.p99)} · {formatPercent(stat.errorRate)} errors
        </span>
      </div>
      <div className="svc__layout">
        <nav className="svc__nav" aria-label="Service sections">
          {SUBNAV.map((item) => (
            <Fragment key={item.label}>
              {item.group && <div className="svc__nav-group">{item.group}</div>}
              <button type="button" className="svc__nav-item" aria-current={item.tab === tab ? 'page' : undefined} onClick={() => (item.tab ? navigate(paths.service(stat.name, item.tab)) : inert())}>
                {item.label}
              </button>
            </Fragment>
          ))}
        </nav>
        <div className="svc__content">
          {tab === 'summary' && <SummaryTab stat={stat} />}
          {tab === 'resources' && <ResourcesTab stat={stat} />}
          {tab === 'traces' && <TracesTab stat={stat} />}
          {tab === 'logs' && <LogsTab stat={stat} />}
          {tab === 'dependencies' && <DependenciesTab stat={stat} />}
        </div>
      </div>
    </div>
  );
}
