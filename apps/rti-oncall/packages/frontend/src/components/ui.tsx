import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Ban,
  Blocks,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CodeXml,
  Copy,
  Check,
  Database,
  ExternalLink,
  Gauge,
  KeyRound,
  Mail,
  MessageSquare,
  OctagonAlert,
  Radio,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  UserCheck,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ago, SUPPORT_LABEL, type MonitorState, type PageStatus, type Support, type Urgency, type User } from '@oncall';
import { capability, utc } from '../lib/fabric';
import { datadogUrl, href } from '../lib/router';
import { useToast } from '../lib/toast';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'subtle'; size?: 'sm' | 'md'; icon?: ReactNode };

export function Button({ variant = 'secondary', size = 'md', icon, children, className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: 'primary' | 'secondary' | 'subtle'; size?: 'sm' | 'md'; icon?: ReactNode };

export function LinkButton({ variant = 'secondary', size = 'md', icon, children, className = '', ...rest }: LinkButtonProps) {
  return (
    <a className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </a>
  );
}

export function CommandBar({ label, children, end }: { label: string; children: ReactNode; end?: ReactNode }) {
  return (
    <div className="cmdbar" role="group" aria-label={label}>
      <div className="cmdbar__main">{children}</div>
      {end && <div className="cmdbar__end">{end}</div>}
    </div>
  );
}

type CommandProps = { icon: LucideIcon; label: string; primary?: boolean; onClick?: () => void; disabled?: boolean; href?: string; external?: boolean; title?: string };

export function Command({ icon: Icon, label, primary, onClick, disabled, href: link, external, title }: CommandProps) {
  const className = `cmd${primary ? ' cmd--primary' : ''}`;
  if (link) {
    return (
      <a className={className} href={link} title={title} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
        <Icon size={16} aria-hidden />
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} title={title}>
      <Icon size={16} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

export const CommandDivider = () => <span className="cmdbar__divider" aria-hidden />;

export function ViewHeader({ title, eyebrow, children, actions }: { title: ReactNode; eyebrow?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="view-header">
      <div className="view-header__text">
        {eyebrow && <div className="view-header__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <div className="view-header__meta">{children}</div>}
      </div>
      {actions && <div className="view-header__actions">{actions}</div>}
    </header>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.to ? <a href={href(item.to)}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
            {index < items.length - 1 && <ChevronRight size={12} aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CounterpartLink({ path, label = 'Open in Datadog mock' }: { path: string; label?: string }) {
  const url = datadogUrl(path);
  if (!url) return null;
  return (
    <a className="counterpart" href={url} target="_blank" rel="noreferrer">
      <span className="counterpart__mark" aria-hidden>
        DD
      </span>
      {label}
      <ExternalLink size={12} aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function Card({ title, icon: Icon, actions, children, className = '', id, subtitle, flush }: { title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; id?: string; subtitle?: ReactNode; flush?: boolean }) {
  return (
    <section className={`card ${flush ? 'card--flush' : ''} ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <div className="card__head">
          <div className="card__title">
            {Icon && <Icon size={16} aria-hidden className="card__icon" />}
            <div>
              {title && <h2>{title}</h2>}
              {subtitle && <p className="card__subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </div>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

const STATUS: Record<PageStatus, { icon: LucideIcon; label: string; tone: string }> = {
  triggered: { icon: CircleAlert, label: 'Triggered', tone: 'danger' },
  acknowledged: { icon: UserCheck, label: 'Acknowledged', tone: 'warning' },
  resolved: { icon: CircleCheck, label: 'Resolved', tone: 'success' },
};

export function StatusBadge({ status }: { status: PageStatus }) {
  const { icon: Icon, label, tone } = STATUS[status];
  return (
    <span className={`badge badge--${tone}`}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span className={`badge badge--outline ${urgency === 'high' ? 'badge--urgent' : ''}`}>
      {urgency === 'high' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
      {urgency === 'high' ? 'High' : 'Low'}
      <span className="sr-only"> urgency</span>
    </span>
  );
}

const STATE: Record<MonitorState, { icon: LucideIcon; label: string; tone: string }> = {
  ok: { icon: CircleCheck, label: 'OK', tone: 'success' },
  warn: { icon: TriangleAlert, label: 'Warn', tone: 'warning' },
  alert: { icon: OctagonAlert, label: 'Alert', tone: 'danger' },
  no_data: { icon: CircleDashed, label: 'No data', tone: 'neutral' },
};

export function StateBadge({ state }: { state: MonitorState }) {
  const { icon: Icon, label, tone } = STATE[state];
  return (
    <span className={`badge badge--${tone}`}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

const SUPPORT_ICON: Record<Support, LucideIcon> = { native: CircleCheck, automate: Workflow, built: Blocks, gap: Ban };
const SUPPORT_SHORT: Record<Support, string> = { native: 'Native', automate: 'Automate', built: 'Built', gap: 'Gap' };

export function SupportBadge({ support, compact }: { support: Support; compact?: boolean }) {
  const Icon = SUPPORT_ICON[support];
  return (
    <span className={`badge badge--support badge--${support}`} title={SUPPORT_LABEL[support]}>
      <Icon size={12} aria-hidden />
      {compact ? SUPPORT_SHORT[support] : SUPPORT_LABEL[support]}
    </span>
  );
}

const TONES = [
  { bg: '#dbeaf7', fg: '#0f548c', solid: '#0f6cbd' },
  { bg: '#d6efe8', fg: '#0b5a4b', solid: '#117865' },
  { bg: '#fde3d3', fg: '#8a3707', solid: '#ca5010' },
  { bg: '#e2efd5', fg: '#2f5a0b', solid: '#498205' },
  { bg: '#d3ebf0', fg: '#00495a', solid: '#03787c' },
  { bg: '#f7e6c2', fg: '#6b4f00', solid: '#986f0b' },
  { bg: '#dde2f7', fg: '#1d2f87', solid: '#2b48c9' },
  { bg: '#f6dcdf', fg: '#7f1d2b', solid: '#a4262c' },
  { bg: '#ecdccd', fg: '#5c3a1e', solid: '#8e562e' },
  { bg: '#e3e3e3', fg: '#3d3d3d', solid: '#616161' },
];

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Fluent-style avatar tones; the salt keeps every team free of repeats. */
export const toneOf = (userId: string) => TONES[hash(`g${userId}`) % TONES.length];

export function Avatar({ user, size = 24, label }: { user: User | undefined; size?: number; label?: boolean }) {
  const tone = toneOf(user?.id ?? '?');
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)), background: tone.bg, color: tone.fg }}
      title={user?.name}
      {...(label ? { role: 'img', 'aria-label': user?.name ?? 'Unknown' } : { 'aria-hidden': true })}
    >
      {user?.initials ?? '?'}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = 24 }: { users: (User | undefined)[]; max?: number; size?: number }) {
  const shown = users.slice(0, max);
  const names = users.map((user) => user?.name).filter(Boolean).join(', ');
  return (
    <span className="avatar-stack" role="img" aria-label={names || 'Nobody'} title={names}>
      {shown.map((user, index) => (
        <Avatar key={user?.id ?? index} user={user} size={size} />
      ))}
      {users.length > max && (
        <span className="avatar avatar--more" style={{ width: size, height: size }} aria-hidden>
          +{users.length - max}
        </span>
      )}
    </span>
  );
}

export function Person({ user, sub, size = 28 }: { user: User | undefined; sub?: ReactNode; size?: number }) {
  return (
    <span className="person">
      <Avatar user={user} size={size} />
      <span className="person__text">
        <span className="person__name">{user?.name ?? 'Nobody'}</span>
        {sub && <span className="person__sub">{sub}</span>}
      </span>
    </span>
  );
}

const KQL_KEYWORDS =
  /^(where|summarize|extend|project|join|kind|on|by|order|asc|desc|take|let|between|and|or|in|count|countif|minif|max|min|percentile|ago|now|datetime_diff|tostring|todouble|round|arg_max|real|null|leftouter|inner|table|create-merge|string|datetime|dynamic|int|long)$/;

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\/\/[^\n]*)|('[^'\n]*')|(\b\d+(?:\.\d+)?[mhd]?\b)|(\.?[A-Za-z_][\w-]*)|(\|)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(code))) {
    if (match.index > last) out.push(code.slice(last, match.index));
    const [token, comment, string, number, word, pipe] = match;
    const cls = comment ? 'tok-comment' : string ? 'tok-string' : number ? 'tok-number' : pipe ? 'tok-pipe' : word && (KQL_KEYWORDS.test(word.replace(/^\./, '')) || word.startsWith('.')) ? 'tok-keyword' : word && /^[A-Z]/.test(word) ? 'tok-entity' : '';
    out.push(cls ? <span key={key++} className={cls}>{token}</span> : token);
    last = match.index + token.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const notify = useToast();
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      notify('Copy is blocked in this browser', 'Select the text and copy it manually.', 'info');
    }
  };
  return (
    <button type="button" className="btn btn--subtle btn--sm" onClick={copy}>
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

export function CodeBlock({ code, title, language = 'KQL', note }: { code: string; title: string; language?: string; note?: ReactNode }) {
  return (
    <figure className="code">
      <figcaption className="code__head">
        <span className="code__title">
          <CodeXml size={14} aria-hidden />
          {title}
        </span>
        <span className="code__lang">{language}</span>
        <CopyButton text={code} />
      </figcaption>
      <pre tabIndex={0} aria-label={`${title} (${language})`}>
        <code>{language === 'KQL' ? highlight(code) : code}</code>
      </pre>
      {note && <div className="code__note">{note}</div>}
    </figure>
  );
}

export function Disclosure({ summary, children, defaultOpen, icon: Icon = CodeXml, id }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; icon?: LucideIcon; id?: string }) {
  return (
    <details className="disclosure" open={defaultOpen} id={id}>
      <summary>
        <ChevronRight size={14} aria-hidden className="disclosure__chevron" />
        <Icon size={14} aria-hidden />
        {summary}
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

export function Kpi({ label, value, hint, icon: Icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: 'danger' | 'warning' | 'brand' }) {
  return (
    <div className={`kpi ${tone ? `kpi--${tone}` : ''}`}>
      <div className="kpi__label">
        {Icon && <Icon size={14} aria-hidden />}
        {label}
      </div>
      <div className="kpi__value">{value}</div>
      {hint && <div className="kpi__hint">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = CircleCheck, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon size={28} aria-hidden />
      <strong>{title}</strong>
      {children && <div className="empty__body">{children}</div>}
    </div>
  );
}

export function TimeAgo({ at, now }: { at: number; now: number }) {
  return (
    <time dateTime={new Date(at).toISOString()} title={utc(at)}>
      {ago(at, now)}
    </time>
  );
}

const ARTIFACTS: Record<string, { icon: LucideIcon; kind: 'fabric' | 'm365' | 'app' }> = {
  Eventhouse: { icon: Database, kind: 'fabric' },
  Eventstream: { icon: Radio, kind: 'fabric' },
  'KQL queryset': { icon: CodeXml, kind: 'fabric' },
  Activator: { icon: Zap, kind: 'fabric' },
  'Real-Time Dashboard': { icon: Gauge, kind: 'fabric' },
  'Fabric workspace roles': { icon: ShieldCheck, kind: 'fabric' },
  'Power Automate': { icon: Workflow, kind: 'm365' },
  'Microsoft Teams': { icon: MessageSquare, kind: 'm365' },
  'Microsoft Entra ID': { icon: KeyRound, kind: 'm365' },
  'Azure Communication Services': { icon: Smartphone, kind: 'm365' },
  Outlook: { icon: Mail, kind: 'm365' },
  'This app': { icon: AppWindow, kind: 'app' },
};

export function Artifact({ name }: { name: string }) {
  const item = ARTIFACTS[name] ?? { icon: Blocks, kind: 'app' as const };
  const Icon = item.icon;
  return (
    <span className={`artifact artifact--${item.kind}`}>
      <span className="artifact__icon" aria-hidden>
        <Icon size={12} />
      </span>
      {name}
    </span>
  );
}

/** "How Fabric does it" rows for the capabilities a view demonstrates. */
export function CapabilityList({ ids }: { ids: string[] }) {
  return (
    <ul className="caps">
      {ids.map((id) => {
        const item = capability(id);
        if (!item) return null;
        return (
          <li key={id} className="caps__item">
            <div className="caps__head">
              <SupportBadge support={item.support} />
              <strong>{item.rti.feature}</strong>
            </div>
            <p>{item.rti.detail}</p>
            <div className="caps__foot">
              <span className="caps__dd">Datadog: {item.datadog.feature}</span>
              {item.rti.items.length > 0 && (
                <span className="caps__items">
                  {item.rti.items.map((name) => (
                    <Artifact key={name} name={name} />
                  ))}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Dialog({ title, onClose, children, footer, onSubmit, description, wide }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; onSubmit: () => void; description?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog--wide' : ''}`}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <form
        className="dialog__surface"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="dialog__head">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {description && <div className="dialog__desc">{description}</div>}
        <div className="dialog__body">{children}</div>
        <div className="dialog__foot">{footer}</div>
      </form>
    </dialog>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="field__label">{label}</span>}
      {children}
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} className="segmented__item" onClick={() => onChange(option.value)}>
          {option.label}
          {option.count !== undefined && <span className="segmented__count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ArtifactCallout({ children, support, capabilityId }: { children: ReactNode; support?: Support; capabilityId?: string }) {
  const item = capabilityId ? capability(capabilityId) : undefined;
  const level = support ?? item?.support;
  return (
    <div className="callout">
      {level && <SupportBadge support={level} />}
      <div>{children}</div>
    </div>
  );
}
