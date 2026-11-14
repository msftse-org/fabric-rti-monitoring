import type { ReactNode } from 'react';
import type { Health } from '../lib/derive';

export type Tone = 'ok' | 'bad' | 'warn' | 'info' | 'neutral';

export function Chip({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`chip chip--${tone}`} title={title}>
      {children}
    </span>
  );
}

const HEALTH_TONE: Record<Health, Tone> = { Critical: 'bad', Warning: 'warn', Healthy: 'ok' };

export function HealthChip({ health }: { health: Health }) {
  return <Chip tone={HEALTH_TONE[health]}>{health}</Chip>;
}

export function SloChips({ ok, breached }: { ok: number; breached: number }) {
  return (
    <span className="chip-group">
      {ok > 0 && <Chip tone="ok">{ok} OK</Chip>}
      {breached > 0 && <Chip tone="bad">{breached} BREACHED</Chip>}
    </span>
  );
}

export function healthColor(health: Health): string {
  return health === 'Critical' ? 'var(--crit-bar)' : health === 'Warning' ? 'var(--warn-bar)' : 'var(--ok-bar)';
}
