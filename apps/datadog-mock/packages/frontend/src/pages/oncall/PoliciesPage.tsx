import { ArrowDown, CalendarDays, CheckCircle2, Pencil, Repeat, User as UserIcon, Users } from 'lucide-react';
import { onCallAt, type EscalationPolicy, type TargetRef } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { navigate, paths } from '../../lib/router';
import { useInert } from '../../lib/toast';
import { EmptyState } from '../../components/ui';
import { AvatarStack, PersonPill, Section, TeamPill } from '../../components/oncall/kit';
import { PagesTable } from './shared';

function usedBy(policyId: string, teams: ReturnType<typeof useOnCall>['model']['teams']) {
  return teams.filter((team) => team.escalationPolicyId === policyId || team.routingRules.some((rule) => rule.actions.some((action) => action.kind === 'escalation' && action.policyId === policyId)));
}

function Target({ target }: { target: TargetRef }) {
  const { lk, now, team } = useOnCall();
  if (target.kind === 'schedule') {
    const schedule = lk.schedules.get(target.id);
    const userId = schedule ? onCallAt(schedule, now) : null;
    return (
      <li className="oc-target">
        <span className="oc-target__icon oc-target__icon--schedule" aria-hidden="true">
          <CalendarDays size={14} />
        </span>
        <div className="oc-target__body">
          <a href={`#${paths.oncallSchedule(target.id)}`}>{schedule?.name ?? target.id}</a>
          <div className="oc-target__oncall">
            <span className="muted">Currently on call:</span> <PersonPill userId={userId} />
            {!userId && <span className="oc-tag oc-tag--muted">Skipped</span>}
          </div>
        </div>
      </li>
    );
  }
  if (target.kind === 'team') {
    const owner = team(target.id);
    return (
      <li className="oc-target">
        <span className="oc-target__icon oc-target__icon--team" aria-hidden="true">
          <Users size={14} />
        </span>
        <div className="oc-target__body">
          <TeamPill team={owner} />
          <div className="oc-target__oncall muted">All {owner?.memberIds.length ?? 0} members</div>
        </div>
      </li>
    );
  }
  return (
    <li className="oc-target">
      <span className="oc-target__icon oc-target__icon--user" aria-hidden="true">
        <UserIcon size={14} />
      </span>
      <div className="oc-target__body">
        <PersonPill userId={target.id} />
      </div>
    </li>
  );
}

/** Datadog's escalation policy builder, read only. */
export function PolicyFlow({ policy }: { policy: EscalationPolicy }) {
  return (
    <div className="oc-flow">
      <div className="oc-flow__card oc-flow__trigger">
        <span className="oc-flow__bang" aria-hidden="true">
          !
        </span>
        Page is triggered
      </div>
      {policy.steps.map((step, index) => (
        <div key={step.id} className="oc-flow__group">
          <ArrowDown size={16} className="oc-flow__arrow" aria-hidden="true" />
          <section className="oc-flow__card oc-flow__step" aria-label={`Step ${index + 1}`}>
            <header className="oc-flow__stephead">
              <span className="oc-flow__num">{index + 1}</span>
              <strong>Notify</strong>
              <span className="muted">{step.assignment === 'round-robin' ? 'one responder (round robin)' : 'all targets'}</span>
            </header>
            <ul className="oc-targets">
              {step.targets.map((target) => (
                <Target key={`${target.kind}-${target.id}`} target={target} />
              ))}
            </ul>
            <footer className="oc-flow__foot">
              <strong>
                {step.escalateAfterMinutes} minute{step.escalateAfterMinutes === 1 ? '' : 's'}
              </strong>{' '}
              later if no one acknowledges, {index < policy.steps.length - 1 ? 'escalate' : policy.repeat ? 'repeat from Step 1' : 'stop'}
            </footer>
          </section>
        </div>
      ))}
      {policy.repeat > 0 && (
        <>
          <ArrowDown size={16} className="oc-flow__arrow" aria-hidden="true" />
          <div className="oc-flow__card oc-flow__repeat">
            <Repeat size={14} aria-hidden="true" /> Repeat up to <strong>{policy.repeat}</strong> time{policy.repeat === 1 ? '' : 's'} if no one acknowledges
          </div>
        </>
      )}
      {policy.resolveAfterExhausted && (
        <>
          <ArrowDown size={16} className="oc-flow__arrow" aria-hidden="true" />
          <div className="oc-flow__card oc-flow__resolve">
            <CheckCircle2 size={14} aria-hidden="true" /> Automatically update Page status to <strong>RESOLVED</strong> after the policy is exhausted
          </div>
        </>
      )}
    </div>
  );
}

