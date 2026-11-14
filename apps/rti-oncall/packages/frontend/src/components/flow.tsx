import { Fragment, type ReactNode } from 'react';
import { ArrowDown, CalendarClock, CircleCheck, Hourglass, Repeat, Split, User as UserIcon, Users, Workflow, Zap, type LucideIcon } from 'lucide-react';
import { stepResponders, type EscalationPolicy, type EscalationStep, type Lookup, type TargetRef } from '@oncall';
import { href, paths } from '../lib/router';
import { AvatarStack } from './ui';

function targetLabel(target: TargetRef, lk: Lookup): { icon: LucideIcon; label: string; to?: string } {
  if (target.kind === 'user') return { icon: UserIcon, label: lk.users.get(target.id)?.name ?? target.id };
  if (target.kind === 'team') return { icon: Users, label: `All of ${lk.teams.get(target.id)?.name ?? target.id}`, to: paths.team(target.id) };
  return { icon: CalendarClock, label: `On call in ${lk.schedules.get(target.id)?.name ?? target.id}`, to: paths.schedule(target.id) };
}

function FlowCard({ icon: Icon, kind, title, children, active }: { icon: LucideIcon; kind: 'trigger' | 'action' | 'wait' | 'condition' | 'loop' | 'end'; title: string; children?: ReactNode; active?: boolean }) {
  return (
    <div className={`fcard fcard--${kind} ${active ? 'fcard--active' : ''}`}>
      <div className="fcard__head">
        <span className="fcard__icon" aria-hidden>
          <Icon size={14} />
        </span>
        <strong>{title}</strong>
        {active && <span className="fcard__live">Current step</span>}
      </div>
      {children && <div className="fcard__body">{children}</div>}
    </div>
  );
}

const Connector = () => (
  <div className="fconn" aria-hidden>
    <ArrowDown size={14} />
  </div>
);

function StepTargets({ step, now, lk, pageId }: { step: EscalationStep; now: number; lk: Lookup; pageId: number }) {
  const { userIds, skipped } = stepResponders(step, now, pageId, 0, lk);
  return (
    <>
      <ul className="fcard__targets">
        {step.targets.map((target) => {
          const item = targetLabel(target, lk);
          const Icon = item.icon;
          return (
            <li key={`${target.kind}-${target.id}`}>
              <Icon size={13} aria-hidden />
              {item.to ? <a href={href(item.to)}>{item.label}</a> : item.label}
            </li>
          );
        })}
      </ul>
      <div className="fcard__resolved">
        <span>Resolves now to</span>
        {userIds.length ? (
          <>
            <AvatarStack users={userIds.map((id) => lk.users.get(id))} size={20} max={6} />
            <span className="fcard__names">{userIds.map((id) => lk.users.get(id)?.name.split(' ')[0] ?? id).join(', ')}</span>
          </>
        ) : (
          <span className="fcard__none">Nobody on call (step skipped)</span>
        )}
        {skipped.length > 0 && userIds.length > 0 && <span className="fcard__none">{skipped.length} schedule empty</span>}
      </div>
    </>
  );
}

/** An escalation policy drawn as the Power Automate flow that runs it. */
export function EscalationFlow({ policy, lk, now, currentStep, pageId = 0 }: { policy: EscalationPolicy; lk: Lookup; now: number; currentStep?: number | null; pageId?: number }) {
  const team = lk.teams.get(policy.teamId);
  return (
    <div className="flow" aria-label={`Power Automate flow for ${policy.name}`}>
      <FlowCard icon={Zap} kind="trigger" title="When an Activator alert fires">
        Custom action from the {team?.name ?? policy.teamId} Activator rules or a manual page in this app. Inputs: PageId, TeamId, Service, Urgency, Value.
      </FlowCard>
      <Connector />
      <div className="floop">
        <div className="floop__head">
          <Repeat size={14} aria-hidden />
          <strong>Do until</strong>
          <span>
            acknowledged, or {policy.repeat + 1} pass{policy.repeat ? 'es' : ''} through every step
          </span>
        </div>
        <div className="floop__body">
          {policy.steps.map((step, index) => (
            <Fragment key={step.id}>
              <FlowCard icon={Workflow} kind="action" title={`Step ${index + 1}: Notify ${step.assignment === 'round-robin' ? 'one target (round robin)' : 'all targets'}`} active={currentStep === index}>
                <StepTargets step={step} now={now} lk={lk} pageId={pageId} />
                <p className="fcard__note">Teams "Post adaptive card and wait for a response"; Outlook, SMS and voice by each responder's urgency preferences.</p>
              </FlowCard>
              <Connector />
              <FlowCard icon={Hourglass} kind="wait" title={`Wait ${step.escalateAfterMinutes} min for acknowledgement`}>
                Adaptive card timeout <code>PT{step.escalateAfterMinutes}M</code>
              </FlowCard>
              <Connector />
              <div className="fcond">
                <FlowCard icon={Split} kind="condition" title="Acknowledged?" />
                <div className="fcond__branches">
                  <div className="fcond__branch fcond__branch--yes">
                    <span className="fcond__tag">If yes</span>
                    Append <code>acknowledged</code> to OnCallPageEvents and stop escalating.
                  </div>
                  <div className="fcond__branch fcond__branch--no">
                    <span className="fcond__tag">If no</span>
                    {index < policy.steps.length - 1 ? `Continue to step ${index + 2}.` : policy.repeat ? 'Start the next pass from step 1.' : 'Leave the loop.'}
                  </div>
                </div>
              </div>
              {index < policy.steps.length - 1 && <Connector />}
            </Fragment>
          ))}
        </div>
      </div>
      <Connector />
      <FlowCard icon={CircleCheck} kind="end" title={policy.resolveAfterExhausted ? 'Resolve the page when every pass times out' : 'Leave the page triggered when every pass times out'}>
        {policy.resolveAfterExhausted ? 'Appends a resolved event with reason policy.' : 'The page stays open for someone to pick up from this app.'}
      </FlowCard>
    </div>
  );
}

export function targetSummary(step: EscalationStep, lk: Lookup): string {
  return step.targets.map((target) => targetLabel(target, lk).label).join(', ');
}
