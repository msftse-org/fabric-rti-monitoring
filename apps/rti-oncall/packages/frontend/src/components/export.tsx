import { useMemo, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { createCommand, reflexDefinition, type FabricTarget, type Monitor } from '@oncall';
import { downloadFile } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { useToast } from '../lib/toast';
import { Button, CodeBlock, Dialog, Field } from './ui';

const TARGET_KEY = 'rti.oncall.fabricTarget';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY = '00000000-0000-0000-0000-000000000000';

function initialTarget(): FabricTarget {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TARGET_KEY) ?? 'null') as FabricTarget | null;
    if (stored && typeof stored.workspaceId === 'string' && typeof stored.databaseItemId === 'string') return stored;
  } catch {
    // Fall through to the build-time default.
  }
  return __FABRIC_TARGET__ ?? { workspaceId: '', databaseItemId: '' };
}

const fileName = (monitor: Monitor) => `${monitor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rule'}.reflex.json`;

/** Builds the Activator item definition for a rule. The browser has no Fabric token, so the item is created with the Azure CLI. */
export function ExportDialog({ monitor, onClose }: { monitor: Monitor; onClose: () => void }) {
  const { lk, me } = useOnCall();
  const notify = useToast();
  const team = lk.teams.get(monitor.teamId);
  const [target, setTarget] = useState(initialTarget);
  const [start, setStart] = useState(false);
  const [touched, setTouched] = useState(false);
  const [at] = useState(() => Date.now());
  const workspaceError = GUID.test(target.workspaceId.trim()) ? undefined : 'Paste the workspace id from the Fabric URL: /groups/<workspace-id>/.';
  const databaseError = GUID.test(target.databaseItemId.trim()) ? undefined : 'Paste the KQL database item id from its URL: /databases/<item-id>.';
  const clean = { workspaceId: target.workspaceId.trim(), databaseItemId: target.databaseItemId.trim() };
  const exported = useMemo(
    () => reflexDefinition(monitor, { workspaceId: clean.workspaceId || EMPTY, databaseItemId: clean.databaseItemId || EMPTY }, team?.name ?? monitor.teamId, { start, placeholderRecipient: me.email, now: at }),
    [monitor, clean.workspaceId, clean.databaseItemId, team?.name, start, me.email, at],
  );
  const file = fileName(monitor);
  const placeholders = exported.rules.some((rule) => rule.placeholder);

  const download = () => {
    setTouched(true);
    if (workspaceError || databaseError) {
      document.getElementById(workspaceError ? 'ex-ws' : 'ex-db')?.focus();
      return;
    }
    try {
      window.localStorage.setItem(TARGET_KEY, JSON.stringify(clean));
    } catch {
      // Remembering the ids is a convenience only.
    }
    downloadFile(file, JSON.stringify(exported.createBody, null, 2), 'application/json');
    notify('Activator definition downloaded', `Run the Azure CLI command from the folder with ${file}.`);
  };

  return (
    <Dialog
      wide
      title="Export to Fabric Activator"
      onClose={onClose}
      onSubmit={download}
      description={`Creates the Activator item "${exported.displayName}": a KQL source on the Eventhouse that runs every 5 minutes, and one rule per threshold and action.`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button type="submit" variant="primary" icon={<Download size={14} aria-hidden />}>
            Download definition
          </Button>
        </>
      }
    >
      <div className="ex-grid">
        <Field label="Workspace id" htmlFor="ex-ws">
          <input
            id="ex-ws"
            className="input mono"
            value={target.workspaceId}
            spellCheck={false}
            aria-invalid={touched && Boolean(workspaceError)}
            aria-describedby={touched && workspaceError ? 'ex-ws-error' : undefined}
            onChange={(event) => setTarget({ ...target, workspaceId: event.target.value })}
          />
          {touched && workspaceError && (
            <p className="field__error" id="ex-ws-error">
              {workspaceError}
            </p>
          )}
        </Field>
        <Field label="KQL database item id" htmlFor="ex-db">
          <input
            id="ex-db"
            className="input mono"
            value={target.databaseItemId}
            spellCheck={false}
            aria-invalid={touched && Boolean(databaseError)}
            aria-describedby={touched && databaseError ? 'ex-db-error' : undefined}
            onChange={(event) => setTarget({ ...target, databaseItemId: event.target.value })}
          />
          {touched && databaseError && (
            <p className="field__error" id="ex-db-error">
              {databaseError}
            </p>
          )}
        </Field>
      </div>
      <label className="ex-check" htmlFor="ex-start">
        <input id="ex-start" type="checkbox" checked={start} onChange={(event) => setStart(event.target.checked)} />
        <span>
          Start the rules after import
          <span className="field__hint">{placeholders ? 'Placeholder rules always import stopped.' : 'Leave off to check the recipients in Activator first.'}</span>
        </span>
      </label>

      <section className="ex-section" aria-labelledby="ex-rules">
        <h3 id="ex-rules">
          {exported.rules.length} Activator rule{exported.rules.length === 1 ? '' : 's'}
        </h3>
        <ul className="ex-rules">
          {exported.rules.map((rule) => (
            <li key={rule.name}>
              <span className="ex-rules__name">{rule.name}</span>
              <span className="muted small">{rule.condition}</span>
              <span className="ex-rules__tags">
                <span className={`badge ${rule.level === 'alert' ? 'badge--danger' : 'badge--warning'}`}>{rule.level === 'alert' ? 'Alert' : 'Warning'}</span>
                <span className="badge badge--outline">{rule.action === 'Teams' ? 'Teams message' : 'Email'}</span>
                {rule.placeholder && <span className="badge badge--neutral">Placeholder for paging, stopped</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ex-section" aria-labelledby="ex-create">
        <h3 id="ex-create">Create the item</h3>
        <p className="small">Sign in with <code className="inline-code">az login</code>, then run this from the folder you saved {file} to.</p>
        <CodeBlock code={createCommand(clean.workspaceId || '<workspace-id>', file)} title="Azure CLI" language="Shell" />
        {!workspaceError && (
          <a className="ex-link small" href={`https://app.fabric.microsoft.com/groups/${clean.workspaceId}`} target="_blank" rel="noreferrer">
            Open the workspace in Fabric
            <ExternalLink size={12} aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </section>

      {exported.followUps.length > 0 && (
        <section className="ex-section" aria-labelledby="ex-todo">
          <h3 id="ex-todo">Then, in Activator</h3>
          <ul className="ex-todo small">
            {exported.followUps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
