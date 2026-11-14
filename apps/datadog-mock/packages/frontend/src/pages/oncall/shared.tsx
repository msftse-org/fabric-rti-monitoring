import type { ReactNode } from 'react';
import {
  AlarmClock,
  ArrowRightLeft,
  BellRing,
  Check,
  ChevronsUp,
  Eye,
  Flame,
  MessageSquare,
  MessagesSquare,
  Moon,
  Repeat,
  Send,
  SkipForward,
  Timer,
  TriangleAlert,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { MINUTE, ago, channelsFor, clock, duration, inMinutes, type Page, type PageEvent } from '@oncall';
import { useOnCall, type OnCallContextValue } from '../../lib/oncall';
import { navigate, paths, type PageFilter } from '../../lib/router';
import { ServiceTag } from '../../components/ui';
import { AvatarStack, ChannelTag, StatusPill, TeamPill, UrgencyChip } from '../../components/oncall/kit';

/** `inMinutes` rounds to whole minutes; keep sub-minute gaps from reading "in 0 min". */
export function until(at: number, now: number): string {
  return at - now < MINUTE ? 'in under a minute' : inMinutes(at, now);
}

export function pageDuration(page: Page, now: number): string {
  return duration((page.resolvedAt ?? now) - page.triggeredAt);
}

export function PagesTable({ pages, status = 'active', empty = 'No Pages match these filters.', compact, narrow }: { pages: Page[]; status?: PageFilter; empty?: string; compact?: boolean; narrow?: boolean }) {
  const { now, team } = useOnCall();
  if (!pages.length) return <div className="oc-empty">{empty}</div>;
  return (
    <div className="oc-pages-wrap">
      <table className="table oc-pages-table" data-compact={compact}>
        <thead>
          <tr>
            <th>Page</th>
            <th>Status</th>
            {!narrow && <th>Paged to</th>}
            <th>Responders</th>
            <th>Creation date</th>
            {!narrow && <th className="num">Duration</th>}
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id} className="row-link" onClick={() => navigate(paths.oncallPage(page.id, status))}>
              <td className="oc-pages__page">
                <div className="oc-pages__title">
                  <a href={`#${paths.oncallPage(page.id, status)}`} onClick={(event) => event.stopPropagation()}>
                    {page.title}
                  </a>{' '}
                  <span className="oc-pages__id">#{page.id}</span>
                </div>
                <div className="oc-pages__tags">
                  <UrgencyChip urgency={page.urgency} />
                  {page.service && <ServiceTag name={page.service} />}
                  {page.source === 'manual' && <span className="oc-tag">manual</span>}
                </div>
              </td>
              <td>
                <StatusPill status={page.status} />
              </td>
              {!narrow && (
                <td>
                  <TeamPill team={team(page.teamId)} link={false} />
                </td>
              )}
              <td>
                <AvatarStack ids={page.responderIds} max={3} />
              </td>
              <td className="oc-pages__date" title={`${new Date(page.triggeredAt).toISOString()}`}>
                {ago(page.triggeredAt, now)}
              </td>
              {!narrow && <td className="num oc-pages__duration">{pageDuration(page, now)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface EventView {
  icon: LucideIcon;
  tone: 'alert' | 'warn' | 'ok' | 'info' | 'muted';
  body: ReactNode;
  detail?: ReactNode;
}

const Strong = ({ children }: { children: ReactNode }) => <strong>{children}</strong>;

export function describeEvent(event: PageEvent, page: Page, ctx: OnCallContextValue): EventView {
  const { name, team, lk } = ctx;
  const actor = <Strong>{name(event.actorId)}</Strong>;
  const pageRef = <Strong>Page #{page.id}</Strong>;
  switch (event.kind) {
    case 'triggered':
      return {
        icon: BellRing,
        tone: 'alert',
        body: (
          <>
            {pageRef} was <span className="oc-word oc-word--triggered">Triggered</span>
            {page.monitorId !== null ? (
              <>
                {' '}
                from <a href={`#${paths.monitor(page.monitorId)}`}>Monitor #{page.monitorId}</a>
              </>
            ) : (
              ' manually'
            )}
          </>
        ),
        detail: event.urgency && <UrgencyChip urgency={event.urgency} />,
      };
    case 'routed': {
      const owner = team(event.teamId);
      if (event.actorId) {
        return { icon: Workflow, tone: 'info', body: <>{actor} paged <TeamPill team={owner} /></> };
      }
      const index = owner?.routingRules.findIndex((rule) => rule.id === page.ruleId) ?? -1;
      return {
        icon: Workflow,
        tone: 'info',
        body: (
          <>
            Routed to <TeamPill team={owner} /> by routing rule {index >= 0 ? `#${index + 1}` : ''}
          </>
        ),
      };
    }
    case 'held':
      return {
        icon: Moon,
        tone: 'muted',
        body: <>Outside support hours: notifications held{page.heldUntil ? ` until ${clock(page.heldUntil)} UTC` : ''}</>,
      };
    case 'notified': {
      const ids = event.userIds ?? [];
      const channels = [...new Set(ids.flatMap((id) => channelsFor(lk.users.get(id), event.urgency ?? page.urgency)))];
      return {
        icon: Send,
        tone: 'info',
        body: (
          <>
            Notified <Strong>{ids.map((id) => name(id)).join(', ')}</Strong> ({ids.length}){event.stepIndex !== undefined && <span className="muted"> · Step {event.stepIndex + 1}</span>}
            {event.cycle ? <span className="muted"> · Repeat {event.cycle}</span> : null}
          </>
        ),
        detail: channels.length ? (
          <span className="oc-channels">
            {channels.map((channel) => (
              <ChannelTag key={channel} channel={channel} />
            ))}
          </span>
        ) : undefined,
      };
    }
    case 'skipped':
      return { icon: SkipForward, tone: 'muted', body: <>Skipped {lk.schedules.get(event.scheduleId ?? '')?.name ?? 'schedule'}: nobody is on call</> };
    case 'escalated':
      return { icon: ChevronsUp, tone: 'warn', body: <>No one acknowledged; escalated to <Strong>Step {(event.stepIndex ?? 0) + 1}</Strong></> };
    case 'repeated':
      return { icon: Repeat, tone: 'warn', body: <>No one acknowledged; repeating the escalation policy (pass {(event.cycle ?? 0) + 1})</> };
    case 'acknowledged':
      return { icon: Eye, tone: 'warn', body: <>{pageRef} was <span className="oc-word oc-word--acknowledged">Acknowledged</span> by {actor}</> };
    case 'ack_timeout':
      return { icon: Timer, tone: 'alert', body: <>Acknowledgment timed out; {pageRef} was re-triggered</> };
    case 'urgency_changed':
      return { icon: TriangleAlert, tone: 'alert', body: <>Urgency raised to {event.urgency && <UrgencyChip urgency={event.urgency} />}: monitor moved from WARN to ALERT</> };
    case 'message_sent':
      return { icon: MessagesSquare, tone: 'info', body: <>Sent a message to <span className="mono">#{event.text.match(/#(\S+)/)?.[1] ?? team(event.teamId)?.chatChannel}</span></> };
    case 'reassigned': {
      const target = event.teamId ? <TeamPill team={team(event.teamId)} /> : <Strong>{name(event.userIds?.[0])}</Strong>;
      const comment = event.text.match(/: "([\s\S]*)"$/)?.[1];
      return {
        icon: ArrowRightLeft,
        tone: 'info',
        body: (
          <>
            {pageRef} was reassigned to {target} by {actor}
          </>
        ),
        detail: comment ? <q className="oc-quote">{comment}</q> : undefined,
      };
    }
    case 'snoozed': {
      return { icon: AlarmClock, tone: 'muted', body: <>{actor} snoozed the Page{event.until ? ` until ${clock(event.until)} UTC` : ''}</> };
    }
    case 'commented':
      return { icon: MessageSquare, tone: 'muted', body: <>{actor} commented</>, detail: <q className="oc-quote">{event.text}</q> };
    case 'incident_declared':
      return {
        icon: Flame,
        tone: 'alert',
        body: (
          <>
            {actor} declared incident <Strong>{page.incidentId}</Strong>
          </>
        ),
        detail: <span className="muted">{event.text.replace(/^.*?: /, '')}</span>,
      };
    case 'resolved':
      return {
        icon: Check,
        tone: 'ok',
        body: (
          <>
            {pageRef} was <span className="oc-word oc-word--resolved">Resolved</span>{' '}
            {event.reason === 'monitor' ? (
              <>
                : <a href={`#${paths.monitor(page.monitorId ?? 0)}`}>Monitor #{page.monitorId}</a> recovered
              </>
            ) : event.reason === 'policy' ? (
              'automatically after the escalation policy was exhausted'
            ) : (
              <>by {actor}</>
            )}
          </>
        ),
      };
  }
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dayRange(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  if (contiguous && sorted.length > 2) return `${WEEKDAY[sorted[0]]} – ${WEEKDAY[sorted.at(-1)!]}`;
  return sorted.map((day) => WEEKDAY[day]).join(', ');
}

export const hourLabel = (hour: number) => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
