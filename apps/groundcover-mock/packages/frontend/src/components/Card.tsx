import type { ReactNode } from 'react';
import type { Health } from '../lib/model';
import { HEALTH_COLOR } from '../lib/health';

export function Card({ title, hint, right, children, className = '' }: { title: ReactNode; hint?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="card__head card__head--tight">
        <h2 className="card__title card__title--sm">{title}</h2>
        {hint && <span className="muted">{hint}</span>}
        <div className="card__spacer" />
        {right}
      </div>
      <div className="card__body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: Health }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value" style={tone ? { color: HEALTH_COLOR[tone] } : undefined}>{value}</div>
      {caption && <div className="stat__caption">{caption}</div>}
    </div>
  );
}
