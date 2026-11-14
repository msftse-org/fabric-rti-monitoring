import { useState, type FormEvent } from 'react';
import { ChevronDown, Flame } from 'lucide-react';
import { onCallAt, type Page, type Urgency } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { useToast } from '../../lib/toast';
import { Dropdown, Select } from '../Select';
import { Segmented } from '../ui';
import { MINUTE } from '../../lib/time';
import { Modal, PersonPill } from './kit';

function TeamOnCall({ teamId }: { teamId: string }) {
  const { team, lk, now } = useOnCall();
  const current = team(teamId);
  const schedule = current ? lk.schedules.get(current.scheduleIds[0]) : undefined;
  if (!current) return null;
  return (
    <div className="oc-field__hint">
      <span className="mono">@{current.handle}</span>
      <span aria-hidden="true">·</span>
      On call now: <PersonPill userId={schedule ? onCallAt(schedule, now) : null} />
    </div>
  );
}

export function ManualPageModal({ onClose, onCreated, teamId }: { onClose: () => void; onCreated: (id: number) => void; teamId?: string }) {
  const { model, createPage, me } = useOnCall();
  const notify = useToast();
  const [team, setTeam] = useState(teamId ?? me.teamIds[0] ?? model.teams[0].id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('high');
  const [touched, setTouched] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!title.trim()) return;
    const id = createPage({ teamId: team, title: title.trim(), description: description.trim(), urgency });
    notify(`Page #${id} created`);
    onCreated(id);
  };

  return (
    <Modal
      title="Page a Team"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="oc-manual-page" className="btn btn--primary">
            Page
          </button>
        </>
      }
    >
      <form id="oc-manual-page" className="oc-form" onSubmit={submit} noValidate>
        <p className="oc-form__lead">Send a Page to an On-Call team. It routes through the team's escalation policy and notifies whoever is on call.</p>
        <div className="oc-field">
          <span className="oc-field__label">Team</span>
          <Select label="Team" value={team} options={model.teams.map((item) => ({ value: item.id, label: item.name }))} onChange={setTeam} />
          <TeamOnCall teamId={team} />
        </div>
        <label className="oc-field">
          <span className="oc-field__label">Title</span>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What's going on?"
            aria-invalid={touched && !title.trim()}
            aria-describedby={touched && !title.trim() ? 'oc-page-title-error' : undefined}
            data-autofocus
          />
          {touched && !title.trim() && (
            <span id="oc-page-title-error" className="oc-field__error">
              A title is required.
            </span>
          )}
        </label>
        <label className="oc-field">
          <span className="oc-field__label">Description</span>
          <textarea className="input oc-textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context for the responder (Markdown supported)" />
        </label>
        <div className="oc-field">
          <span className="oc-field__label">Urgency</span>
          <Segmented
            label="Urgency"
            value={urgency}
            options={[
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
            ]}
            onChange={setUrgency}
          />
        </div>
      </form>
    </Modal>
  );
}

