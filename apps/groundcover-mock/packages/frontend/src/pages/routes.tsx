import type { ReactNode } from 'react';
import type { Route } from '../lib/router';
import { DashboardDetail, DashboardList } from './Dashboards';
import { IssuesPage } from './Issues';
import { LogsPage } from './Logs';
import { MapPage } from './MapPage';
import { MetricsPage } from './Metrics';
import { TraceDetail } from './TraceDetail';
import { TracesPage } from './Traces';
import { WorkloadDetail } from './WorkloadDetail';
import { WorkloadsPage } from './Workloads';

export interface PageDef {
  title: string;
  element: ReactNode;
  /** Pages with their own filter row carry the Create Monitor button there. */
  ownsCreateMonitor?: boolean;
}

export function resolvePage(route: Route): PageDef | null {
  const [section, id] = route.segments;
  switch (section) {
    case 'workloads':
      return { title: 'Workloads', element: id ? <WorkloadDetail name={id} tab={route.params.get('tab')} /> : <WorkloadsPage /> };
    case 'map':
      return { title: 'Map', element: <MapPage /> };
    case 'logs':
      return { title: 'Logs', element: <LogsPage initialQuery={route.params.get('q') ?? ''} />, ownsCreateMonitor: true };
    case 'traces':
      return id
        ? { title: 'Traces', element: <TraceDetail traceId={id} spanId={route.params.get('span')} /> }
        : { title: 'Traces', element: <TracesPage initialQuery={route.params.get('q') ?? ''} initialView={route.params.get('view')} />, ownsCreateMonitor: true };
    case 'issues':
      return { title: 'Issues', element: <IssuesPage initialQuery={route.params.get('q') ?? ''} /> };
    case 'metrics':
      return { title: 'Metrics', element: <MetricsPage route={route} /> };
    case 'dashboards':
      return { title: 'Dashboards', element: id ? <DashboardDetail id={id} /> : <DashboardList /> };
    default:
      return null;
  }
}
