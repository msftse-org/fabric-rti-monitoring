import { useSyncExternalStore } from 'react';
import { parseFlowRoute, routeHash } from './flow';
import type { FlowRoute } from './flow';

const readHash = () => window.location.hash;
function subscribe(notify: () => void) {
  window.addEventListener('hashchange', notify);
  window.addEventListener('popstate', notify);
  return () => {
    window.removeEventListener('hashchange', notify);
    window.removeEventListener('popstate', notify);
  };
}
function navigate(next: FlowRoute, replace = false) {
  const hash = routeHash(next);
  if (window.location.hash === hash) return;
  if (replace) window.history.replaceState(null, '', hash);
  else window.history.pushState(null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
}
export function useFlowRoute() {
  const hash = useSyncExternalStore(subscribe, readHash);
  return { route: parseFlowRoute(hash), navigate };
}
