import { useState, type ReactNode } from 'react';
import { Check, Copy, Inbox, Info, TriangleAlert } from 'lucide-react';
import { HEALTH_LABEL, serviceColor, type Health } from '../lib/palette';

export function HealthChip({ status, label }: { status: Health; label?: string }) {
  return <span className={`chip chip--${status}`}>{label ?? HEALTH_LABEL[status]}</span>;
}

export function ServiceDot({ name, size = 10 }: { name: string; size?: number }) {
  return <span className="service-dot" style={{ background: serviceColor(name), width: size, height: size }} aria-hidden="true" />;
}

export function ServiceTag({ name }: { name: string }) {
  return (
    <span className="service-tag">
      <ServiceDot name={name} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Skeleton({ width = '100%', height = 14 }: { width?: number | string; height?: number | string }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setDone(true);
    window.setTimeout(() => setDone(false), 1200);
  };
  return (
    <button type="button" className="icon-btn" aria-label={done ? 'Copied' : `${label} ${value}`} title={done ? 'Copied' : label} onClick={copy}>
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

interface StateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, children, action }: StateProps) {
  return (
    <div className="state" role="status">
      <Inbox size={32} />
      <div className="state__title">{title}</div>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ title, children, action }: StateProps) {
  return (
    <div className="state" role="alert">
      <TriangleAlert size={32} />
      <div className="state__title">{title}</div>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function NoticeBar({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="note">
      <Info size={13} />
      <span>{children}</span>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className="segmented__btn" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PageTabs({ tabs, current, onSelect }: { tabs: { id: string; label: string; badge?: string }[]; current: string; onSelect: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" className="tab" aria-selected={tab.id === current} onClick={() => onSelect(tab.id)}>
          {tab.label}
          {tab.badge && <span className="tab__badge">{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}
