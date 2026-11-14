import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { formatCount, formatDuration, formatPercent, formatStamp } from '@telemetry';
import { Card, Stat } from '../components/Card';
import { Chart, Legend } from '../components/Chart';
import { HealthBadge, SeverityBadge, StatusCode, Tabs } from '../components/Badges';
import { EmptyState } from '../components/States';
import { useView } from '../lib/data';
import type { ChartSeries, Workload } from '../lib/model';
import { OUTCOME_COLOR, SEVERITY_COLOR } from '../lib/palette';
import { href, navigate, useSyncParams } from '../lib/router';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'traces', label: 'Traces' },
  { id: 'logs', label: 'Logs' },
  { id: 'resources', label: 'Resources' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tabFrom = (value: string | null): TabId => TABS.find((tab) => tab.id === value)?.id ?? 'overview';

function Neighbours({ workload }: { workload: Workload }) {
  const view = useView();
  const edge = (from: string, to: string) => view.bundle.edges.find((item) => item.from === from && item.to === to);
  const renderList = (names: string[], direction: 'up' | 'down') =>
    names.length === 0 ? (
      <p className="muted">{direction === 'up' ? 'Entry point: nothing calls this workload.' : 'Leaf: this workload calls nothing downstream.'}</p>
    ) : (
      <ul className="neighbours">
        {names.map((name) => {
          const item = direction === 'up' ? edge(name, workload.name) : edge(workload.name, name);
          const known = view.workloadByName.has(name);
          return (
            <li key={name}>
              {known ? <a href={href(`workloads/${name}`)}><Link2 size={12} aria-hidden="true" /> {name}</a> : <span><Link2 size={12} aria-hidden="true" /> {name} <small className="muted">datastore</small></span>}
              {item && <span className="muted">{formatCount(item.calls)} calls · {formatPercent(item.calls ? item.errors / item.calls : 0, 1)} errors · avg {formatDuration(item.avgMs)}</span>}
            </li>
          );
        })}
      </ul>
    );
  return (
    <div className="grid grid--2">
      <Card title="Upstream" hint="called by">{renderList(workload.dependedOnBy, 'up')}</Card>
      <Card title="Downstream" hint="calls">{renderList(workload.dependsOn, 'down')}</Card>
    </div>
  );
}

function Overview({ workload }: { workload: Workload }) {
  const view = useView();
  const axis = view.minuteAxis;
  const ok: ChartSeries = { id: 'ok', label: 'Successful', color: OUTCOME_COLOR.success, values: workload.series.map((point) => point.requests - point.errors) };
  const failed: ChartSeries = { id: 'err', label: 'Errors', color: OUTCOME_COLOR.error, values: workload.series.map((point) => point.errors) };
  const rate: ChartSeries = { id: 'rate', label: 'Error rate', color: '#e0382f', values: workload.series.map((point) => (point.requests ? (point.errors / point.requests) * 100 : null)) };
  const latency: ChartSeries[] = [
    { id: 'p50', label: 'P50', color: '#12306b', values: workload.series.map((point) => (point.requests ? point.p50 : null)) },
    { id: 'p95', label: 'P95', color: '#f0a30a', values: workload.series.map((point) => (point.requests ? point.p95 : null)) },
    { id: 'p99', label: 'P99', color: '#e0382f', values: workload.series.map((point) => (point.requests ? point.p99 : null)) },
  ];
  return (
    <>
      <div className="stats">
        <Stat label="Requests / sec" value={workload.rps.toFixed(2)} />
        <Stat label="Error rate" value={formatPercent(workload.errorRate, 1)} caption={`${formatCount(workload.errors)} failed`} tone={workload.health === 'healthy' ? undefined : workload.health} />
        <Stat label="P50" value={formatDuration(workload.p50)} />
        <Stat label="P95" value={formatDuration(workload.p95)} />
        <Stat label="P99" value={formatDuration(workload.p99)} />
        <Stat label="Requests" value={formatCount(workload.requests)} caption="server spans" />
      </div>
      <div className="grid grid--3">
        <Card title="Requests" right={<Legend items={[ok, failed]} />}>
          <Chart axis={axis} step={60_000} series={[ok, failed]} kind="bar" stacked height={170} label={`${workload.name} requests per minute`} />
        </Card>
        <Card title="Error rate">
          <Chart axis={axis} step={60_000} series={[rate]} kind="area" height={170} label={`${workload.name} error rate`} formatValue={(n) => `${n.toFixed(1)}%`} formatTick={(n) => `${n}%`} />
        </Card>
        <Card title="Latency" right={<Legend items={latency} />}>
          <Chart axis={axis} step={60_000} series={latency} kind="line" height={170} label={`${workload.name} latency`} formatValue={formatDuration} formatTick={formatDuration} />
        </Card>
      </div>
      <Neighbours workload={workload} />
      <div className="grid grid--2">
        <Card title="Operations" hint="span name × scenario">
          <div className="table-scroll">
            <table className="table table--compact">
              <thead><tr><th>Resource</th><th>Scenario</th><th className="num">Requests</th><th className="num">Errors</th><th className="num">P95</th></tr></thead>
              <tbody>
                {workload.operations.map((operation) => (
                  <tr key={`${operation.name}-${operation.scenario}`}>
                    <td className="mono">{operation.name}</td>
                    <td>{operation.scenario}</td>
                    <td className="num">{formatCount(operation.requests)}</td>
                    <td className="num">{formatPercent(operation.requests ? operation.errors / operation.requests : 0, 1)}</td>
                    <td className="num">{formatDuration(operation.p95)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Issues" hint="derived">
          {workload.issues.length === 0 ? (
            <p className="muted">No issues: error rate and p95 are within thresholds.</p>
          ) : (
            <ul className="issue-list">
              {workload.issues.map((issue) => (
                <li key={issue.id}>
                  <SeverityBadge severity={issue.severity} />
                  <div>
                    <strong>{issue.title}</strong>
                    <div className="muted">{issue.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function RecentTraces({ workload }: { workload: Workload }) {
  const view = useView();
  const traces = view.traces.filter((trace) => trace.services.includes(workload.name)).slice(0, 50);
  if (traces.length === 0) return <EmptyState title="No traces in this range">Widen the time range to see sampled traces through {workload.name}.</EmptyState>;
  return (
    <div className="card">
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>Time</th><th>Root workload</th><th>Resource</th><th>Status Code</th><th className="num">Latency</th><th className="num">Spans</th></tr></thead>
          <tbody>
            {traces.map((trace) => (
              <tr key={trace.traceId} className="row--link" tabIndex={0} onClick={() => navigate(`traces/${trace.traceId}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`traces/${trace.traceId}`); }}>
                <td className="mono">{formatStamp(trace.start)}</td>
                <td>{trace.rootService}</td>
                <td className="mono">{trace.rootName}</td>
                <td><StatusCode status={trace.status} /></td>
                <td className="num">{formatDuration(trace.durationMs)}</td>
                <td className="num">{trace.spanCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentLogs({ workload }: { workload: Workload }) {
  const view = useView();
  const logs = view.logs.filter((log) => log.service === workload.name).slice(0, 60);
  if (logs.length === 0) return <EmptyState title="No logs in this range" />;
  return (
    <div className="card">
      <div className="card__head card__head--tight">
        <span className="muted">Latest {logs.length} of {workload.logs.toLocaleString('en-US')} log lines</span>
        <div className="card__spacer" />
        <a className="btn" href={href('logs', { q: `workload:${workload.name}` })}>Open in Logs</a>
      </div>
      <div className="table-scroll">
        <table className="table table--logs">
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="row--link" tabIndex={0} onClick={() => navigate('logs', { q: `workload:${workload.name}` })}>
                <td className="logrow__level"><i style={{ background: SEVERITY_COLOR[log.severity] }} aria-label={log.severity} /></td>
                <td className="mono nowrap">{formatStamp(log.ts)}</td>
                <td className="mono muted nowrap">{log.pod}</td>
                <td className="mono">{log.body} <span className="muted">scenario={log.scenario} outcome={log.outcome}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WorkloadDetail({ name, tab: initialTab }: { name: string; tab: string | null }) {
  const view = useView();
  const workload = view.workloadByName.get(name);
  const [tab, setTab] = useState<TabId>(tabFrom(initialTab));
  useSyncParams(`workloads/${name}`, { tab: tab === 'overview' ? null : tab });

  if (!workload) {
    return (
      <div className="page">
        <EmptyState title={`Workload “${name}” not found`} action={<a className="btn" href={href('workloads')}>Back to Workloads</a>}>
          It is not part of the telemetry bundle.
        </EmptyState>
      </div>
    );
  }

  const env = view.bundle.environment;
  return (
    <div className="page">
      <div className="crumbs">
        <a href={href('workloads')}>Workloads</a>
        <span aria-hidden="true">/</span>
        <strong>{workload.name}</strong>
        <HealthBadge health={workload.health} />
      </div>
      <div className="chips">
        <span className="tag">Kind <b>{workload.kind}</b></span>
        <span className="tag">Namespace <b>{env.namespace}</b></span>
        <span className="tag">Cluster <b>{env.cluster}</b></span>
        <span className="tag">Environment <b>{env.environment}</b></span>
        <span className="tag">Version <b>{workload.version}</b></span>
        <span className="tag" title={workload.pods.join(', ')}>Pod <b>{workload.pods[0]}</b></span>
        <span className="tag">Node <b>{workload.node}</b></span>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Workload sections" />
      {tab === 'overview' && <Overview workload={workload} />}
      {tab === 'traces' && <RecentTraces workload={workload} />}
      {tab === 'logs' && <RecentLogs workload={workload} />}
      {tab === 'resources' && (
        <EmptyState title="n/a in this mock">
          CPU, memory and network metrics are not collected by the demo, so there is nothing to show here.
        </EmptyState>
      )}
    </div>
  );
}
