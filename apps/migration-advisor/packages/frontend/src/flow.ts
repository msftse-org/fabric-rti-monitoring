export type Workspace = 'map' | 'cost' | 'otel' | 'sources';
export type FlowRoute = { view: Workspace; step: 'input' | 'results' };
export function parseFlowRoute(hash: string): FlowRoute {
  const [view, step] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'cost' || view === 'otel') return { view, step: step === 'results' ? 'results' : 'input' };
  return { view: view === 'sources' ? 'sources' : 'map', step: 'input' };
}
export function routeHash(route: FlowRoute): string {
  return `#${route.view}${route.view === 'cost' || route.view === 'otel' ? `/${route.step}` : ''}`;
}
export function focusInvalid(id: string) {
  requestAnimationFrame(() => {
    const field = document.getElementById(id) || document.getElementById(id.replace(/^input-/, 'correction-'));
    let parent = field?.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    field?.focus();
    field?.scrollIntoView({ block: 'center' });
  });
}
