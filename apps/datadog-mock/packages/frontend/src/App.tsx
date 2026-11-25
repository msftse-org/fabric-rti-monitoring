import { useMemo } from 'react';
import { AppProvider } from './lib/app';
import { isOnCallRoute, parseHash, useHash, type Route } from './lib/router';
import { OnCallProvider } from './lib/oncall';
import { ToastProvider } from './lib/toast';
import { AppShell } from './components/shell/AppShell';
import { DataGate } from './components/DataGate';
import { OnCallNav } from './components/oncall/OnCallNav';
import { DashboardPage } from './pages/DashboardPage';
import { DashboardsPage } from './pages/DashboardsPage';
import { LogsPage } from './pages/LogsPage';
import { MetricsPage } from './pages/MetricsPage';
import { ServiceCatalogPage } from './pages/ServiceCatalogPage';
import { ServiceMapPage } from './pages/ServiceMapPage';
import { ServicePage } from './pages/ServicePage';
import { TraceViewPage } from './pages/TraceViewPage';
import { TracesPage } from './pages/TracesPage';
import { MonitorDetailPage, MonitorsPage } from './pages/monitors/MonitorsPage';
import { AnalyticsPage } from './pages/oncall/AnalyticsPage';
import { IncidentsPage } from './pages/oncall/IncidentsPage';
import { PagesPage } from './pages/oncall/PagesPage';
import { PoliciesPage, PolicyPage } from './pages/oncall/PoliciesPage';
import { SchedulePage, SchedulesPage } from './pages/oncall/SchedulesPage';
import { SettingsPage } from './pages/oncall/SettingsPage';
import { SummaryPage } from './pages/oncall/SummaryPage';
import { TeamPage, TeamsPage } from './pages/oncall/TeamsPage';

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'logs':
      return <LogsPage initialQuery={route.q} />;
    case 'catalog':
      return <ServiceCatalogPage />;
    case 'service':
      return <ServicePage service={route.service} tab={route.tab} />;
    case 'map':
      return <ServiceMapPage />;
    case 'traces':
      return <TracesPage initialQuery={route.q} />;
    case 'trace':
      return <TraceViewPage key={route.traceId} traceId={route.traceId} view={route.view} span={route.span} />;
    case 'metrics':
      return <MetricsPage />;
    case 'dashboards':
      return <DashboardsPage />;
    case 'dashboard':
      return <DashboardPage id={route.id} />;
    default:
      return null;
  }
}

function OnCallContent({ route }: { route: Route }) {
  switch (route.name) {
    case 'oncall':
      return <SummaryPage />;
    case 'oncall-pages':
      return <PagesPage status={route.status} pageId={route.pageId} />;
    case 'oncall-incidents':
      return <IncidentsPage />;
    case 'oncall-teams':
      return <TeamsPage />;
    case 'oncall-team':
      return <TeamPage key={route.id} id={route.id} />;
    case 'oncall-schedules':
      return <SchedulesPage />;
    case 'oncall-schedule':
      return <SchedulePage key={route.id} id={route.id} />;
    case 'oncall-policies':
      return <PoliciesPage />;
    case 'oncall-policy':
      return <PolicyPage key={route.id} id={route.id} />;
    case 'oncall-analytics':
      return <AnalyticsPage />;
    case 'oncall-settings':
      return <SettingsPage />;
    default:
      return null;
  }
}

function OnCallPage({ route, path }: { route: Route; path?: string }) {
  if (route.name === 'monitors') return <MonitorsPage triggered={route.triggered} />;
  if (route.name === 'monitor') return <MonitorDetailPage key={route.id} id={route.id} />;
  return (
    <div className="page oc-page">
      <OnCallNav route={route} path={path ?? ''} />
      <OnCallContent route={route} />
    </div>
  );
}

export function App() {
  const hash = useHash();
  const route = useMemo(() => parseHash(hash), [hash]);

  return (
    <ToastProvider>
      <AppProvider>
        <AppShell route={route} hash={hash}>
          {isOnCallRoute(route) ? (
            <DataGate requireWindow={false}>
              <OnCallProvider>
                <OnCallPage route={route} path={hash.replace(/^#/, '')} />
              </OnCallProvider>
            </DataGate>
          ) : (
            <DataGate>
              <Page route={route} />
            </DataGate>
          )}
        </AppShell>
      </AppProvider>
    </ToastProvider>
  );
}
