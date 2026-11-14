import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { useData } from '../lib/data';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <Inbox size={28} aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, children, onRetry }: { title: string; children?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Skeleton({ height = 14, width = '100%' }: { height?: number; width?: number | string }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

function PageSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-label="Loading telemetry">
      <Skeleton height={34} width="32%" />
      <div className="page-skeleton__row">
        <Skeleton height={120} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
      {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} height={26} />)}
    </div>
  );
}

/** Renders the page only once telemetry has loaded; otherwise a skeleton, error or empty state. */
export function DataGate({ children }: { children: ReactNode }) {
  const { telemetry, view } = useData();
  if (!view) {
    if (telemetry.error) {
      return (
        <ErrorState title="Could not load telemetry" onRetry={telemetry.refresh}>
          {telemetry.error}
        </ErrorState>
      );
    }
    return <PageSkeleton />;
  }
  if (view.bundle.services.length === 0) {
    return <EmptyState title="No telemetry yet">The telemetry bundle contains no services. Start the demo workload and refresh.</EmptyState>;
  }
  return <>{children}</>;
}
