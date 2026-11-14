import { useMemo, useState } from 'react';
import { Activity, Bell, CodeXml, Copy, Pause, Pencil, Play, Plus, Trash2, Upload, Users, Zap } from 'lucide-react';
import { activatorRules, reflexDefinition, dateTime, duration, evaluateMonitors, formatMonitorValue, type AlertEpisode, type Monitor, type MonitorState, type MonitorStatus, type Page } from '@oncall';
import { MonitorChart, Sparkline, StateStrip } from '../components/charts';
import { NewPageDialog } from '../components/dialogs';
import { ExportDialog } from '../components/export';
import { KeyValue, PageTable } from '../components/oncall';
import { Button, Card, CapabilityList, CodeBlock, Command, CommandBar, CommandDivider, CounterpartLink, Crumbs, Dialog, Disclosure, EmptyState, Person, Segmented, StateBadge, TimeAgo, ViewHeader } from '../components/ui';
import { ruleKql, SIGNAL_LABEL } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, navigate, paths } from '../lib/router';
import { useToast } from '../lib/toast';
import { alertError } from '../lib/liveAlerts';
import { LiveAlertsConnection } from '../components/live-alerts';

type StateFilter = 'all' | 'custom' | MonitorState;

function RuleBadges({ monitor }: { monitor: Monitor }) {
  if (!monitor.authored) return null;
  return (
    <>
      <span className="badge badge--info">{monitor.authored.fabric ? 'Saved in Fabric' : 'Local demo'}</span>
      {!monitor.authored.enabled && <span className="badge badge--neutral">Stopped</span>}
    </>
  );
}

function thresholds(monitor: Monitor) {
  if (monitor.signal === 'no_data') return `No data for ${monitor.alert} min`;
  const sign = monitor.comparison === 'below' ? '< ' : '';
  return `${monitor.warn !== null ? `Warn ${sign}${formatMonitorValue(monitor, monitor.warn)} · ` : ''}Alert ${sign}${formatMonitorValue(monitor, monitor.alert)}`;
}

