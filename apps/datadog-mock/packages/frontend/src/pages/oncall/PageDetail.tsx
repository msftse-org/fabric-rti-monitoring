import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BellRing, Check, ChevronsUp, Eye, Flame, Moon, ShieldAlert, X } from 'lucide-react';
import { ago, clock, dateTime, duration, formatMonitorValue, stepResponders, type EscalationPolicy, type Page } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { paths } from '../../lib/router';
import { useInert, useToast } from '../../lib/toast';
import { CopyButton, ServiceTag } from '../../components/ui';
import { AvatarStack, CompareLink, MonitorChip, PersonPill, StatusPill, TeamPill, UrgencyChip } from '../../components/oncall/kit';
import { DeclareIncidentModal, ReassignModal, SnoozeButton } from '../../components/oncall/PageModals';
import { describeEvent, pageDuration, until } from './shared';

/** Datadog-style side panel; full screen on narrow viewports. */
export function PagePanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { page } = useOnCall();
  const current = page(id);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((event.target as HTMLElement | null)?.closest?.('.menu, [aria-expanded="true"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside ref={ref} className="oc-panel" aria-label={current ? `Page #${current.id}` : 'Page'} tabIndex={-1}>
      {current ? (
        <PageDetail page={current} onClose={onClose} />
      ) : (
        <div className="oc-panel__missing">
          <button type="button" className="icon-btn" aria-label="Close Page" onClick={onClose}>
            <X size={16} />
          </button>
          <p>Page #{id} does not exist in this demo.</p>
        </div>
      )}
    </aside>
  );
}

