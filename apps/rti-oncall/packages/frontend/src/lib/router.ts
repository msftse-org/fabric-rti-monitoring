import { useSyncExternalStore } from 'react';
import { counterpartUrl, toDatadogPath } from '@oncall';

export type Route =
  | { name: 'overview' }
  | { name: 'pages'; q: string }
  | { name: 'page'; id: number }
  | { name: 'teams' }
  | { name: 'team'; id: string }
  | { name: 'schedules' }
  | { name: 'schedule'; id: string }
  | { name: 'escalations' }
  | { name: 'escalation'; id: string }
  | { name: 'rules' }
  | { name: 'rule'; id: number }
  | { name: 'ruleNew'; from: number | null }
  | { name: 'ruleEdit'; id: number }
  | { name: 'analytics' }
  | { name: 'settings' }
  | { name: 'compare' }
  | { name: 'comparePage'; pageId: number }
  | { name: 'notFound'; path: string };

export type Section = 'overview' | 'pages' | 'teams' | 'schedules' | 'escalations' | 'rules' | 'analytics' | 'compare' | 'settings';

export interface ParsedRoute {
  route: Route;
  /** Hash path without the query string, for counterpart links. */
  path: string;
}

export function parseHash(hash: string): ParsedRoute {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, search = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const params = new URLSearchParams(search);
  const [area, id, sub] = path.split('/').filter(Boolean).map(decodeURIComponent);
  const numeric = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
  const route = ((): Route => {
    switch (area) {
      case undefined:
        return { name: 'overview' };
      case 'pages':
        if (id === undefined) return { name: 'pages', q: params.get('q') ?? '' };
        return numeric !== null ? { name: 'page', id: numeric } : { name: 'notFound', path };
      case 'teams':
        return id ? { name: 'team', id } : { name: 'teams' };
      case 'schedules':
        return id ? { name: 'schedule', id } : { name: 'schedules' };
      case 'escalations':
        return id ? { name: 'escalation', id } : { name: 'escalations' };
      case 'rules': {
        if (id === undefined) return { name: 'rules' };
        if (id === 'new' && sub === undefined) {
          const from = params.get('from');
          return { name: 'ruleNew', from: from && /^\d+$/.test(from) ? Number(from) : null };
        }
        if (numeric === null) return { name: 'notFound', path };
        if (sub === undefined) return { name: 'rule', id: numeric };
        return sub === 'edit' ? { name: 'ruleEdit', id: numeric } : { name: 'notFound', path };
      }
      case 'analytics':
        return { name: 'analytics' };
      case 'settings':
        return { name: 'settings' };
      case 'compare':
        if (id === undefined) return { name: 'compare' };
        return numeric !== null ? { name: 'comparePage', pageId: numeric } : { name: 'notFound', path };
      default:
        return { name: 'notFound', path };
    }
  })();
  return { route, path };
}

export function sectionOf(route: Route): Section | null {
  switch (route.name) {
    case 'overview':
      return 'overview';
    case 'pages':
    case 'page':
      return 'pages';
    case 'teams':
    case 'team':
      return 'teams';
    case 'schedules':
    case 'schedule':
      return 'schedules';
    case 'escalations':
    case 'escalation':
      return 'escalations';
    case 'rules':
    case 'rule':
    case 'ruleNew':
    case 'ruleEdit':
      return 'rules';
    case 'analytics':
      return 'analytics';
    case 'settings':
      return 'settings';
    case 'compare':
    case 'comparePage':
      return 'compare';
    case 'notFound':
      return null;
  }
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

export const paths = {
  overview: () => '/',
  pages: (q = '') => `/pages${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  page: (id: number) => `/pages/${id}`,
  teams: () => '/teams',
  team: (id: string) => `/teams/${encodeURIComponent(id)}`,
  schedules: () => '/schedules',
  schedule: (id: string) => `/schedules/${encodeURIComponent(id)}`,
  escalations: () => '/escalations',
  escalation: (id: string) => `/escalations/${encodeURIComponent(id)}`,
  rules: () => '/rules',
  rule: (id: number) => `/rules/${id}`,
  ruleNew: (from?: number) => `/rules/new${from ? `?from=${from}` : ''}`,
  ruleEdit: (id: number) => `/rules/${id}/edit`,
  analytics: () => '/analytics',
  settings: () => '/settings',
  compare: () => '/compare',
  comparePage: (pageId: number) => `/compare/${pageId}`,
};

export const href = (path: string) => `#${path}`;

/** The equivalent Datadog mock URL for an RTI path; `/compare/:id` maps to the page itself. */
export function datadogUrl(rtiPath: string): string | null {
  const compare = /^\/compare\/(\d+)$/.exec(rtiPath);
  const target = compare ? `/on-call/pages/${compare[1]}` : toDatadogPath(rtiPath);
  return counterpartUrl('datadog', target, import.meta.env.DEV);
}
