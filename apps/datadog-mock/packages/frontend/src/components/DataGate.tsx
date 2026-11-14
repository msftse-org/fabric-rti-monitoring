import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useShell } from '../lib/app';
import { EmptyState, ErrorState, Skeleton } from './ui';

function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label="Loading telemetry">
      <Skeleton width={260} height={20} />
      <Skeleton height={34} />
      <Skeleton height={120} />
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} height={24} />
      ))}
    </div>
  );
}

/** Renders pages only once a telemetry bundle exists, so pages can assume data. On-call pages read the bundle history and skip the window check. */
export function DataGate({ children, requireWindow = true }: { children: ReactNode; requireWindow?: boolean }) {
  const { source, data } = useShell();
  if (!data) {
    if (source.error) {
      return (
        <ErrorState
          title="Unable to load telemetry"
          action={
            <button type="button" className="btn btn--primary" onClick={source.refresh}>
              <RefreshCw size={14} /> Retry
            </button>
          }
        >
          {source.error}
        </ErrorState>
      );
    }
    return <PageSkeleton />;
  }
  if (requireWindow && !data.bundle.logs.length && !data.bundle.traces.length && !data.bundle.servicePoints.length) {
    return (
      <EmptyState
        title="No telemetry yet"
        action={
          <button type="button" className="btn" onClick={source.refresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      >
        The OpenTelemetry demo has not produced any data for this window.
      </EmptyState>
    );
  }
  return <>{children}</>;
}
