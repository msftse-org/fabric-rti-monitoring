import { OctagonAlert, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDataState } from '../lib/data';

export function Skeleton({ width = '100%', height = 14 }: { width?: number | string; height?: number }) {
  return <div className="skeleton" style={{ width, height }} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="page" role="status" aria-label="Loading telemetry">
      <div className="skeleton-stack">
        <Skeleton width={160} height={28} />
        <Skeleton width={420} height={14} />
        <div style={{ height: 8 }} />
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} height={36} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <OctagonAlert size={32} />
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="state state--inline">
      <SearchX size={28} />
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

/** Renders the skeleton while loading and an error state when no telemetry is available. */
export function DataBoundary({ children }: { children: ReactNode }) {
  const { telemetry, ready } = useDataState();
  if (telemetry.loading && !ready) return <PageSkeleton />;
  if (!ready) {
    return <ErrorState title="Telemetry is unavailable" message={telemetry.error ?? 'No telemetry bundle could be loaded.'} onRetry={telemetry.refresh} />;
  }
  if (ready.bundle.services.length === 0) {
    return <EmptyState title="No services reported data" hint="The telemetry bundle does not contain any service in this time range." />;
  }
  return <>{children}</>;
}