function PageDetail({ page, onClose }: { page: Page; onClose: () => void }) {
  const { lk, now, team, name, model } = useOnCall();
  const owner = team(page.teamId);
  const policy = page.policyId ? lk.policies.get(page.policyId) : owner ? lk.policies.get(owner.escalationPolicyId) : undefined;
  const monitor = page.monitorId !== null ? model.monitors.find((item) => item.id === page.monitorId) : undefined;

  return (
    <>
      <header className="oc-panel__head">
        <div className="oc-panel__ident">
          <BellRing size={16} className={`oc-panel__icon oc-panel__icon--${page.status}`} aria-hidden="true" />
          <span className="oc-panel__ref">Page #{page.id}</span>
          <CopyButton value={`#${page.id}`} label="Copy Page ID" />
          <span className="oc-panel__paged">
            Team <TeamPill team={owner} /> paged
          </span>
        </div>
        <div className="oc-panel__tools">
          {policy && (
            <a className="link-btn oc-panel__policy" href={`#${paths.oncallPolicy(policy.id)}`}>
              View Escalation Policy
            </a>
          )}
          <CompareLink path={paths.oncallPage(page.id)} iconOnly />
          <button type="button" className="icon-btn" aria-label="Close Page" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="oc-panel__body">
        <h2 className="oc-panel__title">{page.title}</h2>
        <dl className="oc-meta">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusPill status={page.status} />
            </dd>
          </div>
          <div>
            <dt>Urgency</dt>
            <dd>
              <UrgencyChip urgency={page.urgency} />
            </dd>
          </div>
          <div>
            <dt>Triggered</dt>
            <dd title={`${dateTime(page.triggeredAt)} UTC`}>{ago(page.triggeredAt, now)}</dd>
          </div>
          <div>
            <dt>Responders</dt>
            <dd>{page.responderIds.length ? <AvatarStack ids={page.responderIds} max={5} /> : <em className="muted">None yet</em>}</dd>
          </div>
          {page.service && (
            <div>
              <dt>Service</dt>
              <dd>
                <ServiceTag name={page.service} />
              </dd>
            </div>
          )}
          <div>
            <dt>Source</dt>
            <dd>{page.source === 'monitor' ? <a href={`#${paths.monitor(page.monitorId ?? 0)}`}>Monitor #{page.monitorId}</a> : <span>Manual · {name(page.events.find((event) => event.kind === 'routed')?.actorId)}</span>}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{pageDuration(page, now)}</dd>
          </div>
          {page.incidentId && (
            <div>
              <dt>Incident</dt>
              <dd>
                <span className="oc-incident">
                  <Flame size={12} aria-hidden="true" /> {page.incidentId}
                </span>
              </dd>
            </div>
          )}
        </dl>

        <NextSteps page={page} policy={policy} />

        <section className="oc-block">
          <h3 className="oc-block__title">Description</h3>
          <p className="oc-description">{page.description || <em className="muted">No description</em>}</p>
        </section>

        {policy && <EscalationProgress page={page} policy={policy} />}

        {monitor && (
          <section className="oc-block">
            <h3 className="oc-block__title">Monitor</h3>
            <a className="oc-monitor-link" href={`#${paths.monitor(monitor.id)}`}>
              <MonitorChip state={model.monitorStatus.find((item) => item.monitorId === monitor.id)?.state ?? 'ok'} />
              <span className="grow truncate">{monitor.name}</span>
              <span className="muted">#{monitor.id}</span>
            </a>
            <div className="oc-threshold">
              <div>
                <span className="muted">Value at trigger</span>
                <strong className={page.alertStatus === 'warn' ? 'text-warn' : 'text-alert'}>{page.value === null ? '–' : formatMonitorValue(monitor, page.value)}</strong>
              </div>
              {monitor.warn !== null && (
                <div>
                  <span className="muted">Warning threshold</span>
                  <strong>{formatMonitorValue(monitor, monitor.warn)}</strong>
                </div>
              )}
              <div>
                <span className="muted">Alert threshold</span>
                <strong>{formatMonitorValue(monitor, monitor.alert)}</strong>
              </div>
              <div>
                <span className="muted">Evaluation window</span>
                <strong>last {monitor.windowMinutes}m</strong>
              </div>
            </div>
            <code className="oc-query">{monitor.query}</code>
          </section>
        )}

        <Timeline page={page} />
      </div>
    </>
  );
}

function NextSteps({ page, policy }: { page: Page; policy: EscalationPolicy | undefined }) {
  const { act, now, name } = useOnCall();
  const notify = useToast();
  const inert = useInert();
  const [modal, setModal] = useState<'reassign' | 'incident' | null>(null);
  const open = page.status !== 'resolved';

  return (
    <section className="oc-next" aria-label="Next steps">
      <h3 className="oc-next__title">Next steps</h3>
      <p className="oc-next__hint">
        <NextHint page={page} policy={policy} />
      </p>
      {open ? (
        <div className="oc-next__actions">
          {page.status === 'triggered' && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                act({ kind: 'ack', pageId: page.id });
                notify(`Page #${page.id} acknowledged`);
              }}
            >
              <Eye size={14} aria-hidden="true" /> Acknowledge
            </button>
          )}
          <button type="button" className="btn" onClick={() => setModal('reassign')}>
            <ArrowRight size={14} aria-hidden="true" /> Reassign
          </button>
          <button
            type="button"
            className={page.status === 'acknowledged' ? 'btn btn--primary' : 'btn'}
            onClick={() => {
              act({ kind: 'resolve', pageId: page.id });
              notify(`Page #${page.id} resolved`);
            }}
          >
            <Check size={14} aria-hidden="true" /> Resolve
          </button>
          {page.status === 'triggered' && (
            <>
              <button type="button" className="btn" onClick={inert}>
                <ChevronsUp size={14} aria-hidden="true" /> Escalate
              </button>
              <SnoozeButton page={page} />
            </>
          )}
          <span className="grow" />
          {!page.incidentId && (
            <button type="button" className="btn oc-next__incident" onClick={() => setModal('incident')}>
              <ShieldAlert size={14} aria-hidden="true" /> Declare Incident
            </button>
          )}
        </div>
      ) : (
        <div className="oc-next__actions">
          <span className="muted">
            Resolved {ago(page.resolvedAt ?? now, now)} {page.resolution === 'manual' ? `by ${name(page.resolvedBy)}` : page.resolution === 'monitor_recovered' ? 'when the monitor recovered' : 'after the escalation policy was exhausted'}.
          </span>
          <span className="grow" />
          {!page.incidentId && (
            <button type="button" className="btn oc-next__incident" onClick={() => setModal('incident')}>
              <ShieldAlert size={14} aria-hidden="true" /> Declare Incident
            </button>
          )}
        </div>
      )}
      {modal === 'reassign' && <ReassignModal page={page} onClose={() => setModal(null)} />}
      {modal === 'incident' && <DeclareIncidentModal page={page} onClose={() => setModal(null)} />}
    </section>
  );
}

