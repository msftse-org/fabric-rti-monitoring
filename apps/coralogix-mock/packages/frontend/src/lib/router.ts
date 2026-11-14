import { useMemo, useSyncExternalStore } from 'react';

export const SERVICE_TABS = ['overview', 'operations', 'transactions', 'api-errors', 'resources', 'logs', 'slo'] as const;
export type ServiceTab = (typeof SERVICE_TABS)[number];

export type Route =
  | { page: 'catalog' }
  | { page: 'map'; service: string | null }
  | { page: 'databases' }
  | { page: 'service'; name: string; tab: ServiceTab }
  | { page: 'logs'; query: string }
  | { page: 'tracing'; query: string }
  | { page: 'trace'; traceId: string; spanId: string | null }
  | { page: 'alert-definitions' }
  | { page: 'alert-incidents' };

export const DEFAULT_HASH = '/apm/services';

export const paths = {
  catalog: () => '/apm/services',
  map: (service?: string) => `/apm/map${service ? `?service=${encodeURIComponent(service)}` : ''}`,
  databases: () => '/apm/databases',
  service: (name: string, tab: ServiceTab = 'overview') =>
    `/apm/services/${encodeURIComponent(name)}${tab === 'overview' ? '' : `/${tab}`}`,
  logs: (query = '') => `/explore/logs${query ? `?q=${encodeURIComponent(query)}` : ''}`,
  tracing: (query = '') => `/explore/tracing${query ? `?q=${encodeURIComponent(query)}` : ''}`,
  trace: (traceId: string, spanId?: string) =>
    `/explore/tracing/${encodeURIComponent(traceId)}${spanId ? `?span=${encodeURIComponent(spanId)}` : ''}`,
  alertDefinitions: () => '/alerts/definitions',
  alertIncidents: () => '/alerts/incidents',
};

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || DEFAULT_HASH;
  const [pathname, search = ''] = raw.split('?');
  const params = new URLSearchParams(search);
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [area, section, name, tab] = parts;

  if (area === 'apm') {
    if (section === 'map') return { page: 'map', service: params.get('service') };
    if (section === 'databases') return { page: 'databases' };
    if (section === 'services' && name) {
      const known = SERVICE_TABS.find((candidate) => candidate === tab);
      return { page: 'service', name, tab: known ?? 'overview' };
    }
    return { page: 'catalog' };
  }
  if (area === 'explore' && section === 'logs') return { page: 'logs', query: params.get('q') ?? '' };
  if (area === 'explore' && section === 'tracing') {
    if (name) return { page: 'trace', traceId: name, spanId: params.get('span') };
    return { page: 'tracing', query: params.get('q') ?? '' };
  }
  if (area === 'alerts' && section === 'definitions') return { page: 'alert-definitions' };
  if (area === 'alerts' && section === 'incidents') return { page: 'alert-incidents' };
  return { page: 'catalog' };
}

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};
const getHash = () => window.location.hash;

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return useMemo(() => parseHash(hash), [hash]);
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  const target = `#${path}`;
  if (window.location.hash === target) return;
  if (options.replace) window.location.replace(target);
  else window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}
