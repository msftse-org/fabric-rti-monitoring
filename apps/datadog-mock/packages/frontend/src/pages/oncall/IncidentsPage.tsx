import { useState } from 'react';
import { Check, Flame, UserRound } from 'lucide-react';
import { dateTime, type PageStatus } from '@oncall';
import { incidentStore, useDatadogIncidents } from '../../lib/incidentStore';
import { paths } from '../../lib/router';
import { useToast } from '../../lib/toast';
import { useOnCall } from '../../lib/oncall';
import { StatusPill } from '../../components/oncall/kit';

function IncidentStatusPill({ status }: { status: PageStatus }) {
  return <StatusPill status={status} />;
}

export function IncidentsPage() {
  const incidents = useDatadogIncidents();
  const { model, me, name, now } = useOnCall();
  const notify = useToast();
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const active = incidents.filter((incident) => incident.status !== 'resolved').length;
  const acknowledged = incidents.filter((incident) => incident.status === 'acknowledged').length;
  const resolved = incidents.length - active;

  return (
    <main className="oc-body oc-incidents">
      <header className="oc-head oc-head--split">
        <div>
          <h1 className="oc-head__title">Incidents</h1>
          <p className="oc-head__sub">Manually declared from an On-Call Page. Incident response is a separate workflow from page escalation.</p>
        </div>
        <div className="oc-head__actions">
          <span className="oc-incidents__local"><Flame size={14} aria-hidden /> Simulated in this browser</span>
        </div>
      </header>

      <div className="oc-incidents__summary" aria-label="Incident counts">
        <div><strong>{active}</strong><span>Open</span></div>
        <div><strong>{acknowledged}</strong><span>Acknowledged</span></div>
        <div><strong>{resolved}</strong><span>Resolved</span></div>
        <div><strong>{incidents.length}</strong><span>Total incidents</span></div>
      </div>

      {incidents.length === 0 ? (
        <section className="oc-card oc-incidents__empty">
          <h2>No incidents declared</h2>
          <p>Declare an incident from a Page to start a separate response record with its own assignment, status, and history.</p>
          <a className="btn" href={`#${paths.oncallPages()}`}>Open Pages</a>
        </section>
      ) : (
        <section className="oc-card oc-incidents__list" aria-label="Declared incidents">
          {incidents.map((incident) => {
            const resolvedIncident = incident.status === 'resolved';
            const assignee = assignees[incident.id] ?? incident.assignedTo;
            const canAssign = !resolvedIncident && assignee !== incident.assignedTo;
            return (
              <article className="oc-incidents__item" key={incident.id}>
                <header className="oc-incidents__item-head">
                  <div className="oc-incidents__title">
                    <Flame size={16} aria-hidden />
                    <div>
                      <h2>{incident.title}</h2>
                      <p><span className={`oc-incidents__severity oc-incidents__severity--${incident.severity.toLowerCase().replace('-', '')}`}>{incident.severity}</span> · Incident {incident.id}</p>
                    </div>
                  </div>
                  <IncidentStatusPill status={incident.status} />
                </header>

                <p className="oc-incidents__summary-text">{incident.summary || <em className="muted">No summary provided.</em>}</p>

                <dl className="oc-incidents__meta">
                  <div><dt>Source Page</dt><dd><a href={`#${paths.oncallPage(incident.pageId, 'all')}`}>Page #{incident.pageId}</a></dd></div>
                  <div><dt>Commander</dt><dd>{name(incident.commanderId)}</dd></div>
                  <div><dt>Assigned to</dt><dd>{name(incident.assignedTo)}</dd></div>
                  <div><dt>Declared</dt><dd title={`${dateTime(incident.createdAt, 'UTC')} UTC`}>{dateTime(incident.createdAt, 'UTC')} UTC</dd></div>
                  {incident.resolvedAt !== null && <div><dt>Resolved</dt><dd>{dateTime(incident.resolvedAt, 'UTC')} UTC</dd></div>}
                </dl>

                {!resolvedIncident && (
                  <div className="oc-incidents__actions">
                    {incident.status === 'triggered' && (
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => {
                          incidentStore.update(incident.id, { kind: 'acknowledge', by: me.id, at: now });
                          notify(`${incident.id} acknowledged`);
                        }}
                      >
                        <Check size={14} aria-hidden /> Acknowledge
                      </button>
                    )}
                    <label className="oc-incidents__assign">
                      <span className="sr-only">Assign {incident.id} to</span>
                      <UserRound size={14} aria-hidden />
                      <select
                        aria-label={`Assign ${incident.id} to`}
                        value={assignee}
                        onChange={(event) => setAssignees((current) => ({ ...current, [incident.id]: event.target.value }))}
                      >
                        {model.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn"
                      disabled={!canAssign}
                      onClick={() => {
                        incidentStore.update(incident.id, { kind: 'assign', to: assignee, by: me.id, at: now });
                        notify(`${incident.id} assigned to ${name(assignee)}`);
                      }}
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        incidentStore.update(incident.id, { kind: 'resolve', by: me.id, at: now });
                        notify(`${incident.id} resolved`);
                      }}
                    >
                      <Check size={14} aria-hidden /> Resolve
                    </button>
                  </div>
                )}

                <details className="oc-incidents__history">
                  <summary>History · {incident.events.length} {incident.events.length === 1 ? 'event' : 'events'}</summary>
                  <ol>
                    {incident.events.map((event, index) => (
                      <li key={`${event.kind}-${event.at}-${index}`}>
                        <time dateTime={new Date(event.at).toISOString()}>{dateTime(event.at, 'UTC')} UTC</time>
                        <span>
                          {event.kind === 'declared' ? `${name(event.by)} declared this incident from Page #${incident.pageId}` :
                            event.kind === 'acknowledged' ? `${name(event.by)} acknowledged the incident` :
                              event.kind === 'assigned' ? `${name(event.by)} ${event.detail ?? 'updated assignment'}` :
                                `${name(event.by)} resolved the incident`}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
