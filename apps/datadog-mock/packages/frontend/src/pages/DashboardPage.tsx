import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { formatDuration, formatPercent } from '@telemetry';
import { useApp } from '../lib/app';
import { COLOR, serviceColor } from '../lib/palette';
import { navigate, paths } from '../lib/router';
import { minuteGrid, minuteSeries } from '../lib/series';
import { bucketize, compact, formatClockMs } from '../lib/time';
import { Select } from '../components/Select';
import { Widget } from '../components/Widget';
import { Sparkline } from '../components/charts/Sparkline';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { EmptyState, HealthChip, ServiceTag } from '../components/ui';
import { DASHBOARD_ID } from './DashboardsPage';

interface QueryValueProps {
  title: string;
  value: string;
  tone?: 'ok' | 'warn' | 'alert';
  spark: number[];
  color: string;
}

function QueryValue({ title, value, tone, spark, color }: QueryValueProps) {
  return (
    <Widget title={title} className="widget--qv">
      <div className="qv" data-tone={tone}>
        <span className="qv__value">{value}</span>
        <Sparkline values={spark} width={160} height={34} color={color} kind="line" />
      </div>
    </Widget>
  );
}

export function DashboardPage({ id }: { id: string }) {
  const data = useApp();
  const [service, setService] = useState('*');
  const [starred, setStarred] = useState(false);
  const names = useMemo(() => (service === '*' ? data.stats.map((stat) => stat.name) : [service]), [service, data.stats]);
  const scoped = useMemo(() => data.stats.filter((stat) => names.includes(stat.name)), [data.stats, names]);
  const grid = useMemo(() => minuteGrid(data), [data]);
  const total = useMemo(() => minuteSeries(data, grid, names), [data, grid, names]);
  const perService = useMemo(() => scoped.map((stat) => ({ stat, series: minuteSeries(data, grid, [stat.name]) })), [data, grid, scoped]);

  const requests = scoped.reduce((sum, stat) => sum + stat.requests, 0);
  const errors = scoped.reduce((sum, stat) => sum + stat.errors, 0);
  const errorRate = requests ? errors / requests : 0;
  const p95 = requests ? scoped.reduce((sum, stat) => sum + stat.p95 * stat.requests, 0) / requests : 0;
  const apdexValues = scoped.flatMap((stat) => (stat.apdex === null ? [] : [stat.apdex]));
  const apdex = apdexValues.length ? apdexValues.reduce((a, b) => a + b, 0) / apdexValues.length : null;

  const logs = useMemo(() => data.logs.filter((log) => names.includes(log.service)), [data.logs, names]);
  const [infoLogs, errorLogs] = useMemo(() => bucketize(grid, logs, (log) => (log.severity === 'ERROR' || log.severity === 'FATAL' ? 1 : 0), (log) => log.ms, 2), [grid, logs]);
  const errorTraces = useMemo(() => data.traces.filter((trace) => trace.status === 'error' && trace.services.some((name) => names.includes(name))).slice(0, 8), [data.traces, names]);
  const topErrors = useMemo(() => [...scoped].sort((a, b) => b.errors - a.errors), [scoped]);
  const maxErrors = Math.max(1, ...topErrors.map((stat) => stat.errors));

  if (id !== DASHBOARD_ID) {
    return (
      <EmptyState
        title="Dashboard not found"
        action={
          <a className="btn btn--primary" href={`#${paths.dashboards()}`}>
            Back to Dashboard List
          </a>
        }
      >
        Only “AKS Services Overview” exists in this mock.
      </EmptyState>
    );
  }

  return (
    <div className="dash">
      <header className="dash__head">
        <button type="button" className="icon-btn" aria-label={starred ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={starred} onClick={() => setStarred((value) => !value)}>
          <Star size={16} fill={starred ? 'var(--warn)' : 'none'} />
        </button>
        <h1 className="dash__title">AKS Services Overview</h1>
        <span className="muted dash__desc">otel-demo workload · {data.bundle.environment.cluster}</span>
      </header>
      <div className="dash__vars">
        <span className="dash__var-label">service</span>
        <Select label="Template variable service" value={service} options={[{ value: '*', label: '*' }, ...data.stats.map((stat) => ({ value: stat.name, label: stat.name }))]} onChange={setService} />
        <span className="chip chip--soft">env:{data.bundle.environment.environment}</span>
      </div>
      <div className="dash__grid">
        <div className="dash__cell dash__cell--3">
          <QueryValue title="Requests" value={compact(requests)} spark={total.requests} color={COLOR.hits} />
        </div>
        <div className="dash__cell dash__cell--3">
          <QueryValue title="Error rate" value={formatPercent(errorRate)} tone={errorRate >= 0.1 ? 'alert' : errorRate >= 0.05 ? 'warn' : 'ok'} spark={total.errors} color={COLOR.errors} />
        </div>
        <div className="dash__cell dash__cell--3">
          <QueryValue title="p95 latency" value={formatDuration(p95)} tone={p95 >= 1000 ? 'alert' : p95 >= 500 ? 'warn' : 'ok'} spark={total.p95.map((value) => value ?? 0)} color="#7a69d6" />
        </div>
        <div className="dash__cell dash__cell--3">
          <QueryValue title="Apdex (T = 500 ms)" value={apdex === null ? '–' : apdex.toFixed(2)} tone={apdex === null ? undefined : apdex < 0.8 ? 'alert' : apdex < 0.9 ? 'warn' : 'ok'} spark={total.ok} color={COLOR.hits} />
        </div>
        <div className="dash__cell dash__cell--8">
          <Widget title="Requests by service" subtitle="per minute">
            <TimeSeriesChart
              grid={grid}
              mode="stacked"
              height={190}
              ariaLabel="Requests per minute by service"
              series={perService.map(({ stat, series }) => ({ key: stat.name, label: stat.name, color: serviceColor(stat.name), values: series.requests }))}
            />
          </Widget>
        </div>
        <div className="dash__cell dash__cell--4">
          <Widget title="Service status" subtitle="derived monitors">
            <ul className="dash__status">
              {scoped.map((stat) => (
                <li key={stat.name}>
                  <a href={`#${paths.service(stat.name)}`}>
                    <ServiceTag name={stat.name} />
                  </a>
                  <span className="grow" />
                  <span className="muted">{formatPercent(stat.errorRate)}</span>
                  <HealthChip status={stat.status} />
                </li>
              ))}
            </ul>
          </Widget>
        </div>
        <div className="dash__cell dash__cell--6">
          <Widget title="p95 latency by service">
            <TimeSeriesChart
              grid={grid}
              mode="line"
              height={190}
              ariaLabel="p95 latency by service"
              yFormat={(value) => formatDuration(value)}
              valueFormat={(value) => formatDuration(value)}
              series={perService.map(({ stat, series }) => ({ key: stat.name, label: stat.name, color: serviceColor(stat.name), values: series.p95 }))}
            />
          </Widget>
        </div>
        <div className="dash__cell dash__cell--3">
          <Widget title="Top services by errors">
            <ul className="toplist">
              {topErrors.map((stat) => (
                <li key={stat.name} className="toplist__row">
                  <span className="toplist__name truncate">
                    <ServiceTag name={stat.name} />
                  </span>
                  <span className="toplist__track">
                    <span className="toplist__bar" style={{ width: `${(stat.errors / maxErrors) * 100}%`, background: serviceColor(stat.name) }} />
                  </span>
                  <b className="toplist__value">{stat.errors.toLocaleString()}</b>
                </li>
              ))}
            </ul>
          </Widget>
        </div>
        <div className="dash__cell dash__cell--3">
          <Widget title="Logs by status" subtitle={`${logs.length.toLocaleString()} logs`}>
            <TimeSeriesChart
              grid={grid}
              mode="stacked"
              height={190}
              ariaLabel="Logs by status"
              series={[
                { key: 'info', label: 'info', color: COLOR.info, values: infoLogs },
                { key: 'error', label: 'error', color: COLOR.error, values: errorLogs },
              ]}
            />
          </Widget>
        </div>
        <div className="dash__cell dash__cell--12">
          <Widget title="Recent error traces" subtitle={`${errorTraces.length} shown`}>
            {errorTraces.length === 0 ? (
              <p className="muted">No error traces in the selected window.</p>
            ) : (
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Service</th>
                      <th>Resource</th>
                      <th>Services involved</th>
                      <th className="num">Duration</th>
                      <th className="num">Spans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorTraces.map((trace) => (
                      <tr key={trace.traceId} className="row-link" onClick={() => navigate(paths.trace(trace.traceId))}>
                        <td className="mono">{formatClockMs(trace.ms)}</td>
                        <td>
                          <ServiceTag name={trace.rootService} />
                        </td>
                        <td className="mono">{trace.rootName}</td>
                        <td>{trace.services.join(' → ')}</td>
                        <td className="num">{formatDuration(trace.durationMs)}</td>
                        <td className="num">{trace.spanCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Widget>
        </div>
      </div>
    </div>
  );
}
