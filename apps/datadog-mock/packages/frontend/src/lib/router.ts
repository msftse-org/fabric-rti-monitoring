import { useSyncExternalStore } from 'react';

export type ServiceTab = 'summary' | 'resources' | 'traces' | 'logs' | 'dependencies';

export type Route =
  | { name: 'logs'; q: string }
  | { name: 'catalog' }
  | { name: 'service'; service: string; tab: ServiceTab }
  | { name: 'map' }
  | { name: 'traces'; q: string }
  | { name: 'trace'; traceId: string; view: string; span: string }
  | { name: 'metrics' }
  | { name: 'dashboards' }
  | { name: 'dashboard'; id: string }
  | { name: 'oncall' }
  | { name: 'oncall-pages'; status: PageFilter; pageId: number | null }
  | { name: 'oncall-teams' }
  | { name: 'oncall-team'; id: string }
  | { name: 'oncall-schedules' }
  | { name: 'oncall-schedule'; id: string }
  | { name: 'oncall-policies' }
  | { name: 'oncall-policy'; id: string }
  | { name: 'oncall-analytics' }
  | { name: 'oncall-settings' }
  | { name: 'monitors'; triggered: boolean }
  | { name: 'monitor'; id: number };

export type PageFilter = 'active' | 'triggered' | 'acknowledged' | 'resolved' | 'all';

const PAGE_FILTERS: PageFilter[] = ['active', 'triggered', 'acknowledged', 'resolved', 'all'];

const SERVICE_TABS: ServiceTab[] = ['summary', 'resources', 'traces', 'logs', 'dependencies'];

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/logs';
  const [path, search = ''] = raw.split('?');
  const params = new URLSearchParams(search);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [area, section, id, tab] = parts;
  switch (area) {
    case 'apm':
      if (section === 'services' && id) {
        return { name: 'service', service: id, tab: SERVICE_TABS.includes(tab as ServiceTab) ? (tab as ServiceTab) : 'summary' };
      }
      if (section === 'map') return { name: 'map' };
      if (section === 'traces' && id) {
        return { name: 'trace', traceId: id, view: params.get('view') ?? 'flame', span: params.get('span') ?? '' };
      }
      if (section === 'traces') return { name: 'traces', q: params.get('q') ?? '' };
      return { name: 'catalog' };
    case 'metrics':
      return { name: 'metrics' };
    case 'dashboards':
      return section ? { name: 'dashboard', id: section } : { name: 'dashboards' };
    case 'on-call':
      return parseOnCall(section, id, params);
    case 'monitors':
      return section && Number.isFinite(Number(section)) ? { name: 'monitor', id: Number(section) } : { name: 'monitors', triggered: params.get('status') === 'triggered' };
    case 'logs':
    default:
      return { name: 'logs', q: params.get('q') ?? '' };
  }
}

function parseOnCall(section: string | undefined, id: string | undefined, params: URLSearchParams): Route {
  switch (section) {
    case 'pages': {
      const status = params.get('status') as PageFilter | null;
      const pageId = Number(id);
      return { name: 'oncall-pages', status: status && PAGE_FILTERS.includes(status) ? status : 'active', pageId: id && Number.isFinite(pageId) ? pageId : null };
    }
    case 'teams':
      return id ? { name: 'oncall-team', id } : { name: 'oncall-teams' };
    case 'schedules':
      return id ? { name: 'oncall-schedule', id } : { name: 'oncall-schedules' };
    case 'escalation-policies':
      return id ? { name: 'oncall-policy', id } : { name: 'oncall-policies' };
    case 'analytics':
      return { name: 'oncall-analytics' };
    case 'settings':
      return { name: 'oncall-settings' };
    default:
      return { name: 'oncall' };
  }
}

/** On-Call and Monitors only need the bundle's history, not the 60-minute window. */
export function isOnCallRoute(route: Route): boolean {
  return route.name.startsWith('oncall') || route.name === 'monitors' || route.name === 'monitor';
}

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => '');
}

export function navigate(path: string): void {
  window.location.hash = path;
}

/** Updates the address bar without a route change, so page state stays the source of truth. */
export function replaceHash(path: string): void {
  window.history.replaceState(null, '', `#${path}`);
}

export const paths = {
  logs: (q = '') => `/logs${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  catalog: () => '/apm/services',
  service: (name: string, tab: ServiceTab = 'summary') => `/apm/services/${encodeURIComponent(name)}${tab === 'summary' ? '' : `/${tab}`}`,
  map: () => '/apm/map',
  traces: (q = '') => `/apm/traces${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  trace: (traceId: string, span = '', view = '') => {
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    if (span) params.set('span', span);
    const search = params.toString();
    return `/apm/traces/${traceId}${search ? `?${search}` : ''}`;
  },
  metrics: () => '/metrics',
  dashboards: () => '/dashboards',
  dashboard: (id: string) => `/dashboards/${id}`,
  oncall: () => '/on-call',
  oncallPages: (status: PageFilter = 'active') => `/on-call/pages${status === 'active' ? '' : `?status=${status}`}`,
  oncallPage: (id: number, status: PageFilter = 'active') => `/on-call/pages/${id}${status === 'active' ? '' : `?status=${status}`}`,
  oncallTeams: () => '/on-call/teams',
  oncallTeam: (id: string) => `/on-call/teams/${encodeURIComponent(id)}`,
  oncallSchedules: () => '/on-call/schedules',
  oncallSchedule: (id: string) => `/on-call/schedules/${encodeURIComponent(id)}`,
  oncallPolicies: () => '/on-call/escalation-policies',
  oncallPolicy: (id: string) => `/on-call/escalation-policies/${encodeURIComponent(id)}`,
  oncallAnalytics: () => '/on-call/analytics',
  oncallSettings: () => '/on-call/settings',
  monitors: (triggered = false) => `/monitors${triggered ? '?status=triggered' : ''}`,
  monitor: (id: number) => `/monitors/${id}`,
};
