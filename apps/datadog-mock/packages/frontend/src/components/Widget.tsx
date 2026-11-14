import type { ReactNode } from 'react';

interface WidgetProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Widget({ title, subtitle, actions, children, className }: WidgetProps) {
  return (
    <section className={`widget ${className ?? ''}`}>
      <header className="widget__head">
        <h3 className="widget__title">{title}</h3>
        {subtitle && <span className="widget__sub">{subtitle}</span>}
        <span className="grow" />
        {actions}
      </header>
      <div className="widget__body">{children}</div>
    </section>
  );
}
