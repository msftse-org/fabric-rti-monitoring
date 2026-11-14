import { useEffect, useRef, useState } from 'react';
import { DisclaimerBanner, FooterStrip } from './components/Disclaimer';
import { NavRail } from './components/NavRail';
import { DataBoundary } from './components/States';
import { TopBar } from './components/TopBar';
import { DataProvider } from './lib/data';
import { useRoute, type Route } from './lib/router';
import { ToastProvider } from './lib/toast';
import { AlertDefinitions, AlertIncidents } from './pages/Alerts';
import { Databases } from './pages/Databases';
import { ExploreLogs } from './pages/ExploreLogs';
import { ExploreTracing } from './pages/ExploreTracing';
import { ServiceCatalog } from './pages/ServiceCatalog';
import { ServiceDrilldown } from './pages/ServiceDrilldown';
import { ServiceMap } from './pages/ServiceMap';
import { TraceView } from './pages/TraceView';

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'catalog':
      return <ServiceCatalog />;
    case 'map':
      return <ServiceMap selected={route.service} />;
    case 'databases':
      return <Databases />;
    case 'service':
      return <ServiceDrilldown key={route.name} name={route.name} tab={route.tab} />;
    case 'logs':
      return <ExploreLogs query={route.query} />;
    case 'tracing':
      return <ExploreTracing query={route.query} />;
    case 'trace':
      return <TraceView traceId={route.traceId} spanId={route.spanId} />;
    case 'alert-definitions':
      return <AlertDefinitions />;
    case 'alert-incidents':
      return <AlertIncidents />;
  }
}

function Shell() {
  const route = useRoute();
  const [navOpen, setNavOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const pageKey = route.page + (route.page === 'service' ? route.name : route.page === 'trace' ? route.traceId : '');

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    setNavOpen(false);
  }, [pageKey]);

  return (
    <div className="app">
      <NavRail open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="app-column">
        <TopBar onMenu={() => setNavOpen(true)} />
        <DisclaimerBanner />
        <main className="app-main" ref={main} id="main">
          <DataBoundary>
            <Page route={route} />
          </DataBoundary>
        </main>
        <FooterStrip />
      </div>
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <Shell />
      </DataProvider>
    </ToastProvider>
  );
}
