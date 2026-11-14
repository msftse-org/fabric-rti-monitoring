import { Ellipsis, Maximize2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useToast } from '../lib/toast';

interface CardProps {
  title: ReactNode;
  /** Muted text rendered next to the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drops the expand and overflow buttons that Coralogix widgets carry. */
  bare?: boolean;
}

/** Dashboard widget frame: dark title bar, panel-coloured body. */
export function Card({ title, meta, actions, children, className = '', bare = false }: CardProps) {
  const { inert } = useToast();
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <h3 className="card-title">{title}</h3>
        {meta && <span className="card-meta">{meta}</span>}
        <span className="card-spacer" />
        {actions}
        {!bare && (
          <>
            <button type="button" className="icon-btn icon-btn--small" aria-label="Expand widget" onClick={inert}>
              <Maximize2 size={13} />
            </button>
            <button type="button" className="icon-btn icon-btn--small" aria-label="Widget options" onClick={inert}>
              <Ellipsis size={14} />
            </button>
          </>
        )}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}
