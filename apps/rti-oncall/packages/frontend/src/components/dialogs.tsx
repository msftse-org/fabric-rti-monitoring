import { useState } from 'react';
import { dateTime, MINUTE, type Page, type Urgency } from '@oncall';
import { useOnCall } from '../lib/oncall';
import { flowName } from '../lib/fabric';
import { navigate, paths } from '../lib/router';
import { useToast } from '../lib/toast';
import { ArtifactCallout, Button, Dialog, Field, Segmented } from './ui';

export function NewPageDialog({ onClose, teamId }: { onClose: () => void; teamId?: string }) {
  const { model, createPage, lk } = useOnCall();
  const notify = useToast();
  const [team, setTeam] = useState(teamId ?? model.teams[0].id);
  const [urgency, setUrgency] = useState<Urgency>('high');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const submit = () => {
    if (!title.trim()) {
      setError('Add a title so responders know what is wrong.');
      return;
    }
    const id = createPage({ teamId: team, title: title.trim(), description: description.trim(), urgency });
    notify(`Page #${id} created`, `The "${flowName(lk.teams.get(team))}" flow is notifying the first escalation step.`);
    onClose();
    navigate(paths.page(id));
  };
  return (
    <Dialog
      title="New page"
      onClose={onClose}
      onSubmit={submit}
      description="Page a team by hand. The page is written to OnCallPages and starts the team's escalation flow, the same as an Activator alert."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Page team
          </Button>
        </>
      }
    >
      <Field label="Team" htmlFor="np-team">
        <select id="np-team" className="select" value={team} onChange={(event) => setTeam(event.target.value)}>
          {model.teams.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (@{item.handle})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Urgency" hint={urgency === 'high' ? 'Teams card, SMS and voice through Power Automate.' : 'Outlook email first, then a Teams notification.'}>
        <Segmented
          label="Urgency"
          value={urgency}
          onChange={setUrgency}
          options={[
            { value: 'high', label: 'High' },
            { value: 'low', label: 'Low' },
          ]}
        />
      </Field>
      <Field label="Title" htmlFor="np-title">
        <input
          id="np-title"
          className="input"
          value={title}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'np-error' : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setError('');
          }}
          placeholder="What needs attention?"
        />
      </Field>
      {error && (
        <p className="field__error" id="np-error" role="alert">
          {error}
        </p>
      )}
      <Field label="Description" htmlFor="np-desc">
        <textarea id="np-desc" className="textarea" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context for the responder" />
      </Field>
    </Dialog>
  );
}

export function ReassignDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const { model, act, lk } = useOnCall();
  const notify = useToast();
  const [kind, setKind] = useState<'team' | 'user'>('team');
  const otherTeams = model.teams.filter((team) => team.id !== page.teamId);
  const [teamId, setTeamId] = useState(otherTeams[0]?.id ?? page.teamId);
  const [userId, setUserId] = useState(model.users.find((user) => !page.responderIds.includes(user.id))?.id ?? model.users[0].id);
  const [comment, setComment] = useState('');
  const submit = () => {
    act(kind === 'team' ? { kind: 'reassign', pageId: page.id, toTeamId: teamId, comment: comment.trim() || undefined } : { kind: 'reassign', pageId: page.id, toUserId: userId, comment: comment.trim() || undefined });
    notify(`Page #${page.id} reassigned`, `Now with ${kind === 'team' ? lk.teams.get(teamId)?.name : lk.users.get(userId)?.name}. The page is triggered again for the new owner.`);
    onClose();
  };
  return (
    <Dialog
      title={`Reassign #${page.id}`}
      onClose={onClose}
      onSubmit={submit}
      description="Appends a reassigned event to OnCallPageEvents. The paging flow picks it up and notifies the new owner."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Reassign
          </Button>
        </>
      }
    >
      <Field label="Reassign to">
        <Segmented
          label="Reassign to"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'team', label: 'Another team' },
            { value: 'user', label: 'A person' },
          ]}
        />
      </Field>
      {kind === 'team' ? (
        <Field label="Team" htmlFor="ra-team" hint="The first step of that team's escalation flow is notified.">
          <select id="ra-team" className="select" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            {otherTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Person" htmlFor="ra-user">
          <select id="ra-user" className="select" value={userId} onChange={(event) => setUserId(event.target.value)}>
            {model.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Comment (optional)" htmlFor="ra-comment">
        <textarea id="ra-comment" className="textarea" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Why are you handing this over?" />
      </Field>
    </Dialog>
  );
}

const SNOOZE = [15, 30, 60, 120];

export function SnoozeDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const { act, clock } = useOnCall();
  const notify = useToast();
  const [minutes, setMinutes] = useState('30');
  const until = clock() + Number(minutes) * MINUTE;
  const submit = () => {
    act({ kind: 'snooze', pageId: page.id, until });
    notify(`Page #${page.id} snoozed`, `The flow holds its next escalation step until ${dateTime(until)} UTC.`);
    onClose();
  };
  return (
    <Dialog
      title={`Snooze #${page.id}`}
      onClose={onClose}
      onSubmit={submit}
      description="Pauses the escalation. The flow checks OnCallPageEvents before each step and waits until the snooze ends."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Snooze
          </Button>
        </>
      }
    >
      <Field label="Snooze for" htmlFor="sn-minutes" hint={`Until ${dateTime(until)} UTC`}>
        <select id="sn-minutes" className="select" value={minutes} onChange={(event) => setMinutes(event.target.value)} autoFocus>
          {SNOOZE.map((value) => (
            <option key={value} value={value}>
              {value < 60 ? `${value} minutes` : `${value / 60} hour${value === 60 ? '' : 's'}`}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}

export function IncidentDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const { act } = useOnCall();
  const notify = useToast();
  const [title, setTitle] = useState(page.title);
  const incidentId = `INC-${page.id % 100_000}`;
  const submit = () => {
    act({ kind: 'incident', pageId: page.id, incidentId, title: title.trim() || page.title });
    notify(`${incidentId} handed off`, 'A Power Automate flow would open the ServiceNow or Azure DevOps item.', 'info');
    onClose();
  };
  return (
    <Dialog
      title="Declare incident"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Hand off {incidentId}
          </Button>
        </>
      }
    >
      <ArtifactCallout capabilityId="incident">
        Fabric has no incident management. This records the hand-off on the page; in production a Power Automate flow opens the item in your ITSM tool and links it back.
      </ArtifactCallout>
      <Field label="Incident title" htmlFor="inc-title">
        <input id="inc-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}

export function CommentDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const { act } = useOnCall();
  const notify = useToast();
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    act({ kind: 'comment', pageId: page.id, text: text.trim() });
    notify('Comment added', `Appended to the timeline of #${page.id}.`);
    onClose();
  };
  return (
    <Dialog
      title={`Comment on #${page.id}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!text.trim()}>
            Add comment
          </Button>
        </>
      }
    >
      <Field label="Comment" htmlFor="cm-text" hint="Stored as a commented event in OnCallPageEvents.">
        <textarea id="cm-text" className="textarea" rows={4} value={text} onChange={(event) => setText(event.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}
