import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BellOff,
  CircleCheck,
  CodeXml,
  Hourglass,
  ListOrdered,
  MessageSquareText,
  Siren,
  UserCheck,
  UserPlus,
  Workflow,
  Zap,
} from 'lucide-react';
import { dateTime, duration, formatMonitorValue, inMinutes, stepResponders, type Lookup, type OnCallModel, type Page } from '@oncall';
import { CommentDialog, IncidentDialog, ReassignDialog, SnoozeDialog } from '../components/dialogs';
import { KeyValue, Timeline } from '../components/oncall';
import { targetSummary } from '../components/flow';
import {
  AvatarStack,
  Card,
  CodeBlock,
  Command,
  CommandBar,
  CommandDivider,
  CounterpartLink,
  Crumbs,
  Disclosure,
  EmptyState,
  LinkButton,
  StatusBadge,
  TimeAgo,
  UrgencyBadge,
  ViewHeader,
} from '../components/ui';
import { conditionKql, firingRuleName, flowName, pageTimelineKql, ruleKql, teamRule, utc } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, paths } from '../lib/router';
import { useToast } from '../lib/toast';

type DialogKind = 'reassign' | 'snooze' | 'incident' | 'comment' | null;

interface NextInfo {
  tone: 'danger' | 'warning' | 'success' | 'neutral';
  title: string;
  detail: string;
  userIds?: string[];
  at?: number;
}

function lastCycle(page: Page) {
  return page.events.reduce((cycle, event) => (event.kind === 'notified' && event.cycle !== undefined ? Math.max(cycle, event.cycle) : cycle), 0);
}

function untilText(at: number, now: number) {
  if (at <= now) return 'now';
  return at - now < 60_000 ? 'in under a minute' : inMinutes(at, now);
}

function whatNext(page: Page, lk: Lookup, now: number): NextInfo {
  const policy = page.policyId ? lk.policies.get(page.policyId) : undefined;
  const responders = (ids: string[] | undefined) => (ids ?? []).map((id) => lk.users.get(id)?.name ?? id).join(', ');
  if (page.status === 'resolved') {
    const how = page.resolution === 'monitor_recovered' ? 'the recovery rule fired' : page.resolution === 'policy_exhausted' ? 'the flow ran out of steps' : `${responders(page.resolvedBy ? [page.resolvedBy] : [])} resolved it`;
    return { tone: 'success', title: 'Nothing. This page is resolved.', detail: `Resolved ${utc(page.resolvedAt ?? now)} because ${how}. The flow run has completed.` };
  }
  if (page.status === 'acknowledged') {
    const found = teamRule(page, lk);
    const action = found?.rule.actions.find((item) => item.kind === 'escalation');
    const timeout = action && action.kind === 'escalation' ? action.ackTimeoutMinutes : undefined;
    const ackAt = page.acknowledgedAt ?? now;
    return {
      tone: 'warning',
      title: `${responders(page.acknowledgedBy ? [page.acknowledgedBy] : [])} is working on it`,
      detail: timeout
        ? `The flow stopped escalating. If the page is still open at ${utc(ackAt + timeout * 60_000)} (${timeout} min after the acknowledgment), it re-enters the escalation loop.`
        : `The flow stopped escalating. It waits for a resolve from this app, the Teams card${page.monitorId !== null ? ' or the recovery rule' : ''}.`,
      userIds: page.acknowledgedBy ? [page.acknowledgedBy] : undefined,
    };
  }
  if (page.snoozedUntil && page.snoozedUntil > now) {
    return { tone: 'neutral', title: `Snoozed until ${utc(page.snoozedUntil)}`, detail: 'The flow resumes the escalation when the snooze ends.', at: page.snoozedUntil };
  }
  if (page.heldUntil && page.heldUntil > now) {
    return { tone: 'neutral', title: 'Held until support hours open', detail: `The flow's "Delay until" step releases the notification at ${utc(page.heldUntil)}.`, at: page.heldUntil };
  }
  if (!policy || page.currentStep === null || page.nextEscalationAt === null) {
    return { tone: 'danger', title: 'Waiting for an acknowledgment', detail: `Notified: ${responders(page.responderIds) || 'nobody yet'}. Acknowledge from this app or the Teams adaptive card.` };
  }
  const cycle = lastCycle(page);
  const at = page.nextEscalationAt;
  const isLast = page.currentStep >= policy.steps.length - 1;
  if (isLast && cycle >= policy.repeat) {
    return policy.resolveAfterExhausted
      ? { tone: 'danger', title: `Auto-resolves ${untilText(at, now)} if nobody acknowledges`, detail: `Last step of the last pass. At ${utc(at)} the "Do until" loop ends and the flow resolves the page.`, at }
      : { tone: 'danger', title: 'Stays triggered after the last step', detail: `Every pass has run. After ${utc(at)} the page stays open for someone to pick up.`, at };
  }
  const nextIndex = isLast ? 0 : page.currentStep + 1;
  const nextCycle = isLast ? cycle + 1 : cycle;
  const step = policy.steps[nextIndex];
  const { userIds } = stepResponders(step, at, page.id, nextCycle, lk);
  return {
    tone: 'danger',
    title: `Escalates to step ${nextIndex + 1}${isLast ? ` (pass ${nextCycle + 1})` : ''} ${untilText(at, now)}`,
    detail: `If nobody acknowledges by ${utc(at)}, the flow notifies ${targetSummary(step, lk)}${userIds.length ? `: ${responders(userIds)}` : ''}.`,
    userIds,
    at,
  };
}

