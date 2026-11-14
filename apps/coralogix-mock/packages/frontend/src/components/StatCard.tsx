import { CircleHelp, Ellipsis } from 'lucide-react';
import type { ReactNode } from 'react';
import { useToast } from '../lib/toast';

/** Single-number widget used on the service drilldown overview. */
export function StatCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const { inert } = useToast();
  return (
    <section className="card stat-card">
      <header className="card-head">
        <h3 className="card-title">{title}</h3>
        {hint && (
          <span className="card-info" title={hint} aria-label={hint} role="img">
            <CircleHelp size={13} />
          </span>
        )}
        <span className="card-spacer" />
        <button type="button" className="icon-btn icon-btn--small" aria-label={`${title} options`} onClick={inert}>
          <Ellipsis size={14} />
        </button>
      </header>
      <div className="card-body stat-body">{children}</div>
    </section>
  );
}
