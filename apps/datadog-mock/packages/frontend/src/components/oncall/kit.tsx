import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  BellRing,
  Check,
  Eye,
  Mail,
  MessageSquare,
  MessagesSquare,
  Phone,
  RotateCcw,
  Smartphone,
  X,
  type LucideIcon,
} from 'lucide-react';
import { dateTime, type Channel, type MonitorState, type PageStatus, type Team, type Urgency, type User } from '@oncall';
import { compareUrl, useOnCall } from '../../lib/oncall';
import { paths } from '../../lib/router';

export function Avatar({ user, size = 22 }: { user: User | undefined; size?: number }) {
  return (
    <span
      className="oc-avatar"
      role="img"
      aria-label={user?.name ?? 'Unknown user'}
      title={user?.name}
      style={{ background: user?.color ?? 'var(--nodata)', width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {user?.initials ?? '?'}
    </span>
  );
}

export function AvatarStack({ ids, max = 4, size = 22 }: { ids: string[]; max?: number; size?: number }) {
  const { user } = useOnCall();
  return (
    <span className="oc-stack">
      {ids.slice(0, max).map((id) => (
        <Avatar key={id} user={user(id)} size={size} />
      ))}
      {ids.length > max && <span className="oc-stack__more">+{ids.length - max}</span>}
    </span>
  );
}

export function PersonPill({ userId }: { userId: string | null | undefined }) {
  const { user } = useOnCall();
  const person = user(userId);
  if (!person) return <em className="muted">None</em>;
  return (
    <span className="oc-person">
      <Avatar user={person} size={18} />
      <span className="truncate">{person.name}</span>
    </span>
  );
}

export function TeamPill({ team, link = true }: { team: Team | undefined; link?: boolean }) {
  if (!team) return null;
  const body = (
    <>
      <span className="oc-team__mark" style={{ background: team.color }} aria-hidden="true">
        {team.name[0]}
      </span>
      <span className="truncate">{team.name}</span>
    </>
  );
  return link ? (
    <a className="oc-team" href={`#${paths.oncallTeam(team.id)}`}>
      {body}
    </a>
  ) : (
    <span className="oc-team">{body}</span>
  );
}

const STATUS: Record<PageStatus, { label: string; icon: LucideIcon }> = {
  triggered: { label: 'Triggered', icon: BellRing },
  acknowledged: { label: 'Acknowledged', icon: Eye },
  resolved: { label: 'Resolved', icon: Check },
};

export function StatusPill({ status }: { status: PageStatus }) {
  const { label, icon: Icon } = STATUS[status];
  return (
    <span className={`oc-status oc-status--${status}`}>
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      {label}
    </span>
  );
}

export function UrgencyChip({ urgency }: { urgency: Urgency | 'dynamic' }) {
  return <span className={`oc-urgency oc-urgency--${urgency}`}>{urgency}</span>;
}

const MONITOR_LABEL: Record<MonitorState, string> = { ok: 'OK', warn: 'WARN', alert: 'ALERT', no_data: 'NO DATA' };

export function MonitorChip({ state }: { state: MonitorState }) {
  return <span className={`chip chip--${state === 'no_data' ? 'nodata' : state}`}>{MONITOR_LABEL[state]}</span>;
}

export const CHANNELS: Record<Channel, { label: string; icon: LucideIcon }> = {
  push: { label: 'Push', icon: Smartphone },
  sms: { label: 'SMS', icon: MessageSquare },
  voice: { label: 'Voice call', icon: Phone },
  email: { label: 'Email', icon: Mail },
  chat: { label: 'Chat', icon: MessagesSquare },
};

export function ChannelTag({ channel }: { channel: Channel }) {
  const { label, icon: Icon } = CHANNELS[channel];
  return (
    <span className="oc-channel">
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Accessible dialog: traps focus, closes on Escape or a backdrop press, and restores focus on close. */
export function Modal({ title, onClose, children, footer, width = 520, className = '' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector('.oc-modal__body')?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });
    return () => {
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if ((event.target as HTMLElement).closest('.menu, [aria-expanded="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="oc-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={`oc-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ width }} onKeyDown={onKeyDown}>
        <header className="oc-modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="oc-modal__body">{children}</div>
        {footer && <footer className="oc-modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function CompareLink({ path, compact, iconOnly }: { path: string; compact?: boolean; iconOnly?: boolean }) {
  const url = compareUrl(path);
  if (!url) return null;
  const labelClass = iconOnly ? 'sr-only' : compact ? 'oc-compare__label oc-compare__label--compact' : 'oc-compare__label';
  return (
    <a className={iconOnly ? 'btn btn--ghost btn--icon oc-compare' : 'btn btn--ghost oc-compare'} href={url} target="_blank" rel="noreferrer" title="Compare in Fabric RTI: open the same view in the Microsoft Fabric RTI on-call app">
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className={labelClass}>Compare in Fabric RTI</span>
    </a>
  );
}

export function AsOf() {
  const { model } = useOnCall();
  return (
    <span className="oc-asof" title="Demo time is the telemetry bundle generation time">
      as of {dateTime(model.now, 'UTC')} UTC
    </span>
  );
}

export function ResetActions() {
  const { actions, reset } = useOnCall();
  if (!actions.length) return null;
  return (
    <button type="button" className="btn btn--ghost oc-reset" onClick={reset} title="Reset demo actions" aria-label={`Reset demo actions (${actions.length})`}>
      <RotateCcw size={13} aria-hidden="true" />
      <span className="oc-reset__label">Reset demo</span>
    </button>
  );
}

export function Section({ title, actions, children, className = '' }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card oc-card ${className}`}>
      <header className="oc-card__head">
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}
