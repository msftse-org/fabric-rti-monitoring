import { useEffect, useMemo, useSyncExternalStore } from 'react';

export interface Route {
  segments: string[];
  params: URLSearchParams;
  raw: string;
}

const DEFAULT_ROUTE = '/workloads';

function readHash(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : DEFAULT_ROUTE;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function parseRoute(raw: string): Route {
  const [pathname, search = ''] = raw.split('?');
  return {
    segments: pathname.split('/').filter(Boolean).map(decodeURIComponent),
    params: new URLSearchParams(search),
    raw,
  };
}

export function useRoute(): Route {
  const raw = useSyncExternalStore(subscribe, readHash, () => DEFAULT_ROUTE);
  return useMemo(() => parseRoute(raw), [raw]);
}

type Params = Record<string, string | null | undefined>;

export function routePath(path: string, params?: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) if (value) search.set(key, value);
  const query = search.toString();
  return `/${path.replace(/^\//, '')}${query ? `?${query}` : ''}`;
}

/** Value for an anchor `href`. */
export function href(path: string, params?: Params): string {
  return `#${routePath(path, params)}`;
}

export function navigate(path: string, params?: Params): void {
  window.location.hash = routePath(path, params);
}

/** Updates the URL without notifying the router, so page state stays authoritative. */
export function replaceParams(path: string, params: Params): void {
  window.history.replaceState(null, '', `#${routePath(path, params)}`);
}

/** Mirrors page state into the URL query string while the page is mounted. */
export function useSyncParams(path: string, params: Params): void {
  const serialised = JSON.stringify(params);
  useEffect(() => {
    replaceParams(path, JSON.parse(serialised) as Params);
  }, [path, serialised]);
}