export function RulesList() {
  const { model, lk, now } = useOnCall();
  const [state, setState] = useState<StateFilter>('all');
  const status = new Map(model.monitorStatus.map((item) => [item.monitorId, item]));
  const count = (value: MonitorState) => model.monitorStatus.filter((item) => item.state === value).length;
  const custom = model.monitors.filter((monitor) => monitor.authored).length;
  const monitors = model.monitors.filter((monitor) => state === 'all' || (state === 'custom' ? Boolean(monitor.authored) : status.get(monitor.id)?.state === state));
  const lastPage = (monitorId: number) => model.pages.find((page) => page.monitorId === monitorId);

  return (
    <>
      <ViewHeader eyebrow="Activator" title="Activator rules" actions={<CounterpartLink path="/rules" />}>
        Create real Activator alerts and native notification actions on OTELTraces. Seeded and browser-only rules below are demo simulations, separate from live Fabric alerts.
      </ViewHeader>
      <LiveAlertsConnection />
      <CommandBar label="Rule commands">
        <Command icon={Plus} label="New alert rule" primary href={href(paths.ruleNew())} />
        <Command icon={Zap} label={`Open ${model.monitors[0].name}`} href={href(paths.rule(model.monitors[0].id))} />
        <Command icon={Bell} label="Pages from rules" href={href(paths.pages())} />
      </CommandBar>
      <div className="filters">
        <Segmented
          label="Rule state"
          value={state}
          onChange={setState}
          options={[
            { value: 'all', label: 'All', count: model.monitors.length },
            { value: 'alert', label: 'Alert', count: count('alert') },
            { value: 'warn', label: 'Warn', count: count('warn') },
            { value: 'no_data', label: 'No data', count: count('no_data') },
            { value: 'ok', label: 'OK', count: count('ok') },
            { value: 'custom', label: 'Built here', count: custom },
          ]}
        />
      </div>
      <Card flush>
        {monitors.length ? (
          <div className="table-wrap">
            <table className="table table--cards">
              <caption className="sr-only">Activator rules</caption>
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">Rule</th>
                  <th scope="col">Team</th>
                  <th scope="col">Thresholds</th>
                  <th scope="col" className="num">
                    Value
                  </th>
                  <th scope="col">Last 24 h</th>
                  <th scope="col">Last alert</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((monitor) => {
                  const item = status.get(monitor.id) as MonitorStatus | undefined;
                  const team = lk.teams.get(monitor.teamId);
                  const page = lastPage(monitor.id);
                  return (
                    <tr key={monitor.id} className="row-link" onClick={(event) => (event.target as HTMLElement).closest('a') || navigate(paths.rule(monitor.id))}>
                      <td data-label="State">{monitor.authored?.fabric ? <span className={`badge ${monitor.authored.enabled ? 'badge--info' : 'badge--neutral'}`}>{monitor.authored.enabled ? 'Running in Fabric' : 'Stopped in Fabric'}</span> : item ? <StateBadge state={item.state} /> : monitor.authored ? <span className="badge badge--neutral">Stopped</span> : '-'}</td>
                      <td data-label="Rule">
                        <span className="rule-name">
                          <a href={href(paths.rule(monitor.id))} className="strong-link">
                            {monitor.name}
                          </a>
                          <span className="badge badge--info">{monitor.authored?.fabric ? 'Fabric alert' : 'Local demo'}</span>
                        </span>
                        <span className="cell-sub">
                          {SIGNAL_LABEL[monitor.signal]} · {monitor.service ?? 'cluster'} · P{monitor.priority}
                        </span>
                      </td>
                      <td data-label="Team">
                        <span className="team-chip">
                          <span className="team-chip__dot" style={{ background: team?.color }} aria-hidden />
                          {team?.name}
                        </span>
                      </td>
                      <td data-label="Thresholds" className="small">
                        {thresholds(monitor)}
                      </td>
                      <td data-label="Value" className="num">
                        {item ? formatMonitorValue(monitor, item.value) : '-'}
                      </td>
                      <td data-label="Last 24 h">{item && (monitor.signal === 'no_data' ? <StateStrip points={item.points} now={now} /> : <Sparkline points={item.points} monitor={monitor} />)}</td>
                      <td data-label="Last alert">{monitor.authored?.fabric ? <a href={monitor.authored.fabric.url} target="_blank" rel="noreferrer">Fabric history</a> : page ? <a href={href(paths.page(page.id))}><TimeAgo at={page.triggeredAt} now={now} /></a> : <span className="muted">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          state === 'custom' ? (
            <EmptyState icon={Plus} title="No rules built here yet">
              <a href={href(paths.ruleNew())}>Create an alert rule</a> and save it directly to your Fabric workspace.
            </EmptyState>
          ) : (
            <EmptyState title="No rules in this state" />
          )
        )}
      </Card>
      <Card title="How alerting works in Fabric" icon={Zap}>
        <CapabilityList ids={['monitors', 'authoring', 'thresholds', 'no-data', 'auto-resolve']} />
      </Card>
    </>
  );
}

function Activations({ monitor, episodes, pages, now }: { monitor: Monitor; episodes: AlertEpisode[]; pages: Page[]; now: number }) {
  const { lk, span } = useOnCall();
  const actions = monitor.authored?.actions;
  const names = (addresses: string[]) => addresses.map((address) => [...lk.users.values()].find((user) => user.email.toLowerCase() === address.toLowerCase())?.name ?? address).join(', ');
  const rows = [...episodes].reverse().slice(0, 8);
  if (!rows.length) return <EmptyState title={`No activations in ${span}`} />;
  return (
    <ul className="acts">
      {rows.map((episode) => {
        const page = pages.find((item) => item.triggeredAt === episode.start);
        return (
          <li key={episode.start} className="acts__item">
            <div className="acts__head">
              <StateBadge state={episode.upgradedAt !== null ? 'alert' : episode.status} />
              <span className="small">
                <TimeAgo at={episode.start} now={now} /> · {monitor.signal === 'no_data' ? 'silent' : `${monitor.comparison === 'below' ? 'low' : 'peak'} ${formatMonitorValue(monitor, episode.peak)}`} · {episode.end === null ? 'still firing' : `recovered after ${duration(episode.end - episode.start)}`}
              </span>
            </div>
            <ul className="acts__did small">
              {actions?.page && <li>{page ? <a href={href(paths.page(page.id))}>Paged as #{page.id}</a> : <span className="muted">Paging skipped: no routing rule matched</span>}</li>}
              {actions?.teams && <li>Teams message to {names(actions.teams.recipients)}</li>}
              {actions?.email && <li>Email to {names(actions.email.to)}</li>}
            </ul>
          </li>
        );
      })}
      {episodes.length > rows.length && <li className="acts__item muted small">and {episodes.length - rows.length} earlier</li>}
    </ul>
  );
}

function DeleteDialog({ monitor, onClose }: { monitor: Monitor; onClose: () => void }) {
  const { deleteRule } = useOnCall();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      title="Delete this rule?"
      onClose={() => { if (!busy) onClose(); }}
      onSubmit={async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
          await deleteRule(monitor.id);
          notify('Rule deleted', monitor.authored?.fabric ? 'The Activator item and its actions have been removed from Fabric.' : 'The local demo rule was removed.', 'info');
          onClose();
          navigate(paths.rules());
        } catch (error) {
          setError(alertError(error));
        } finally {
          setBusy(false);
        }
      }}
      description={monitor.authored?.fabric ? `Delete "${monitor.name}" from Fabric? Its live rules and actions will be removed for everyone.` : `Delete "${monitor.name}" from this browser? Fabric items are not affected.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" className="btn--danger" disabled={busy}>
            {busy ? 'Deleting...' : 'Delete rule'}
          </Button>
        </>
      }
    >
      <p className="small">This cannot be undone.</p>
      {error && <p className="field__error" role="alert">{error}</p>}
    </Dialog>
  );
}

export function RuleDetail({ id }: { id: number }) {
  const { model, lk, now, saveRule, history, span } = useOnCall();
  const notify = useToast();
  const [dialog, setDialog] = useState<'page' | 'export' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monitor = model.monitors.find((item) => item.id === id);
  const fabric = monitor?.authored?.fabric;
  const stopped = Boolean(monitor?.authored && !monitor.authored.enabled);
  // A stopped rule is not part of the model's evaluation, so preview it locally.
  const local = useMemo(() => (monitor && (stopped || fabric) ? evaluateMonitors([monitor], history, now) : null), [monitor, stopped, fabric, history, now]);
  if (!monitor) {
    return (
      <>
        <Crumbs items={[{ label: 'Activator rules', to: paths.rules() }, { label: String(id) }]} />
        <LiveAlertsConnection />
        <EmptyState icon={Zap} title={`Rule ${id} does not exist`}>
          Sign in and refresh Fabric rules to load a live alert. Legacy local demo rules are visible only in their original browser. <a href={href(paths.rules())}>Back to Activator rules</a>
        </EmptyState>
      </>
    );
  }
  const authored = monitor.authored;
  const status = local ? local.status[0] : model.monitorStatus.find((item) => item.monitorId === monitor.id);
  const episodes = local ? local.episodes : model.episodes.filter((episode) => episode.monitorId === monitor.id);
  const team = lk.teams.get(monitor.teamId);
  const rules = fabric ? reflexDefinition(monitor, { workspaceId: fabric.workspaceId, databaseItemId: '' }, team?.name ?? monitor.teamId, { start: authored?.enabled ?? false, placeholderRecipient: '', now }).rules.map((rule) => ({
    name: rule.name, source: 'Eventhouse scheduled KQL', object: monitor.service ?? 'All services', property: SIGNAL_LABEL[monitor.signal],
    condition: rule.condition, occurrence: 'Every 5 minutes, on threshold transition',
    actions: [rule.action === 'Teams' ? `Teams: ${authored?.actions.teams?.recipients.join(', ')}` : `Email: ${authored?.actions.email?.to.join(', ')}`],
  })) : activatorRules(monitor, team?.name ?? monitor.teamId, team?.chatChannel ?? 'oncall');
  const pages = model.pages.filter((page) => page.monitorId === monitor.id);
  const author = authored ? lk.users.get(authored.createdBy) : undefined;
  const openKql = () => {
    const details = document.getElementById('rule-kql');
    if (details instanceof HTMLDetailsElement) {
      details.open = true;
      details.scrollIntoView({ behavior: 'smooth', block: 'center' });
      details.querySelector('summary')?.focus();
    }
  };
  const toggle = async () => {
    if (!authored || !fabric || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveRule({ ...monitor, authored: { ...authored, enabled: stopped, updatedAt: Date.now() } });
      notify(stopped ? 'Alert started in Fabric' : 'Alert stopped in Fabric', stopped ? 'Activator will evaluate new data and run the configured actions.' : 'The native notification rules are now stopped.');
    } catch (error) {
      setError(alertError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Crumbs items={[{ label: 'Activator rules', to: paths.rules() }, { label: monitor.name }]} />
      <ViewHeader eyebrow={`Activator · ${authored ? 'built in this app' : 'rule set'} ${monitor.id}`} title={monitor.name} actions={<CounterpartLink path={authored ? paths.rules() : paths.rule(monitor.id)} label={authored ? 'Datadog monitors' : undefined} />}>
        {fabric ? <span className="badge badge--info">{stopped ? 'Stopped in Fabric' : 'Running in Fabric'}</span> : status && !stopped && <StateBadge state={status.state} />}
        <RuleBadges monitor={monitor} />
        <a href={href(paths.team(monitor.teamId))} className="team-chip">
          <span className="team-chip__dot" style={{ background: team?.color }} aria-hidden />
          {team?.name}
        </a>
        <span className="muted">
          {SIGNAL_LABEL[monitor.signal]} · {monitor.service ?? 'cluster-wide'} · {monitor.env} · P{monitor.priority}
          {status && !stopped && !fabric && (
            <>
              {' '}
              · {status.state === 'ok' ? 'OK' : 'In this state'} since <TimeAgo at={status.since} now={now} />
            </>
          )}
        </span>
      </ViewHeader>
      <LiveAlertsConnection />
      {error && <p className="field__error" role="alert">{error}</p>}
      {authored ? (
        <CommandBar label="Rule commands" end={<Command icon={Trash2} label="Delete" disabled={busy} onClick={() => setDialog('delete')} />}>
          <Command icon={Pencil} label={fabric ? 'Edit' : 'Publish to Fabric'} primary href={href(paths.ruleEdit(monitor.id))} />
          {fabric && <Command icon={stopped ? Play : Pause} label={busy ? 'Updating Fabric...' : stopped ? 'Start in Fabric' : 'Stop in Fabric'} disabled={busy} onClick={() => void toggle()} />}
          <Command icon={Copy} label="Duplicate" href={href(paths.ruleNew(monitor.id))} />
          <CommandDivider />
          {fabric ? <Command icon={Upload} label="Open in Activator" href={fabric.url} external /> : <Command icon={Upload} label="Download definition" onClick={() => setDialog('export')} />}
          <Command icon={CodeXml} label="KQL" onClick={openKql} />
        </CommandBar>
      ) : (
        <CommandBar label="Rule commands" end={<Command icon={CodeXml} label="Open in KQL queryset" onClick={openKql} />}>
          <Command icon={Plus} label={`Page ${team?.name ?? 'team'}`} primary onClick={() => setDialog('page')} />
          <Command icon={Users} label="Team" href={href(paths.team(monitor.teamId))} />
          <Command icon={Copy} label="Duplicate as a new rule" href={href(paths.ruleNew(monitor.id))} />
        </CommandBar>
      )}

      <div className="grid grid--main">
        <div className="stack">
          {stopped && (
            <div className="callout">
              <Pause size={16} aria-hidden />
              <div>
                <strong>Stopped.</strong> This rule is not evaluated and raises no pages or messages. The chart below previews what it would do.
              </div>
            </div>
          )}
          <Card title={fabric ? 'Historical preview (snapshot)' : 'Last 24 hours (demo)'} icon={Activity} subtitle={status ? `Preview value ${formatMonitorValue(monitor, status.value)} · ${thresholds(monitor)}` : undefined}>
            {status ? monitor.signal === 'no_data' ? <StateStrip points={status.points} now={now} /> : <MonitorChart monitor={monitor} points={status.points} now={now} /> : <EmptyState title="No evaluations yet" />}
          </Card>
          <Card title="Rules" icon={Zap} subtitle={authored ? `${rules.length} Activator rule${rules.length === 1 ? '' : 's'} run this alert` : `${rules.length} Activator rule${rules.length === 1 ? '' : 's'} stand in for this Datadog monitor`}>
            <ul className="arules">
              {rules.map((rule) => (
                <li key={rule.name} className="arule">
                  <div className="arule__head">
                    <span className="arule__icon" aria-hidden>
                      <Zap size={14} />
                    </span>
                    <strong>{rule.name}</strong>
                  </div>
                  <div className="arule__grid">
                    <section>
                      <h3>Monitor</h3>
                      <KeyValue items={[['Source', rule.source], ['Object', rule.object], ['Property', rule.property]]} />
                    </section>
                    <section>
                      <h3>Condition</h3>
                      <p className="arule__cond">{rule.condition}</p>
                      <p className="muted small">{rule.occurrence}</p>
                    </section>
                    <section>
                      <h3>Action</h3>
                      <ul className="arule__actions">
                        {rule.actions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Disclosure summary="KQL behind the rule" id="rule-kql" defaultOpen>
            <CodeBlock
              code={ruleKql(monitor)}
              title={authored ? `Activator KQL source · ${monitor.name}` : 'KQL queryset · oncall-monitors'}
              note={authored ? 'Activator runs this every 5 minutes with startTime and endTime set to the window it reads.' : 'Runs as-is against the demo Eventhouse; Activator reads Value, WarnThreshold and AlertThreshold.'}
            />
          </Disclosure>
        </div>
        <div className="stack">
          {fabric ? (
            <Card title="Live actions" icon={Bell}>
              <p className="small">Activator evaluates new Eventhouse data every 5 minutes and sends the configured Teams and email notifications. This page does not fabricate delivery results from the snapshot.</p>
              <a href={fabric.url} target="_blank" rel="noreferrer">Open Activator for execution history and delivery errors</a>
            </Card>
          ) : authored ? (
            <Card title="Activations" icon={Bell} subtitle={stopped ? `What it would have done in ${span}` : `${span[0].toUpperCase()}${span.slice(1)}, as if the rule had been running`}>
              <Activations monitor={monitor} episodes={episodes} pages={pages} now={now} />
            </Card>
          ) : (
            <Card title="Recent alerts" icon={Bell} flush>
              <PageTable pages={pages.slice(0, 6)} caption={`Recent alerts from ${monitor.name}`} empty="This rule has not raised a page" showTeam={false} />
            </Card>
          )}
          {authored && (
            <Card title="Built in this app">
              <KeyValue
                items={[
                  ['Created by', fabric ? 'Authenticated Fabric app' : <Person user={author} size={20} />],
                  ['Created', `${dateTime(authored.createdAt)} UTC`],
                  ['Updated', `${dateTime(authored.updatedAt)} UTC`],
                  ['Stored', fabric ? 'Fabric workspace (shared and persistent)' : 'This browser only (legacy demo)'],
                ]}
              />
              <p className="muted small rb-made__note">{fabric ? 'The source, thresholds and actions are saved in Activator. Closing this page does not stop evaluation.' : 'Use Publish to Fabric to create a persistent alert with native notification actions.'}</p>
            </Card>
          )}
          <Card title={authored ? 'Same monitor in Datadog' : 'Datadog monitor it replaces'}>
            <KeyValue
              items={[
                ['Monitor', authored ? 'Not created; equivalent query' : `#${monitor.id}`],
                ['Query', <code className="inline-code wrap">{monitor.query}</code>],
                ['Message', <span className="small">{monitor.message || <span className="muted">None</span>}</span>],
              ]}
            />
          </Card>
          <Card title="How this works in Fabric">
            <CapabilityList ids={authored ? ['authoring', 'monitors', 'thresholds'] : monitor.signal === 'no_data' ? ['no-data', 'monitors'] : ['monitors', 'thresholds', 'auto-resolve']} />
          </Card>
        </div>
      </div>
      {dialog === 'page' && <NewPageDialog teamId={monitor.teamId} onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog monitor={monitor} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog monitor={monitor} onClose={() => setDialog(null)} />}
    </>
  );
}