function EscalationProgress({ page, lk }: { page: Page; lk: Lookup }) {
  const policy = page.policyId ? lk.policies.get(page.policyId) : undefined;
  if (!policy) return <EmptyState title="No escalation flow">This page was not routed to an escalation policy.</EmptyState>;
  const cycle = lastCycle(page);
  const notified = page.events.filter((event) => event.kind === 'notified' && event.stepIndex !== undefined && (event.cycle ?? 0) === cycle);
  const ackStep = page.acknowledgedAt !== null ? notified.filter((event) => event.at <= (page.acknowledgedAt ?? 0)).at(-1)?.stepIndex : undefined;
  return (
    <>
      <p className="muted small">
        <a href={href(paths.escalation(policy.id))}>{policy.name}</a> · pass {cycle + 1} of {policy.repeat + 1}
      </p>
      <ol className="progress">
        {policy.steps.map((step, index) => {
          const event = notified.find((item) => item.stepIndex === index);
          const current = page.status === 'triggered' && page.currentStep === index;
          const acked = ackStep === index && page.status !== 'triggered';
          const state = acked ? 'acked' : current ? 'current' : event ? 'done' : 'pending';
          const label = acked ? 'Acknowledged here' : current ? 'Waiting for a response' : event ? 'Notified, timed out' : 'Not reached';
          return (
            <li key={step.id} className={`progress__step progress__step--${state}`}>
              <span className="progress__marker" aria-hidden>
                {index + 1}
              </span>
              <div className="progress__body">
                <div className="progress__head">
                  <strong>Step {index + 1}</strong>
                  <span className="progress__state">{label}</span>
                </div>
                <div className="progress__meta">
                  {targetSummary(step, lk)} · wait {step.escalateAfterMinutes} min
                </div>
                {event && (
                  <div className="progress__who">
                    <AvatarStack users={(event.userIds ?? []).map((id) => lk.users.get(id))} size={20} />
                    <span>{new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(event.at)} UTC</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function SourceRule({ page, model, lk }: { page: Page; model: OnCallModel; lk: Lookup }) {
  const monitor = page.monitorId !== null ? model.monitors.find((item) => item.id === page.monitorId) : undefined;
  const found = teamRule(page, lk);
  if (!monitor) {
    return (
      <>
        <p className="muted">Created by hand in this app. Manual pages skip the Activator rules and start the team's escalation flow directly.</p>
        <KeyValue items={[['Written to', 'OnCallPages, OnCallPageEvents'], ['Flow', flowName(lk.teams.get(page.teamId))]]} />
      </>
    );
  }
  const threshold = page.alertStatus === 'warn' ? monitor.warn : page.alertStatus === 'no_data' ? monitor.alert : monitor.alert;
  return (
    <>
      <KeyValue
        items={[
          ['Rule', <a href={href(paths.rule(monitor.id))}>{firingRuleName(monitor, page.alertStatus)}</a>],
          ['Object', monitor.service ? `Service = ${monitor.service}` : 'Cluster'],
          [monitor.signal === 'no_data' ? 'Silence' : 'Peak value', <strong className="value-strong">{formatMonitorValue(monitor, page.value)}</strong>],
          ['Threshold', `${monitor.signal === 'no_data' ? 'No presence of data for' : monitor.comparison === 'below' ? 'Decreases below' : 'Increases above'} ${formatMonitorValue(monitor, threshold)}`],
          ['Routing', found ? <code className="inline-code">{conditionKql(found.rule)}</code> : 'Default team flow'],
        ]}
      />
      <Disclosure summary="KQL behind the rule">
        <CodeBlock code={ruleKql(monitor)} title={monitor.authored ? `Activator KQL source · ${monitor.name}` : `KQL queryset · ${monitor.name}`} />
      </Disclosure>
    </>
  );
}

export function PageDetail({ id }: { id: number }) {
  const { model, lk, now, act, me } = useOnCall();
  const notify = useToast();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const page = model.pages.find((item) => item.id === id);
  const next = useMemo(() => (page ? whatNext(page, lk, now) : null), [page, lk, now]);

  if (!page || !next) {
    return (
      <>
        <Crumbs items={[{ label: 'Pages', to: paths.pages() }, { label: `#${id}` }]} />
        <EmptyState icon={Siren} title={`Page #${id} is not in this data`}>
          Pages are computed from the latest Eventhouse window. Manual pages get a new number when the window moves.{' '}
          <a href={href(paths.pages())}>Back to pages</a>
        </EmptyState>
      </>
    );
  }

  const team = lk.teams.get(page.teamId);
  const ack = () => {
    act({ kind: 'ack', pageId: page.id });
    notify(`Acknowledged #${page.id}`, 'Written to OnCallPageEvents; the flow stops escalating.');
  };
  const resolve = () => {
    act({ kind: 'resolve', pageId: page.id });
    notify(`Resolved #${page.id}`, 'Written to OnCallPageEvents; the flow run completes.');
  };
  const open = page.status !== 'resolved';
  const end = page.resolvedAt ?? Math.max(now, page.triggeredAt);
  const openKql = () => {
    const details = document.getElementById('page-kql');
    if (details instanceof HTMLDetailsElement) {
      details.open = true;
      details.scrollIntoView({ behavior: 'smooth', block: 'center' });
      details.querySelector('summary')?.focus();
    }
  };

  return (
    <>
      <Crumbs items={[{ label: 'Pages', to: paths.pages() }, { label: `#${page.id}` }]} />
      <ViewHeader
        eyebrow={`Activator alert #${page.id}`}
        title={page.title}
        actions={
          <>
            <CounterpartLink path={paths.page(page.id)} />
            <LinkButton href={href(paths.comparePage(page.id))} variant="primary" icon={<ArrowLeftRight size={16} aria-hidden />}>
              Compare with Datadog
            </LinkButton>
          </>
        }
      >
        <StatusBadge status={page.status} />
        <UrgencyBadge urgency={page.urgency} />
        <a href={href(paths.team(page.teamId))} className="team-chip">
          <span className="team-chip__dot" style={{ background: team?.color }} aria-hidden />
          {team?.name}
        </a>
        <span className="muted">
          Triggered <TimeAgo at={page.triggeredAt} now={now} /> · {duration(end - page.triggeredAt)}
          {open ? ' open' : ' to resolve'}
        </span>
        {page.incidentId && <span className="badge badge--outline">Incident {page.incidentId}</span>}
      </ViewHeader>

      <CommandBar label="Page commands" end={<Command icon={CodeXml} label="Open in KQL queryset" onClick={openKql} />}>
        <Command icon={UserCheck} label="Acknowledge" primary={page.status === 'triggered'} onClick={ack} disabled={page.status !== 'triggered'} title={page.status === 'triggered' ? `Acknowledge as ${me.name}` : 'Only triggered pages can be acknowledged'} />
        <Command icon={CircleCheck} label="Resolve" primary={page.status === 'acknowledged'} onClick={resolve} disabled={!open} />
        <CommandDivider />
        <Command icon={UserPlus} label="Reassign" onClick={() => setDialog('reassign')} disabled={!open} />
        <Command icon={BellOff} label="Snooze" onClick={() => setDialog('snooze')} disabled={page.status !== 'triggered'} title={page.status === 'triggered' ? undefined : 'Only triggered pages can be snoozed'} />
        <Command icon={Siren} label="Declare incident" onClick={() => setDialog('incident')} disabled={Boolean(page.incidentId)} />
        <Command icon={MessageSquareText} label="Comment" onClick={() => setDialog('comment')} />
      </CommandBar>

      {page.description && <p className="lede">{page.description}</p>}

      <div className="grid grid--main">
        <div className="stack">
          <section className={`next next--${next.tone}`} aria-labelledby="next-title">
            <div className="next__icon" aria-hidden>
              {next.tone === 'success' ? <CircleCheck size={20} /> : next.tone === 'warning' ? <UserCheck size={20} /> : <Hourglass size={20} />}
            </div>
            <div className="next__body">
              <div className="next__eyebrow">What happens next</div>
              <h2 id="next-title">{next.title}</h2>
              <p>{next.detail}</p>
              {next.userIds && next.userIds.length > 0 && <AvatarStack users={next.userIds.map((userId) => lk.users.get(userId))} size={26} max={6} />}
            </div>
            {next.at && (
              <div className="next__when">
                <span>{dateTime(next.at)}</span>
                <span className="muted small">UTC</span>
              </div>
            )}
          </section>

          <Card title="Timeline" icon={ListOrdered} subtitle="Activator, Power Automate and responder actions, from OnCallPageEvents" flush>
            <Timeline page={page} />
          </Card>
          <Disclosure summary="Timeline as KQL" id="page-kql">
            <CodeBlock code={pageTimelineKql(page.id)} title="KQL queryset · oncall" />
          </Disclosure>
        </div>
        <div className="stack">
          <Card title="Escalation progress" icon={Workflow}>
            <EscalationProgress page={page} lk={lk} />
          </Card>
          <Card title={page.source === 'monitor' ? 'Source Activator rule' : 'Source'} icon={Zap}>
            <SourceRule page={page} model={model} lk={lk} />
          </Card>
          <Card title="Details">
            <KeyValue
              items={[
                ['Page', `#${page.id}`],
                ['Team', team?.name ?? page.teamId],
                ['Service', page.service ?? (page.source === 'manual' ? 'Not set' : 'Cluster-wide')],
                ['Responders', <AvatarStack users={page.responderIds.map((userId) => lk.users.get(userId))} size={22} max={6} />],
                ['Triggered', utc(page.triggeredAt)],
                ['Acknowledged', page.acknowledgedAt ? `${utc(page.acknowledgedAt)} by ${lk.users.get(page.acknowledgedBy ?? '')?.name ?? 'someone'}` : 'Not yet'],
                ['Resolved', page.resolvedAt ? utc(page.resolvedAt) : 'Not yet'],
              ]}
            />
          </Card>
          <a className="compare-cta" href={href(paths.comparePage(page.id))}>
            <ArrowLeftRight size={18} aria-hidden />
            <span>
              <strong>Compare with Datadog</strong>
              <span>The same page, event by event, in Datadog On-Call terms</span>
            </span>
          </a>
        </div>
      </div>

      {dialog === 'reassign' && <ReassignDialog page={page} onClose={() => setDialog(null)} />}
      {dialog === 'snooze' && <SnoozeDialog page={page} onClose={() => setDialog(null)} />}
      {dialog === 'incident' && <IncidentDialog page={page} onClose={() => setDialog(null)} />}
      {dialog === 'comment' && <CommentDialog page={page} onClose={() => setDialog(null)} />}
    </>
  );
}