export function ReassignModal({ page, onClose }: { page: Page; onClose: () => void }) {
  const { model, act } = useOnCall();
  const notify = useToast();
  const [kind, setKind] = useState<'team' | 'user'>('team');
  const [teamId, setTeamId] = useState(model.teams.find((team) => team.id !== page.teamId)?.id ?? page.teamId);
  const [userId, setUserId] = useState(model.users.find((user) => user.id !== model.currentUserId)?.id ?? model.currentUserId);
  const [comment, setComment] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    act({ kind: 'reassign', pageId: page.id, ...(kind === 'team' ? { toTeamId: teamId } : { toUserId: userId }), comment: comment.trim() || undefined });
    notify(`Page #${page.id} reassigned`);
    onClose();
  };

  return (
    <Modal
      title={`Reassign Page #${page.id}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="oc-reassign" className="btn btn--primary">
            Reassign
          </button>
        </>
      }
    >
      <form id="oc-reassign" className="oc-form" onSubmit={submit}>
        <p className="oc-form__lead">Reassigning re-triggers the Page and notifies the new responder according to their escalation policy or notification preferences.</p>
        <div className="oc-field">
          <span className="oc-field__label">Type</span>
          <Segmented
            label="Reassign to"
            value={kind}
            options={[
              { value: 'team', label: 'Team' },
              { value: 'user', label: 'User' },
            ]}
            onChange={setKind}
          />
        </div>
        <div className="oc-field">
          <span className="oc-field__label">{kind === 'team' ? 'Team' : 'User'}</span>
          {kind === 'team' ? (
            <>
              <Select label="Team" value={teamId} options={model.teams.map((team) => ({ value: team.id, label: team.name }))} onChange={setTeamId} />
              <TeamOnCall teamId={teamId} />
            </>
          ) : (
            <Select label="User" value={userId} options={model.users.map((user) => ({ value: user.id, label: `${user.name} · ${user.title}` }))} onChange={setUserId} />
          )}
        </div>
        <label className="oc-field">
          <span className="oc-field__label">
            Comment <span className="muted">(optional)</span>
          </span>
          <textarea className="input oc-textarea" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Why are you reassigning this Page?" />
        </label>
      </form>
    </Modal>
  );
}

const SEVERITIES = ['Unknown', 'SEV-5', 'SEV-4', 'SEV-3', 'SEV-2', 'SEV-1'];

export function DeclareIncidentModal({ page, onClose }: { page: Page; onClose: () => void }) {
  const { model, act, team } = useOnCall();
  const notify = useToast();
  const [title, setTitle] = useState(page.title);
  const [severity, setSeverity] = useState(page.urgency === 'high' ? 'SEV-2' : 'SEV-4');
  const [commander, setCommander] = useState(model.currentUserId);
  const [summary, setSummary] = useState(page.description);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const incidentId = `IR-${page.id % 10_000}`;
    act({ kind: 'incident', pageId: page.id, incidentId, title: `${severity} ${title.trim() || page.title}` });
    notify(`Incident ${incidentId} declared`);
    onClose();
  };

  return (
    <Modal
      title={
        <span className="oc-incident__title">
          <Flame size={16} aria-hidden="true" /> Declare Incident
        </span>
      }
      className="oc-incident"
      width={600}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="oc-incident" className="btn btn--primary">
            Declare Incident
          </button>
        </>
      }
    >
      <form id="oc-incident" className="oc-form" onSubmit={submit}>
        <label className="oc-field">
          <span className="oc-field__label">Title</span>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="oc-form__row">
          <div className="oc-field">
            <span className="oc-field__label">Type</span>
            <Select label="Incident type" value="incident" options={[{ value: 'incident', label: 'Incident' }]} onChange={() => undefined} />
          </div>
          <div className="oc-field">
            <span className="oc-field__label">Incident Commander</span>
            <Select label="Incident Commander" value={commander} options={model.users.map((user) => ({ value: user.id, label: user.name }))} onChange={setCommander} />
          </div>
        </div>
        <div className="oc-field">
          <span className="oc-field__label">Severity Level</span>
          <Segmented label="Severity" value={severity} options={SEVERITIES.map((value) => ({ value, label: value }))} onChange={setSeverity} />
        </div>
        <label className="oc-field">
          <span className="oc-field__label">Summary</span>
          <textarea className="input oc-textarea" rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
        <div className="oc-field">
          <span className="oc-field__label">Teams</span>
          <span className="oc-field__static">{team(page.teamId)?.name}</span>
        </div>
      </form>
    </Modal>
  );
}

const SNOOZE_OPTIONS = [
  { minutes: 10, label: 'In 10 minutes' },
  { minutes: 30, label: 'In 30 minutes' },
  { minutes: 60, label: 'In 1 hour' },
  { minutes: 240, label: 'In 4 hours' },
  { minutes: 720, label: 'In 12 hours' },
];

export function SnoozeButton({ page }: { page: Page }) {
  const { act, clock } = useOnCall();
  const notify = useToast();
  const [choice, setChoice] = useState(10);
  const snooze = (minutes: number) => {
    act({ kind: 'snooze', pageId: page.id, until: clock() + minutes * MINUTE });
    notify(`Page #${page.id} snoozed`);
  };
  return (
    <div className="oc-split">
      <button type="button" className="btn" onClick={() => snooze(10)}>
        Snooze for 10m
      </button>
      <Dropdown label="More snooze options" align="right" triggerClassName="btn btn--icon" trigger={<ChevronDown size={14} />} menuClassName="oc-snooze">
        {(close) => (
          <div role="radiogroup" aria-label="Snooze and re-notify the escalation level">
            <div className="oc-snooze__title">Snooze and re-notify the escalation level:</div>
            {SNOOZE_OPTIONS.map((option) => (
              <label key={option.minutes} className="oc-snooze__option">
                <input type="radio" name={`snooze-${page.id}`} checked={choice === option.minutes} onChange={() => setChoice(option.minutes)} />
                {option.label}
              </label>
            ))}
            <div className="oc-snooze__foot">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  snooze(choice);
                  close();
                }}
              >
                Snooze
              </button>
            </div>
          </div>
        )}
      </Dropdown>
    </div>
  );
}