function cycleOf(page: Page): number {
  return page.events.reduce((max, event) => (event.kind === 'repeated' ? Math.max(max, event.cycle ?? 0) : max), 0);
}

function NextHint({ page, policy }: { page: Page; policy: EscalationPolicy | undefined }) {
  const { now, lk, name } = useOnCall();
  if (page.status === 'resolved') return <>This Page is resolved. Nobody else will be notified.</>;
  if (page.status === 'acknowledged') {
    return (
      <>
        Acknowledged by <strong>{name(page.acknowledgedBy)}</strong> {ago(page.acknowledgedAt ?? now, now)}. Escalation is paused until the Page is resolved or reassigned.
      </>
    );
  }
  if (page.snoozedUntil && page.snoozedUntil > now) {
    return (
      <>
        <Moon size={13} aria-hidden="true" /> Snoozed until <strong>{clock(page.snoozedUntil)} UTC</strong> ({until(page.snoozedUntil, now)}). Escalation resumes afterwards.
      </>
    );
  }
  if (page.heldUntil && page.heldUntil > now) {
    return (
      <>
        Outside support hours. Notifications are held until <strong>{dateTime(page.heldUntil)} UTC</strong>.
      </>
    );
  }
  if (!policy || page.currentStep === null || page.nextEscalationAt === null) {
    return <>Waiting for {page.responderIds.length ? page.responderIds.map((id) => name(id)).join(', ') : 'a responder'} to acknowledge.</>;
  }
  const cycle = cycleOf(page);
  const nextIndex = page.currentStep + 1;
  const when = page.nextEscalationAt > now ? until(page.nextEscalationAt, now) : 'now';
  if (nextIndex < policy.steps.length) {
    const { userIds } = stepResponders(policy.steps[nextIndex], Math.max(now, page.nextEscalationAt), page.id, cycle, lk);
    return (
      <>
        If nobody acknowledges, Datadog escalates to <strong>Step {nextIndex + 1}</strong> and notifies <strong>{userIds.length ? userIds.map((id) => name(id)).join(', ') : 'nobody (no one on call)'}</strong> {when}.
      </>
    );
  }
  if (cycle < policy.repeat) {
    return (
      <>
        If nobody acknowledges, Datadog repeats the policy from <strong>Step 1</strong> {when} (repeat {cycle + 1} of {policy.repeat}).
      </>
    );
  }
  return policy.resolveAfterExhausted ? <>The policy is exhausted; Datadog resolves the Page {when} if nobody acknowledges.</> : <>The policy is exhausted; the Page stays triggered until someone acknowledges it.</>;
}

type StepState = 'acknowledged' | 'notified' | 'current' | 'skipped' | 'upcoming' | 'not_reached';

const STEP_LABEL: Record<StepState, string> = {
  acknowledged: 'Acknowledged',
  notified: 'Notified',
  current: 'Waiting for acknowledgment',
  skipped: 'Skipped',
  upcoming: 'Upcoming',
  not_reached: 'Not reached',
};

