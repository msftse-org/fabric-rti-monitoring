import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { derivedStatusCode } from '../lib/fields';
import { HEALTH_COLOR, HEALTH_LABEL } from '../lib/health';
import type { Health, IssueSeverity } from '../lib/model';

export function StatusCode({ status }: { status: string }) {
  const code = derivedStatusCode(status);
  return (
    <span className={`status status--${code.tone}`} title="Derived: span status error → 500, otherwise 200">
      {code.label}
    </span>
  );
}

export function HealthBadge({ health }: { health: Health }) {
  return (
    <span className="health">
      <i style={{ background: HEALTH_COLOR[health] }} aria-hidden="true" />
      {HEALTH_LABEL[health]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  return <span className={`sev sev--${severity.toLowerCase()}`}>{severity}</span>;
}

interface TabsProps<T extends string> {
  tabs: readonly { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, label, className = '' }: TabsProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  };
  return (
    <div className={`tabs ${className}`} role="tablist" aria-label={label} ref={list} onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab={tab.id}
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          className="tabs__tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={option.id === value} className="segmented__item" onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