export function PoliciesPage() {
  const { model, team, lk, now } = useOnCall();
  return (
    <div className="oc-body">
      <header className="oc-head">
        <div>
          <h1 className="oc-head__title">Escalation Policies</h1>
          <p className="oc-head__sub muted">Who gets notified, in which order, and how long Datadog waits before escalating.</p>
        </div>
      </header>
      <div className="card oc-listcard scroll-x">
        <table className="table oc-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Owned by</th>
              <th>Steps</th>
              <th>First responders now</th>
              <th>Repeat</th>
              <th>Resolve when exhausted</th>
              <th className="num">Pages (7d)</th>
            </tr>
          </thead>
          <tbody>
            {model.policies.map((policy) => {
              const first = policy.steps[0];
              const responders = [
                ...new Set(
                  first.targets.flatMap((target) => {
                    if (target.kind === 'user') return [target.id];
                    if (target.kind === 'team') return team(target.id)?.memberIds ?? [];
                    const schedule = lk.schedules.get(target.id);
                    const userId = schedule ? onCallAt(schedule, now) : null;
                    return userId ? [userId] : [];
                  }),
                ),
              ];
              return (
                <tr key={policy.id} className="row-link" onClick={() => navigate(paths.oncallPolicy(policy.id))}>
                  <td>
                    <a href={`#${paths.oncallPolicy(policy.id)}`} onClick={(event) => event.stopPropagation()}>
                      <b>{policy.name}</b>
                    </a>
                  </td>
                  <td>
                    <TeamPill team={team(policy.teamId)} link={false} />
                  </td>
                  <td>{policy.steps.length}</td>
                  <td>
                    <AvatarStack ids={responders} />
                  </td>
                  <td>{policy.repeat ? `${policy.repeat}×` : 'No'}</td>
                  <td>{policy.resolveAfterExhausted ? 'Yes' : 'No'}</td>
                  <td className="num">{model.pages.filter((page) => page.policyId === policy.id).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PolicyPage({ id }: { id: string }) {
  const { lk, model, team } = useOnCall();
  const inert = useInert();
  const policy = lk.policies.get(id);
  if (!policy) {
    return (
      <EmptyState title="Escalation policy not found" action={<a className="btn" href={`#${paths.oncallPolicies()}`}>All escalation policies</a>}>
        No escalation policy with ID “{id}”.
      </EmptyState>
    );
  }
  const pages = model.pages.filter((page) => page.policyId === policy.id);
  return (
    <div className="oc-body">
      <nav className="oc-crumbs" aria-label="Breadcrumb">
        <a href={`#${paths.oncallPolicies()}`}>Escalation Policies</a> / <span>{policy.name}</span>
      </nav>
      <header className="oc-head oc-head--split">
        <div>
          <h1 className="oc-head__title">{policy.name}</h1>
          <div className="oc-owners">
            <span className="oc-owners__label">Owned by</span>
            <TeamPill team={team(policy.teamId)} />
            <span className="oc-owners__label">Used by</span>
            {usedBy(policy.id, model.teams).map((item) => (
              <TeamPill key={item.id} team={item} />
            ))}
          </div>
        </div>
        <button type="button" className="btn" onClick={inert}>
          <Pencil size={14} aria-hidden="true" /> Edit
        </button>
      </header>
      <div className="oc-policy">
        <PolicyFlow policy={policy} />
        <Section title={`Recent Pages (${pages.length})`} className="oc-policy__pages">
          <PagesTable pages={pages.slice(0, 15)} status="all" empty="No Pages used this policy in the last 7 days." compact narrow />
        </Section>
      </div>
    </div>
  );
}
