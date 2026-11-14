import { useMemo, useState, type KeyboardEvent } from 'react';
import { Maximize2, X } from 'lucide-react';
import { formatDuration, type LogEntry, type TraceSpan } from '@telemetry';
import type { AppData } from '../../lib/app';
import { spanService } from '../../lib/derive';
import { COLOR, serviceColor } from '../../lib/palette';
import { paths } from '../../lib/router';
import { minuteGrid, minuteSeries } from '../../lib/series';
import { formatStampMs, formatClockMs } from '../../lib/time';
import { CopyButton, EmptyState, ServiceDot } from '../../components/ui';
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';

type PanelTab = 'overview' | 'infrastructure' | 'logs' | 'metrics';

interface Props {
  span: TraceSpan;
  traceId: string;
  selfMs: number;
  totalMs: number;
  logs: LogEntry[];
  data: AppData;
  onClose: () => void;
  onZoom: (span: TraceSpan) => void;
}

function Pairs({ rows }: { rows: [string, string, { copy?: boolean; href?: string }?][] }) {
  return (
    <dl className="pairs">
      {rows.map(([key, value, options]) => (
        <div key={key} className="pairs__row">
          <dt>{key}</dt>
          <dd className="mono">
            {options?.href ? <a href={`#${options.href}`}>{value}</a> : value}
            {options?.copy && <CopyButton value={value} label={`Copy ${key}`} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SpanPanel({ span, traceId, selfMs, totalMs, logs, data, onClose, onZoom }: Props) {
  const [tab, setTab] = useState<PanelTab>('overview');
  const service = spanService(span);
  const env = data.bundle.environment;
  const tabs: { id: PanelTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'infrastructure', label: 'Infrastructure' },
    { id: 'logs', label: 'Logs', count: logs.length },
    { id: 'metrics', label: 'Metrics' },
  ];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = tabs.findIndex((item) => item.id === tab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setTab(next.id);
    event.currentTarget.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  };

  return (
    <section className="spanpanel" aria-label={`Span ${span.name}`}>
      <header className="spanpanel__head">
        <span className="spanpanel__icon" style={{ background: serviceColor(service) }} aria-hidden="true" />
        <b>{service}</b>
        <span className="spanpanel__op">{span.name}</span>
        <span className={`chip ${span.status === 'error' ? 'chip--alert' : 'chip--soft'}`}>{span.status === 'unset' ? 'unset' : span.status}</span>
        <span className="grow" />
        <span className="spanpanel__meta mono">
          {formatDuration(span.durationMs)} · {((span.durationMs / totalMs) * 100).toFixed(1)}% of trace
        </span>
        <button type="button" className="icon-btn" aria-label="Zoom timeline to this span" title="Zoom timeline to this span" onClick={() => onZoom(span)}>
          <Maximize2 size={14} />
        </button>
        <button type="button" className="icon-btn" aria-label="Close span details" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <div className="subtabs" role="tablist" aria-label="Span details" onKeyDown={onKeyDown}>
        <span className="subtabs__label">Span:</span>
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" data-tab={item.id} className="subtab" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}>
            {item.label}
            {item.count !== undefined && <span className="subtab__count">{item.count}</span>}
          </button>
        ))}
      </div>
      <div className="spanpanel__body" role="tabpanel">
        {tab === 'overview' && (
          <div className="spanpanel__cols">
            <div>
              <h4 className="spanpanel__title">Details</h4>
              <Pairs
                rows={[
                  ['Service', service, service === span.service ? { href: paths.service(service) } : undefined],
                  ['Resource', span.name],
                  ['Span kind', span.kind],
                  ['Status', span.status],
                  ['Start (UTC)', formatStampMs(Date.parse(span.start))],
                  ['Duration', formatDuration(span.durationMs)],
                  ['Exec time', formatDuration(selfMs)],
                ]}
              />
            </div>
            <div>
              <h4 className="spanpanel__title">Tags</h4>
              <Pairs
                rows={[
                  ['scenario', span.scenario, { href: paths.traces(`scenario:${span.scenario}`) }],
                  ['outcome', span.outcome],
                  ['env', env.environment],
                  ['version', span.version],
                  ['span_id', span.spanId, { copy: true }],
                  ['parent_id', span.parentId || '—'],
                  ['trace_id', traceId, { copy: true }],
                ]}
              />
            </div>
          </div>
        )}
        {tab === 'infrastructure' && (
          <div className="spanpanel__cols">
            <div>
              <h4 className="spanpanel__title">Kubernetes</h4>
              <Pairs
                rows={[
                  ['cluster', env.cluster],
                  ['namespace', env.namespace],
                  ['pod', span.pod, { href: paths.logs(`pod:${span.pod}`) }],
                  ['node', span.node, { href: paths.logs(`host:${span.node}`) }],
                  ['version', span.version],
                ]}
              />
            </div>
            <p className="muted spanpanel__hint">Host-level CPU and memory are not collected by this demo, so they are not shown.</p>
          </div>
        )}
        {tab === 'logs' && <SpanLogs logs={logs} span={span} traceId={traceId} />}
        {tab === 'metrics' && <SpanMetrics service={service} data={data} />}
      </div>
    </section>
  );
}

function SpanLogs({ logs, span, traceId }: { logs: LogEntry[]; span: TraceSpan; traceId: string }) {
  if (!logs.length) {
    return (
      <EmptyState title="No retained logs for this span">
        {span.logCount > 0 ? `The span reports ${span.logCount} log(s), but the bundle no longer retains them.` : 'No log was emitted inside this span.'}
      </EmptyState>
    );
  }
  return (
    <div className="scroll-x">
      <table className="table spanpanel__logs">
        <thead>
          <tr>
            <th>Date</th>
            <th>Status</th>
            <th>Content</th>
            <th className="num">Duration</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="mono">{formatClockMs(Date.parse(log.ts))}</td>
              <td>
                <span className="sev-swatch" style={{ background: log.severity === 'ERROR' ? COLOR.error : COLOR.info }} /> {log.severity.toLowerCase()}
              </td>
              <td className="mono">{log.body}</td>
              <td className="num mono">{log.durationMs === null ? '–' : formatDuration(log.durationMs)}</td>
              <td>
                <a href={`#${paths.logs(`trace_id:${traceId} span_id:${log.spanId}`)}`}>Open in Log Explorer</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpanMetrics({ service, data }: { service: string; data: AppData }) {
  const grid = useMemo(() => minuteGrid(data), [data]);
  const series = useMemo(() => minuteSeries(data, grid, [service]), [data, grid, service]);
  if (!data.statsByName[service]) {
    return <EmptyState title="No service metrics">{service} is a datastore dependency; the demo exports request metrics only for its own services.</EmptyState>;
  }
  return (
    <div className="spanpanel__cols">
      <div>
        <h4 className="spanpanel__title">
          <ServiceDot name={service} /> demo.requests · {service}
        </h4>
        <TimeSeriesChart
          grid={grid}
          mode="stacked"
          height={120}
          ariaLabel={`Requests per minute for ${service}`}
          series={[
            { key: 'ok', label: 'ok', color: COLOR.hits, values: series.ok },
            { key: 'error', label: 'error', color: COLOR.errors, values: series.errors },
          ]}
        />
      </div>
      <div>
        <h4 className="spanpanel__title">
          <ServiceDot name={service} /> demo.request.duration · {service}
        </h4>
        <TimeSeriesChart
          grid={grid}
          mode="line"
          height={120}
          ariaLabel={`Latency for ${service}`}
          yFormat={(value) => formatDuration(value)}
          valueFormat={(value) => formatDuration(value)}
          series={[
            { key: 'p95', label: 'p95', color: '#7a69d6', values: series.p95 },
            { key: 'avg', label: 'avg', color: COLOR.hits, values: series.avg },
          ]}
        />
      </div>
    </div>
  );
}
