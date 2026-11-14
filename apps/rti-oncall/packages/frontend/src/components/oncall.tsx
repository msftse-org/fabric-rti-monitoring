import type { ReactNode } from 'react';
import { AppWindow, ArrowRight, Database, Mail, MessageSquare, Smartphone, UserCheck, Workflow, Zap, type LucideIcon } from 'lucide-react';
import { duration, PAGING_FLOW, type Page, type PageEvent } from '@oncall';
import { describeFabric, type ActorKind, type Described } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, navigate, paths } from '../lib/router';
import { Avatar, AvatarStack, EmptyState, StatusBadge, SupportBadge, TimeAgo, UrgencyBadge } from './ui';
import { capability } from '../lib/fabric';

export function PageTable({ pages, empty = 'No pages match', caption, showTeam = true }: { pages: Page[]; empty?: string; caption: string; showTeam?: boolean }) {
  const { now, lk } = useOnCall();
  if (!pages.length) return <EmptyState title={empty} />;
  return (
    <div className="table-wrap">
      <table className="table table--cards table--pages">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Urgency</th>
            <th scope="col">Page</th>
            {showTeam && <th scope="col">Team</th>}
            <th scope="col">Responders</th>
            <th scope="col">Triggered</th>
            <th scope="col" className="num">
              Duration
            </th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => {
            const team = lk.teams.get(page.teamId);
            const end = page.resolvedAt ?? Math.max(now, page.triggeredAt);
            return (
              <tr key={page.id} className="row-link" onClick={(event) => (event.target as HTMLElement).closest('a') || navigate(paths.page(page.id))}>
                <td data-label="Status">
                  <StatusBadge status={page.status} />
                </td>
                <td data-label="Urgency">
                  <UrgencyBadge urgency={page.urgency} />
                </td>
                <td data-label="Page" className="cell-page">
                  <a href={href(paths.page(page.id))} className="page-link">
                    <span className="page-link__id">#{page.id}</span>
                    <span className="page-link__title">{page.title}</span>
                  </a>
                  <span className="cell-sub">{page.source === 'monitor' ? `Activator rule · ${page.service ?? 'cluster'}` : 'Manual page'}</span>
                </td>
                {showTeam && (
                  <td data-label="Team">
                    <span className="team-chip">
                      <span className="team-chip__dot" style={{ background: team?.color }} aria-hidden />
                      {team?.name ?? page.teamId}
                    </span>
                  </td>
                )}
                <td data-label="Responders">
                  <AvatarStack users={page.responderIds.map((id) => lk.users.get(id))} size={22} />
                </td>
                <td data-label="Triggered">
                  <TimeAgo at={page.triggeredAt} now={now} />
                </td>
                <td data-label="Duration" className="num">
                  {duration(end - page.triggeredAt)}
                  {page.status !== 'resolved' && <span className="cell-sub"> open</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const ACTOR_ICON: Record<ActorKind, LucideIcon> = { activator: Zap, flow: Workflow, user: UserCheck, app: AppWindow, monitor: Zap, datadog: Zap };

export function ActorChip({ described }: { described: Described }) {
  const { lk } = useOnCall();
  const { actor } = described;
  if (actor.kind === 'user') {
    return (
      <span className="actor actor--user">
        <Avatar user={lk.users.get(actor.userId ?? '')} size={20} />
        {actor.label}
      </span>
    );
  }
  const Icon = ACTOR_ICON[actor.kind];
  return (
    <span className={`actor actor--${actor.kind}`}>
      <span className="actor__icon" aria-hidden>
        <Icon size={12} />
      </span>
      {actor.label}
    </span>
  );
}

export function NotifiedList({ items }: { items: NonNullable<Described['notified']> }) {
  const { lk } = useOnCall();
  return (
    <ul className="notified">
      {items.map((item) => (
        <li key={item.userId}>
          <Avatar user={lk.users.get(item.userId)} size={18} />
          <span className="notified__name">{lk.users.get(item.userId)?.name ?? item.userId}</span>
          <span className="notified__channels">
            {item.channels.map((channel) => (
              <span key={channel} className="chip">
                {channel}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

const TONE: Partial<Record<PageEvent['kind'], string>> = {
  triggered: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
  escalated: 'danger',
  repeated: 'danger',
  ack_timeout: 'danger',
  urgency_changed: 'danger',
};

function offset(ms: number) {
  return ms <= 0 ? 'T+0' : `T+${duration(ms)}`;
}

export function Timeline({ page }: { page: Page }) {
  const onCall = useOnCall();
  const ctx = { page, model: onCall.model, lk: onCall.lk, byViewer: (kind: 'ack' | 'resolve', at: number) => onCall.byViewer(page.id, kind, at) };
  return (
    <ol className="timeline">
      {page.events.map((event, index) => {
        const described = describeFabric(event, ctx);
        const cap = described.capabilityId ? capability(described.capabilityId) : undefined;
        return (
          <li key={`${event.at}-${event.kind}-${index}`} className={`timeline__item timeline__item--${TONE[event.kind] ?? 'neutral'}`}>
            <div className="timeline__time">
              <time dateTime={new Date(event.at).toISOString()}>
                {new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(event.at)}
              </time>
              <span>{offset(event.at - page.triggeredAt)}</span>
            </div>
            <div className="timeline__dot" aria-hidden />
            <div className="timeline__body">
              <div className="timeline__head">
                <ActorChip described={described} />
                <span className="timeline__title">{described.title}</span>
              </div>
              {described.detail && <p className="timeline__detail">{described.detail}</p>}
              {described.notified && <NotifiedList items={described.notified} />}
              {cap && (
                <div className="timeline__cap">
                  <SupportBadge support={cap.support} compact />
                  <span>{cap.rti.feature}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const FLOW_NODES: { icon: LucideIcon[]; title: string; caption: string; to?: string }[] = [
  { icon: [Database], title: 'Eventhouse', caption: 'OTELTraces from the AKS workload', to: paths.rules() },
  { icon: [Zap], title: 'Activator rule', caption: 'Warn, alert, heartbeat and recovery conditions', to: paths.rules() },
  { icon: [Workflow], title: 'Power Automate flow', caption: 'Routing, support hours, escalation steps', to: paths.escalations() },
  { icon: [MessageSquare, Mail, Smartphone], title: 'Teams / Outlook / SMS', caption: 'Adaptive card, email, SMS and voice via ACS', to: paths.settings() },
  { icon: [UserCheck], title: 'Ack in this app', caption: 'Or from the Teams adaptive card', to: paths.pages() },
  { icon: [Database], title: 'Eventhouse', caption: 'OnCallPageEvents audit trail', to: paths.analytics() },
];

export function PagingFlowStrip() {
  return (
    <ol className="flowstrip" aria-label="Paging flow">
      {FLOW_NODES.map((node, index) => (
        <li key={`${node.title}-${index}`} className="flowstrip__node">
          <a href={href(node.to ?? '/')} className="flowstrip__card">
            <span className="flowstrip__icons" aria-hidden>
              {node.icon.map((Icon, iconIndex) => (
                <Icon key={iconIndex} size={16} />
              ))}
            </span>
            <strong>{node.title}</strong>
            <span>{node.caption}</span>
          </a>
          {index < FLOW_NODES.length - 1 && <ArrowRight size={16} className="flowstrip__arrow" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function PagingFlowSteps() {
  return (
    <ol className="flowsteps">
      {PAGING_FLOW.map((step, index) => (
        <li key={step.title}>
          <span className="flowsteps__n" aria-hidden>
            {index + 1}
          </span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([key, value], index) => (
        <div key={index} className="kv__row">
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
