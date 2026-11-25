import { CircleHelp, Menu, Sparkles } from 'lucide-react';
import { TelemetryStatus } from '@telemetry';
import { useDataState } from '../lib/data';
import { DISCLAIMER } from '../lib/disclaimer';
import { useRoute, type Route } from '../lib/router';
import { useToast } from '../lib/toast';
import { Popover } from './Popover';

function breadcrumb(route: Route): string[] {
  switch (route.page) {
    case 'catalog':
      return ['APM', 'Service Catalog'];
    case 'map':
      return ['APM', 'Service Map'];
    case 'databases':
      return ['APM', 'Databases'];
    case 'service':
      return ['APM', 'Service Catalog', route.name];
    case 'logs':
      return ['Explore', 'Logs'];
    case 'tracing':
      return ['Explore', 'Tracing'];
    case 'trace':
      return ['Explore', 'Tracing', `Trace ${route.traceId.slice(0, 8)}`];
    case 'alert-definitions':
      return ['Alerts', 'Alert Definitions'];
    case 'alert-incidents':
      return ['Alerts', 'Incidents'];
  }
}

function DataIndicator() {
  const { telemetry } = useDataState();
  return <TelemetryStatus telemetry={telemetry} />;
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const route = useRoute();
  const { inert } = useToast();
  const { telemetry } = useDataState();
  const crumbs = breadcrumb(route);
  const env = telemetry.bundle?.environment;

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar-menu" aria-label="Open navigation" onClick={onMenu}>
        <Menu size={18} />
      </button>
      <ol className="breadcrumb" aria-label="Breadcrumb">
        <li>Coralogix Mock</li>
        {crumbs.map((crumb, index) => (
          <li key={crumb} aria-current={index === crumbs.length - 1 ? 'page' : undefined}>
            {crumb}
          </li>
        ))}
      </ol>
      <div className="topbar-spacer" />
      <DataIndicator />
      <button type="button" className="topbar-btn" onClick={inert}>
        <Sparkles size={14} aria-hidden /> Ask AI <kbd>Ctrl+I</kbd>
      </button>
      <button type="button" className="icon-btn" aria-label="Help" onClick={inert}>
        <CircleHelp size={16} />
      </button>
      <Popover ariaLabel="Account menu" triggerClassName="avatar" trigger="DM" align="right" panelClassName="account-panel">
        <div className="account-name">Demo user</div>
        <div className="account-meta">{env ? `${env.cluster} · ${env.namespace} · ${env.environment}` : 'Coralogix Mock'}</div>
        <p className="account-disclaimer">{DISCLAIMER}</p>
      </Popover>
    </header>
  );
}