function EscalationProgress({ page, policy }: { page: Page; policy: EscalationPolicy }) {
  const { lk, now, name } = useOnCall();
  const cycle = cycleOf(page);
  const ackStep = page.events.find((event) => event.kind === 'acknowledged' && event.stepIndex !== undefined)?.stepIndex;
  return (
    <section className="oc-block">
      <h3 className="oc-block__title">
        Escalation policy <a href={`#${paths.oncallPolicy(policy.id)}`}>{policy.name}</a>
        {cycle > 0 && <span className="oc-tag">Repeat {cycle}</span>}
      </h3>
      <ol className="oc-progress">
        {policy.steps.map((step, index) => {
          const notified = page.events.filter((event) => event.kind === 'notified' && event.stepIndex === index);
          const skipped = page.events.some((event) => event.kind === 'skipped' && event.stepIndex === index);
          let state: StepState = 'not_reached';
          if (page.status === 'acknowledged' || page.status === 'resolved') {
            if (ackStep === index && page.acknowledgedAt !== null) state = 'acknowledged';
            else if (notified.length) state = 'notified';
            else if (skipped) state = 'skipped';
          } else if (page.currentStep === index) state = 'current';
          else if (notified.length) state = 'notified';
          else if (skipped) state = 'skipped';
          else if (page.currentStep !== null && index > page.currentStep) state = 'upcoming';
          const ids = notified.length ? [...new Set(notified.flatMap((event) => event.userIds ?? []))] : stepResponders(step, Math.max(now, page.nextEscalationAt ?? now), page.id, cycle, lk).userIds;
          const at = notified[0]?.at;
          return (
            <li key={step.id} className={`oc-progress__step oc-progress__step--${state}`}>
              <span className="oc-progress__num" aria-hidden="true">
                {state === 'acknowledged' || state === 'notified' ? <Check size={12} /> : index + 1}
              </span>
              <div className="grow">
                <div className="oc-progress__line">
                  <strong>Step {index + 1}</strong>
                  <span className={`oc-progress__state oc-progress__state--${state}`}>{STEP_LABEL[state]}</span>
                  {at !== undefined && <span className="muted">{clock(at)} UTC</span>}
                </div>
                <div className="oc-progress__who">
                  {ids.length ? (
                    ids.map((userId) => <PersonPill key={userId} userId={userId} />)
                  ) : (
                    <em className="muted">Nobody on call</em>
                  )}
                  <span className="muted">· escalate after {step.escalateAfterMinutes} min</span>
                </div>
                {state === 'current' && page.nextEscalationAt !== null && (
                  <div className="oc-progress__due">
                    {page.nextEscalationAt > now ? `Escalates ${until(page.nextEscalationAt, now)} (${clock(page.nextEscalationAt)} UTC)` : `Escalation due since ${clock(page.nextEscalationAt)} UTC`}
                  </div>
                )}
                {state === 'acknowledged' && <div className="oc-progress__due">by {name(page.acknowledgedBy)} after {duration((page.acknowledgedAt ?? now) - page.triggeredAt)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Timeline({ page }: { page: Page }) {
  const ctx = useOnCall();
  const [text, setText] = useState('');
  const events = [...page.events].reverse();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    ctx.act({ kind: 'comment', pageId: page.id, text: value });
    setText('');
  };

  return (
    <section className="oc-block">
      <h3 className="oc-block__title">Timeline</h3>
      <form className="oc-comment" onSubmit={submit}>
        <label className="sr-only" htmlFor={`oc-comment-${page.id}`}>
          Add a comment
        </label>
        <input id={`oc-comment-${page.id}`} className="input" placeholder="Add a comment…" value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="btn" disabled={!text.trim()}>
          Comment
        </button>
      </form>
      <ol className="oc-tl">
        {events.map((event, index) => {
          const view = describeEvent(event, page, ctx);
          const Icon = view.icon;
          return (
            <li key={`${event.at}-${event.kind}-${index}`} className="oc-tl__item">
              <time className="oc-tl__time" dateTime={new Date(event.at).toISOString()}>
                <span>{new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(event.at)}</span>
                <span className="muted">{clock(event.at)}</span>
              </time>
              <span className={`oc-tl__icon oc-tl__icon--${view.tone}`} aria-hidden="true">
                <Icon size={12} />
              </span>
              <div className="oc-tl__body">
                <div>{view.body}</div>
                {view.detail && <div className="oc-tl__detail">{view.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
