import { useEffect, type ReactNode } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { Shell } from './components/shell';
import { Button } from './components/ui';
import { OnCallProvider, useData, useOnCall } from './lib/oncall';
import { parseHash, useHash, type Route } from './lib/router';
import { ToastProvider } from './lib/toast';
import { Analytics } from './views/Analytics';
import { Compare, ComparePage } from './views/Compare';
import { EscalationDetail, EscalationsList } from './views/Escalations';
import { NotFound } from './views/NotFound';
import { Overview } from './views/Overview';
import { PageDetail } from './views/PageDetail';
import { PagesList } from './views/Pages';
import { RuleBuilder } from './views/RuleBuilder';
import { RuleDetail, RulesList } from './views/Rules';
import { ScheduleDetail, SchedulesList } from './views/Schedules';
import { Settings } from './views/Settings';
import { TeamDetail, TeamsList } from './views/Teams';

const APP_TITLE = 'On-Call · Fabric Real-Time Intelligence';

function useRouteTitle(route: Route): string {
  const { model, lk } = useOnCall();
  switch (route.name) {
    case 'overview':
      return 'Overview';
    case 'pages':
      return 'Pages';
    case 'page': {
      const page = model.pages.find((item) => item.id === route.id);
      return page ? `#${page.id} ${page.title}` : `Page #${route.id}`;
    }
    case 'teams':
      return 'Teams';
    case 'team':
      return lk.teams.get(route.id)?.name ?? 'Team';
    case 'schedules':
      return 'Schedules';
    case 'schedule':
      return lk.schedules.get(route.id)?.name ?? 'Schedule';
    case 'escalations':
      return 'Escalations';
    case 'escalation':
      return lk.policies.get(route.id)?.name ?? 'Escalation flow';
    case 'rules':
      return 'Activator rules';
    case 'rule':
      return model.monitors.find((item) => item.id === route.id)?.name ?? 'Activator rule';
    case 'ruleNew':
      return 'New alert rule';
    case 'ruleEdit':
      return `Edit ${model.monitors.find((item) => item.id === route.id)?.name ?? 'alert rule'}`;
    case 'analytics':
      return 'Analytics';
    case 'settings':
      return 'Settings';
    case 'compare':
      return 'Compare with Datadog';
    case 'comparePage':
      return `Compare #${route.pageId}`;
    case 'notFound':
      return 'Not found';
  }
}

function View({ route }: { route: Route }) {
  const title = useRouteTitle(route);

  useEffect(() => {
    document.title = `${title} · ${APP_TITLE}`;
  }, [title]);

  switch (route.name) {
    case 'overview':
      return <Overview />;
    case 'pages':
      return <PagesList key={route.q} q={route.q} />;
    case 'page':
      return <PageDetail key={route.id} id={route.id} />;
    case 'teams':
      return <TeamsList />;
    case 'team':
      return <TeamDetail key={route.id} id={route.id} />;
    case 'schedules':
      return <SchedulesList />;
    case 'schedule':
      return <ScheduleDetail key={route.id} id={route.id} />;
    case 'escalations':
      return <EscalationsList />;
    case 'escalation':
      return <EscalationDetail key={route.id} id={route.id} />;
    case 'rules':
      return <RulesList />;
    case 'rule':
      return <RuleDetail key={route.id} id={route.id} />;
    case 'ruleNew':
      return <RuleBuilder key={`new-${route.from ?? ''}`} fromId={route.from} />;
    case 'ruleEdit':
      return <RuleBuilder key={`edit-${route.id}`} editId={route.id} />;
    case 'analytics':
      return <Analytics />;
    case 'settings':
      return <Settings />;
    case 'compare':
      return <Compare />;
    case 'comparePage':
      return <ComparePage key={route.pageId} pageId={route.pageId} />;
    case 'notFound':
      return <NotFound path={route.path} />;
  }
}

function Gate({ children }: { children: ReactNode }) {
  const { onCall, loading, error, refresh } = useData();
  if (onCall) return <>{children}</>;
  if (error && !loading) {
    return (
      <div className="gate" role="alert">
        <CloudOff size={28} aria-hidden />
        <h1>Eventhouse data is not available</h1>
        <p className="muted">{error}</p>
        <Button variant="primary" icon={<RefreshCw size={14} aria-hidden />} onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="gate gate--loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading on-call data from the Eventhouse</span>
      <div className="skeleton skeleton--title" />
      <div className="skeleton-row">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton skeleton--kpi" />
        ))}
      </div>
      <div className="skeleton skeleton--card" />
    </div>
  );
}

function Routed() {
  const hash = useHash();
  const { route, path } = parseHash(hash);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  return (
    <Shell route={route} path={path}>
      <Gate>
        <View route={route} />
      </Gate>
    </Shell>
  );
}

export function App() {
  return (
    <ToastProvider>
      <OnCallProvider>
        <Routed />
      </OnCallProvider>
    </ToastProvider>
  );
}
