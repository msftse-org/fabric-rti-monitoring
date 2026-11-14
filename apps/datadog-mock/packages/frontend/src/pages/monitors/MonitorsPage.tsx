import { useMemo, useState } from 'react';
import { BellOff, Pencil, Plus, Search } from 'lucide-react';
import { DAY, ago, dateTime, formatMonitorValue, type Monitor, type MonitorState } from '@oncall';
import { useShell } from '../../lib/app';
import { useOnCall } from '../../lib/oncall';
import { useIsMobile } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { useInert } from '../../lib/toast';
import { EmptyState, PageTabs, Segmented, ServiceTag } from '../../components/ui';
import { AsOf, CompareLink, MonitorChip, ResetActions, Section, TeamPill } from '../../components/oncall/kit';
import { PagesTable } from '../oncall/shared';
import { MonitorChart, monitorSeries } from './MonitorChart';

const STATES: MonitorState[] = ['alert', 'warn', 'no_data', 'ok'];
const STATE_LABEL: Record<MonitorState, string> = { alert: 'Alert', warn: 'Warn', no_data: 'No Data', ok: 'OK' };

function tagsOf(monitor: Monitor, handle: string | undefined): string[] {
  return [`env:${monitor.env}`, ...(monitor.service ? [`service:${monitor.service}`] : []), `team:${handle?.replace(/^oncall-/, '') ?? monitor.teamId}`, `priority:p${monitor.priority}`];
}

function MonitorsHeader({ current, path }: { current: 'manage' | 'triggered'; path: string }) {
  const inert = useInert();
  return (
    <div className="page__head page__head--split oc-mon-head">
      <PageTabs
        tabs={[
          { id: 'manage', label: 'Manage Monitors' },
          { id: 'triggered', label: 'Triggered Monitors' },
        ]}
        current={current}
        onSelect={(id) => navigate(paths.monitors(id === 'triggered'))}
      />
      <div className="oc-head__actions">
        <AsOf />
        <ResetActions />
        <CompareLink path={path} compact />
        <button type="button" className="btn btn--primary" onClick={inert}>
          <Plus size={14} aria-hidden="true" /> New Monitor
        </button>
      </div>
    </div>
  );
}

