import { ChevronRight, Menu } from 'lucide-react';
import { Fragment } from 'react';
import { useShell } from '../../lib/app';
import { entityName } from '../../lib/oncall';
import { isOnCallRoute, paths, type Route } from '../../lib/router';
import { TimeControls } from './TimeControls';

interface Crumb {
  label: string;
  path?: string;
}

type NameOf = (kind: 'team' | 'schedule' | 'policy', id: string) => string;

export function crumbsFor(route: Route, nameOf: NameOf = (_kind, id) => id): Crumb[] {
  switch (route.name) {
    case 'logs':
      return [{ label: 'Logs' }, { label: 'Log Explorer' }];
    case 'catalog':
      return [{ label: 'APM' }, { label: 'Service Catalog' }];
    case 'service':
      return [{ label: 'APM' }, { label: 'Service Catalog', path: paths.catalog() }, { label: route.service }];
    case 'map':
      return [{ label: 'APM' }, { label: 'Service Map' }];
    case 'traces':
      return [{ label: 'APM' }, { label: 'Trace Explorer' }];
    case 'trace':
      return [{ label: 'APM' }, { label: 'Trace Explorer', path: paths.traces() }, { label: `Trace ${route.traceId.slice(0, 8)}` }];
    case 'metrics':
      return [{ label: 'Metrics' }, { label: 'Metrics Explorer' }];
    case 'dashboards':
      return [{ label: 'Dashboards' }, { label: 'Dashboard List' }];
    case 'dashboard':
      return [{ label: 'Dashboards' }, { label: 'Dashboard List', path: paths.dashboards() }, { label: 'AKS Services Overview' }];
    case 'oncall':
      return [{ label: 'On-Call' }, { label: 'Summary' }];
    case 'oncall-pages':
      return route.pageId === null ? [{ label: 'On-Call' }, { label: 'Pages' }] : [{ label: 'On-Call' }, { label: 'Pages', path: paths.oncallPages(route.status) }, { label: `#${route.pageId}` }];
    case 'oncall-teams':
      return [{ label: 'On-Call' }, { label: 'Teams' }];
    case 'oncall-team':
      return [{ label: 'On-Call' }, { label: 'Teams', path: paths.oncallTeams() }, { label: nameOf('team', route.id) }];
    case 'oncall-schedules':
      return [{ label: 'On-Call' }, { label: 'Schedules' }];
    case 'oncall-schedule':
      return [{ label: 'On-Call' }, { label: 'Schedules', path: paths.oncallSchedules() }, { label: nameOf('schedule', route.id) }];
    case 'oncall-policies':
      return [{ label: 'On-Call' }, { label: 'Escalation Policies' }];
    case 'oncall-policy':
      return [{ label: 'On-Call' }, { label: 'Escalation Policies', path: paths.oncallPolicies() }, { label: nameOf('policy', route.id) }];
    case 'oncall-analytics':
      return [{ label: 'On-Call' }, { label: 'Analytics' }];
    case 'oncall-settings':
      return [{ label: 'On-Call' }, { label: 'Settings' }];
    case 'monitors':
      return [{ label: 'Monitors' }, { label: route.triggered ? 'Triggered Monitors' : 'Manage Monitors' }];
    case 'monitor':
      return [{ label: 'Monitors' }, { label: 'Manage Monitors', path: paths.monitors() }, { label: `#${route.id}` }];
  }
}

export function TopBar({ route, onMenu }: { route: Route; onMenu: () => void }) {
  const { data } = useShell();
  const crumbs = crumbsFor(route, (kind, id) => entityName(data?.bundle, kind, id));
  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" aria-label="Open navigation" onClick={onMenu}>
        <Menu size={20} />
      </button>
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <ChevronRight size={14} className="crumbs__sep" aria-hidden="true" />}
              {crumb.path ? (
                <a className="crumbs__item" href={`#${crumb.path}`}>
                  {crumb.label}
                </a>
              ) : (
                <span className="crumbs__item" data-last={last} aria-current={last ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>
      <div className="grow" />
      {!isOnCallRoute(route) && <TimeControls />}
    </header>
  );
}
