import { ExploreHeader } from '../components/ExploreHeader';
import type { SavedView } from '../components/SavedViewsMenu';
import { navigate, paths } from '../lib/router';
import { LogExplorer } from './LogExplorer';

export const LOG_VIEWS: SavedView[] = [
  { id: 'errors', label: 'All errors', query: 'severity:ERROR' },
  { id: 'checkout-failures', label: 'Checkout failures', query: 'scenario:checkout AND outcome:error' },
  { id: 'payment-errors', label: 'Payment errors', query: 'service:payment AND severity:ERROR' },
  { id: 'slow', label: 'Slow requests (over 500ms)', query: 'durationMs:>500' },
  { id: 'browse', label: 'Gateway browse traffic', query: 'service:gateway AND scenario:browse' },
];

export function ExploreLogs({ query }: { query: string }) {
  const go = (next: string) => navigate(paths.logs(next));
  return (
    <div className="page">
      <ExploreHeader dataset="logs" views={LOG_VIEWS} query={query} onPickView={go} onReset={() => go('')} />
      <LogExplorer query={query} onApply={go} />
    </div>
  );
}
