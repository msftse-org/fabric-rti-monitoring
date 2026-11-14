import { useState } from 'react';
import { CalendarClock, CircleAlert, Plus, Users, Workflow } from 'lucide-react';
import { stepResponders } from '@oncall';
import { NewPageDialog } from '../components/dialogs';
import { EscalationFlow, targetSummary } from '../components/flow';
import { PageTable, PagingFlowSteps } from '../components/oncall';
import { AvatarStack, Card, CapabilityList, Command, CommandBar, CounterpartLink, Crumbs, Disclosure, EmptyState, ViewHeader } from '../components/ui';
import { flowName } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, paths } from '../lib/router';

export function EscalationsList() {
  const { model, lk, now } = useOnCall();
  return (
    <>
      <ViewHeader eyebrow="Power Automate flows" title="Escalations" actions={<CounterpartLink path="/escalations" />}>
        Each escalation policy runs as a Power Automate flow started by an Activator custom action.
      </ViewHeader>
      <CommandBar label="Escalation commands">
        <Command icon={Workflow} label={`Open ${model.policies[0].name}`} primary href={href(paths.escalation(model.policies[0].id))} />
      </CommandBar>
      <Card flush>
        <div className="table-wrap">
          <table className="table table--cards">
            <caption className="sr-only">Escalation flows</caption>
            <thead>
              <tr>
                <th scope="col">Flow</th>
                <th scope="col">Team</th>
                <th scope="col">Steps</th>
                <th scope="col">Step 1 resolves now to</th>
                <th scope="col" className="num">
                  Pages, 7 days
                </th>
              </tr>
            </thead>
            <tbody>
              {model.policies.map((policy) => {
                const team = lk.teams.get(policy.teamId);
                const first = stepResponders(policy.steps[0], now, 0, 0, lk).userIds;
                const used = model.pages.filter((page) => page.policyId === policy.id && page.triggeredAt >= now - 7 * 86_400_000).length;
                return (
                  <tr key={policy.id}>
                    <td data-label="Flow">
                      <a href={href(paths.escalation(policy.id))} className="strong-link">
                        {policy.name}
                      </a>
                      <span className="cell-sub">Flow "{flowName(team)}"</span>
                    </td>
                    <td data-label="Team">
                      <a href={href(paths.team(policy.teamId))} className="team-chip">
                        <span className="team-chip__dot" style={{ background: team?.color }} aria-hidden />
                        {team?.name}
                      </a>
                    </td>
                    <td data-label="Steps">
                      <ol className="mini-steps mini-steps--inline">
                        {policy.steps.map((step, index) => (
                          <li key={step.id}>
                            <span className="mini-steps__n">{index + 1}</span>
                            <span>
                              {targetSummary(step, lk)} <span className="muted">· {step.escalateAfterMinutes} min</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                      <span className="cell-sub">
                        Repeat {policy.repeat}×, then {policy.resolveAfterExhausted ? 'resolve' : 'stay open'}
                      </span>
                    </td>
                    <td data-label="Step 1 now">
                      <AvatarStack users={first.map((userId) => lk.users.get(userId))} size={24} />
                    </td>
                    <td data-label="Pages, 7 days" className="num">
                      {used}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="How escalation works in Fabric" icon={Workflow}>
        <CapabilityList ids={['escalation', 'assignment', 'repeat', 'ack-timeout']} />
      </Card>
    </>
  );
}

export function EscalationDetail({ id }: { id: string }) {
  const { model, lk, now } = useOnCall();
  const [creating, setCreating] = useState(false);
  const policy = lk.policies.get(id);
  if (!policy) {
    return (
      <>
        <Crumbs items={[{ label: 'Escalations', to: paths.escalations() }, { label: id }]} />
        <EmptyState icon={Workflow} title={`Escalation flow ${id} does not exist`}>
          <a href={href(paths.escalations())}>Back to escalations</a>
        </EmptyState>
      </>
    );
  }
  const team = lk.teams.get(policy.teamId);
  const pages = model.pages.filter((page) => page.policyId === policy.id);
  const live = pages.find((page) => page.status === 'triggered' && page.currentStep !== null);

  return (
    <>
      <Crumbs items={[{ label: 'Escalations', to: paths.escalations() }, { label: policy.name }]} />
      <ViewHeader eyebrow={`Power Automate flow · "${flowName(team)}"`} title={policy.name} actions={<CounterpartLink path={paths.escalation(policy.id)} />}>
        {policy.steps.length} steps, repeats {policy.repeat} time{policy.repeat === 1 ? '' : 's'}, {policy.resolveAfterExhausted ? 'resolves the page when exhausted' : 'leaves the page open when exhausted'}.
      </ViewHeader>
      <CommandBar label="Escalation commands">
        <Command icon={Plus} label={`Page ${team?.name ?? 'team'}`} primary onClick={() => setCreating(true)} />
        <Command icon={Users} label="Team" href={href(paths.team(policy.teamId))} />
        <Command icon={CalendarClock} label="Schedules" href={href(paths.schedules())} />
      </CommandBar>

      <div className="grid grid--main">
        <Card title="Flow" icon={Workflow} subtitle={live ? `Highlighting the live run for page #${live.id}` : 'Targets resolved at the current time'}>
          <EscalationFlow policy={policy} lk={lk} now={now} currentStep={live?.currentStep} pageId={live?.id ?? 0} />
        </Card>
        <div className="stack">
          <Card title="Recent alerts that used it" icon={CircleAlert} flush actions={<a href={href(paths.pages(team?.name ?? ''))}>All</a>}>
            <ul className="mini-pages">
              {pages.slice(0, 8).map((page) => (
                <li key={page.id}>
                  <a href={href(paths.page(page.id))}>
                    <span className={`dot dot--${page.status}`} aria-hidden />
                    <span className="mini-pages__id">#{page.id}</span>
                    <span className="mini-pages__title">{page.title}</span>
                    <span className="sr-only">, {page.status}</span>
                  </a>
                </li>
              ))}
              {!pages.length && <li className="muted">No pages yet</li>}
            </ul>
          </Card>
          <Card title="How this is built" icon={Workflow}>
            <CapabilityList ids={['escalation', 'assignment', 'repeat', 'ack-timeout']} />
            <Disclosure summary="The paging flow, step by step" icon={Workflow}>
              <PagingFlowSteps />
            </Disclosure>
          </Card>
        </div>
      </div>
      {live && (
        <Card title="Live run" icon={CircleAlert} flush>
          <PageTable pages={[live]} caption="Live run" />
        </Card>
      )}
      {creating && <NewPageDialog teamId={policy.teamId} onClose={() => setCreating(false)} />}
    </>
  );
}