export function MonitorsPage({ triggered }: { triggered: boolean }) {
  const { model, now, team } = useOnCall();
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [states, setStates] = useState<MonitorState[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const status = useMemo(() => new Map(model.monitorStatus.map((item) => [item.monitorId, item])), [model.monitorStatus]);
  const lastTriggered = useMemo(() => {
    const map = new Map<number, number>();
    for (const episode of model.episodes) map.set(episode.monitorId, Math.max(map.get(episode.monitorId) ?? 0, episode.start));
    return map;
  }, [model.episodes]);

  const needle = query.trim().toLowerCase();
  const base = model.monitors.filter((monitor) => !triggered || (status.get(monitor.id)?.state ?? 'ok') !== 'ok');
  const searched = base.filter((monitor) => !needle || [monitor.name, monitor.query, String(monitor.id), ...tagsOf(monitor, team(monitor.teamId)?.handle)].some((text) => text.toLowerCase().includes(needle)));
  const rows = searched.filter((monitor) => (!states.length || states.includes(status.get(monitor.id)?.state ?? 'ok')) && (!teams.length || teams.includes(monitor.teamId)));
  const stateCount = (state: MonitorState) => searched.filter((monitor) => (status.get(monitor.id)?.state ?? 'ok') === state && (!teams.length || teams.includes(monitor.teamId))).length;
  const teamCount = (id: string) => searched.filter((monitor) => monitor.teamId === id && (!states.length || states.includes(status.get(monitor.id)?.state ?? 'ok'))).length;
  const recent = model.episodes.filter((episode) => episode.start >= now - 7 * DAY).sort((a, b) => b.start - a.start);

  return (
    <div className="page oc-page">
      <MonitorsHeader current={triggered ? 'triggered' : 'manage'} path={paths.monitors(triggered)} />
      <div className="oc-body oc-body--list">
        <div className="input-wrap oc-search">
          <Search size={14} aria-hidden="true" />
          <input className="input" type="search" placeholder="Search monitors by name, query or tag" aria-label="Search monitors" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="oc-listgrid" data-controls={!mobile}>
          {!mobile && (
            <aside className="oc-facets" aria-label="Monitor filters">
              <fieldset className="oc-facet">
                <legend>Status</legend>
                {STATES.map((state) => (
                  <label key={state} className="oc-facet__item">
                    <input type="checkbox" checked={states.includes(state)} onChange={() => setStates((current) => (current.includes(state) ? current.filter((item) => item !== state) : [...current, state]))} />
                    <MonitorChip state={state} />
                    <span className="grow" />
                    <span className="oc-facet__count">{stateCount(state)}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="oc-facet">
                <legend>Team</legend>
                {model.teams.map((item) => (
                  <label key={item.id} className="oc-facet__item">
                    <input type="checkbox" checked={teams.includes(item.id)} onChange={() => setTeams((current) => (current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id]))} />
                    <span className="truncate grow">{item.name}</span>
                    <span className="oc-facet__count">{teamCount(item.id)}</span>
                  </label>
                ))}
              </fieldset>
            </aside>
          )}
          <div className="oc-listmain">
            {mobile && (
              <Segmented
                label="Status"
                value={states.length === 1 ? states[0] : 'any'}
                options={[{ value: 'any', label: 'All' }, ...STATES.map((state) => ({ value: state, label: `${STATE_LABEL[state]} ${stateCount(state)}` }))]}
                onChange={(value) => setStates(value === 'any' ? [] : [value as MonitorState])}
              />
            )}
            <div className="muted oc-listbar">
              {rows.length} monitor{rows.length === 1 ? '' : 's'}
              {triggered && ' currently triggered'}
            </div>
            {rows.length ? (
              <div className="card oc-listcard scroll-x">
                <table className="table oc-table oc-mon-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Name</th>
                      <th className="oc-mon-table__type">Type</th>
                      <th className="oc-mon-table__query">Query</th>
                      <th>Last triggered</th>
                      <th className="num">Pages (7d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((monitor) => {
                      const state = status.get(monitor.id)?.state ?? 'ok';
                      const last = lastTriggered.get(monitor.id);
                      return (
                        <tr key={monitor.id} className="row-link" onClick={() => navigate(paths.monitor(monitor.id))}>
                          <td>
                            <MonitorChip state={state} />
                          </td>
                          <td>
                            <a href={`#${paths.monitor(monitor.id)}`} onClick={(event) => event.stopPropagation()}>
                              <b>{monitor.name}</b>
                            </a>
                            <div className="oc-mon-tags">
                              {tagsOf(monitor, team(monitor.teamId)?.handle).map((tag) => (
                                <span key={tag} className="oc-tag oc-tag--muted">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="oc-mon-table__type">{monitor.type === 'apm' ? 'APM' : 'Heartbeat'}</td>
                          <td className="oc-mon-table__query">
                            <code className="oc-query oc-query--inline" title={monitor.query}>
                              {monitor.query}
                            </code>
                          </td>
                          <td title={last ? `${dateTime(last)} UTC` : undefined}>{last ? ago(last, now) : <span className="muted">Never</span>}</td>
                          <td className="num">{model.pages.filter((page) => page.monitorId === monitor.id).length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card oc-listcard">
                <EmptyState title={triggered ? 'No triggered monitors' : 'No monitors match'}>{triggered ? 'Every monitor is OK right now.' : 'Try a different search or clear the filters.'}</EmptyState>
              </div>
            )}
            {triggered && (
              <Section title={`Recently triggered (past 7 days · ${recent.length})`}>
                <div className="scroll-x">
                  <table className="table oc-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Monitor</th>
                        <th>Triggered</th>
                        <th>Recovered</th>
                        <th>Peak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.slice(0, 25).map((episode) => {
                        const monitor = model.monitors.find((item) => item.id === episode.monitorId)!;
                        return (
                          <tr key={`${episode.monitorId}-${episode.start}`} className="row-link" onClick={() => navigate(paths.monitor(monitor.id))}>
                            <td>
                              <MonitorChip state={episode.upgradedAt ? 'alert' : episode.status} />
                            </td>
                            <td>
                              <a href={`#${paths.monitor(monitor.id)}`} onClick={(event) => event.stopPropagation()}>
                                {monitor.name}
                              </a>
                            </td>
                            <td>{dateTime(episode.start)} UTC</td>
                            <td>{episode.end ? `${dateTime(episode.end)} UTC` : <span className="text-alert">Still triggered</span>}</td>
                            <td>{formatMonitorValue(monitor, episode.peak)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ text }: { text: string }) {
  const { model } = useOnCall();
  const parts = text.split(/(@oncall-[a-z0-9-]+)/g);
  return (
    <p className="oc-message">
      {parts.map((part, index) => {
        const team = model.teams.find((item) => `@${item.handle}` === part);
        return team ? (
          <a key={index} className="oc-mention" href={`#${paths.oncallTeam(team.id)}`}>
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </p>
  );
}

export function MonitorDetailPage({ id }: { id: number }) {
  const { model, team } = useOnCall();
  const { data } = useShell();
  const inert = useInert();
  const [days, setDays] = useState<'1' | '7'>('7');
  const monitor = model.monitors.find((item) => item.id === id);
  const series = useMemo(() => (monitor && data ? monitorSeries(data.bundle, monitor, model.now, Number(days)) : []), [monitor, data, model.now, days]);

  if (!monitor) {
    return (
      <div className="page oc-page">
        <EmptyState title="Monitor not found" action={<a className="btn" href={`#${paths.monitors()}`}>Manage Monitors</a>}>
          No monitor with ID {id}.
        </EmptyState>
      </div>
    );
  }
  const status = model.monitorStatus.find((item) => item.monitorId === monitor.id);
  const state = status?.state ?? 'ok';
  const owner = team(monitor.teamId);
  const pages = model.pages.filter((page) => page.monitorId === monitor.id);
  const episodes = model.episodes.filter((episode) => episode.monitorId === monitor.id);

  return (
    <div className="page oc-page">
      <MonitorsHeader current="manage" path={paths.monitor(monitor.id)} />
      <div className="oc-body">
        <nav className="oc-crumbs" aria-label="Breadcrumb">
          <a href={`#${paths.monitors()}`}>Manage Monitors</a> / <span>#{monitor.id}</span>
        </nav>
        <header className="oc-head oc-head--split">
          <div>
            <div className="oc-mon-title">
              <MonitorChip state={state} />
              <h1 className="oc-head__title">{monitor.name}</h1>
            </div>
            <div className="oc-mon-tags">
              <span className="muted">#{monitor.id}</span>
              {tagsOf(monitor, owner?.handle).map((tag) => (
                <span key={tag} className="oc-tag oc-tag--muted">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="oc-head__actions">
            <button type="button" className="btn" onClick={inert}>
              <BellOff size={14} aria-hidden="true" /> Mute
            </button>
            <button type="button" className="btn" onClick={inert}>
              <Pencil size={14} aria-hidden="true" /> Edit
            </button>
          </div>
        </header>

        <div className="oc-mon-grid">
          <Section
            title="Status & History"
            className="oc-mon-grid__chart"
            actions={
              <Segmented
                label="Time range"
                value={days}
                options={[
                  { value: '1', label: 'Past 1 Day' },
                  { value: '7', label: 'Past 1 Week' },
                ]}
                onChange={setDays}
              />
            }
          >
            <div className="oc-mon-status">
              <span>
                <span className="muted">Current status</span> <MonitorChip state={state} /> since {status ? `${dateTime(status.since)} UTC` : '–'}
              </span>
              <span>
                <span className="muted">Last value</span> <strong>{formatMonitorValue(monitor, status?.value ?? null)}</strong>
              </span>
              <span>
                <span className="muted">Evaluations shown</span> {series.length}
              </span>
            </div>
            <MonitorChart monitor={monitor} points={series} from={model.now - Number(days) * DAY} to={model.now} />
            <p className="muted oc-mon-note">Gaps mean the AKS workload was idle and sent no spans. Monitors evaluate {monitor.windowMinutes}-minute windows of 5-minute buckets from the Eventhouse history.</p>
          </Section>

          <Section title="Properties" className="oc-mon-grid__props">
            <dl className="oc-kv">
              <dt>Type</dt>
              <dd>{monitor.type === 'apm' ? 'APM Metric' : 'Heartbeat (no data)'}</dd>
              <dt>Query</dt>
              <dd>
                <code className="oc-query">{monitor.query}</code>
              </dd>
              <dt>Thresholds</dt>
              <dd>
                <span className="text-alert">Alert {formatMonitorValue(monitor, monitor.alert)}</span>
                {monitor.warn !== null && (
                  <>
                    {' · '}
                    <span className="text-warn">Warning {formatMonitorValue(monitor, monitor.warn)}</span>
                  </>
                )}
              </dd>
              <dt>Priority</dt>
              <dd>P{monitor.priority}</dd>
              <dt>Service</dt>
              <dd>{monitor.service ? <ServiceTag name={monitor.service} /> : <span className="muted">All services</span>}</dd>
              <dt>Team</dt>
              <dd>
                <TeamPill team={owner} />
              </dd>
              <dt>Triggered</dt>
              <dd>
                {episodes.length} time{episodes.length === 1 ? '' : 's'} in the past week
              </dd>
            </dl>
          </Section>

          <Section title="Message" className="oc-mon-grid__msg">
            <Message text={monitor.message} />
            <p className="muted oc-mon-note">Mentioning an @oncall handle pages that team through its routing rules.</p>
          </Section>

          <Section title={`Pages from this monitor (${pages.length})`} className="oc-mon-grid__pages">
            <PagesTable pages={pages.slice(0, 15)} status="all" empty="This monitor has not paged anyone in the past week." compact narrow />
          </Section>
        </div>
      </div>
    </div>
  );
}
