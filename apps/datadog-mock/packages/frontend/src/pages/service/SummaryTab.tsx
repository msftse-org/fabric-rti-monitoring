import { useMemo } from 'react';
import { formatDuration, formatPercent } from '@telemetry';
import { useApp } from '../../lib/app';
import { timeSpentBelow, type ServiceStat } from '../../lib/derive';
import { COLOR, serviceColor } from '../../lib/palette';
import { minuteGrid, minuteSeries } from '../../lib/series';
import { compact } from '../../lib/time';
import { Widget } from '../../components/Widget';
import { Sparkline } from '../../components/charts/Sparkline';
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';
import { ServiceDot } from '../../components/ui';

interface Props {
  stat: ServiceStat;
}

export function SummaryTab({ stat }: Props) {
  const data = useApp();
  const grid = useMemo(() => minuteGrid(data), [data]);
  const series = useMemo(() => minuteSeries(data, grid, [stat.name]), [data, grid, stat.name]);
  const spent = useMemo(() => {
    const rows = timeSpentBelow(data.bundle, data.traces, stat.name);
    const total = rows.reduce((sum, row) => sum + row.ms, 0) || 1;
    return rows.map((row) => ({ ...row, share: row.ms / total }));
  }, [data.bundle, data.traces, stat.name]);

  const cards: { label: string; value: string; spark: number[]; color: string; tone?: string }[] = [
    { label: 'Requests', value: stat.requests.toLocaleString(), spark: series.requests, color: COLOR.hits },
    { label: 'Req/s', value: stat.rps.toFixed(2), spark: series.requests, color: COLOR.hits },
    { label: 'Error rate', value: formatPercent(stat.errorRate), spark: series.errors, color: COLOR.errors, tone: stat.errorRate >= 0.1 ? 'alert' : stat.errorRate >= 0.05 ? 'warn' : undefined },
    { label: 'p95 latency', value: formatDuration(stat.p95), spark: series.p95.map((value) => value ?? 0), color: '#7a69d6' },
    { label: 'Apdex (T 500ms)', value: stat.apdex === null ? '–' : stat.apdex.toFixed(2), spark: [], color: COLOR.hits },
  ];

  return (
    <div className="svc__summary">
      <div className="svc__cards">
        {cards.map((card) => (
          <div key={card.label} className="svc__card">
            <div className="svc__card-label">{card.label}</div>
            <div className="svc__card-value" data-tone={card.tone}>
              {card.value}
            </div>
            {card.spark.length > 0 && <Sparkline values={card.spark} width={110} height={22} color={card.color} />}
          </div>
        ))}
      </div>
      <div className="svc__grid">
        <Widget title="Requests" subtitle="per minute">
          <TimeSeriesChart
            grid={grid}
            mode="stacked"
            height={170}
            ariaLabel={`Requests per minute for ${stat.name}`}
            series={[
              { key: 'ok', label: 'ok', color: COLOR.hits, values: series.ok },
              { key: 'error', label: 'error', color: COLOR.errors, values: series.errors },
            ]}
            footer={(i) => (
              <div className="chart__tip-row chart__tip-total">
                <span className="grow">Total</span>
                <b>{series.requests[i]}</b>
              </div>
            )}
          />
        </Widget>
        <Widget title="Errors" subtitle="per minute">
          <TimeSeriesChart grid={grid} mode="bars" height={170} ariaLabel={`Errors per minute for ${stat.name}`} series={[{ key: 'errors', label: 'errors', color: COLOR.errors, values: series.errors }]} />
        </Widget>
        <Widget title="Latency" subtitle="request-weighted per minute">
          <TimeSeriesChart
            grid={grid}
            mode="line"
            height={170}
            ariaLabel={`Latency for ${stat.name}`}
            yFormat={(value) => formatDuration(value)}
            valueFormat={(value) => formatDuration(value)}
            series={[
              { key: 'p99', label: 'p99', color: '#e8826a', values: series.p99 },
              { key: 'p95', label: 'p95', color: '#7a69d6', values: series.p95 },
              { key: 'p50', label: 'p50', color: '#5dbf9a', values: series.p50 },
              { key: 'avg', label: 'avg', color: COLOR.hits, values: series.avg },
            ]}
          />
          <div className="legend legend--row">
            {[
              ['p99', '#e8826a'],
              ['p95', '#7a69d6'],
              ['p50', '#5dbf9a'],
              ['avg', COLOR.hits],
            ].map(([label, color]) => (
              <span key={label} className="legend-item">
                <span className="sev-swatch" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </Widget>
        <Widget title="% time spent by service" subtitle={`in traces through ${stat.name}`}>
          {spent.length === 0 ? (
            <p className="muted">No retained traces pass through this service in the selected window.</p>
          ) : (
            <ul className="svc__spent">
              {spent.map((row) => (
                <li key={row.name}>
                  <ServiceDot name={row.name} size={11} />
                  <span className="svc__spent-name">{row.name}</span>
                  <span className="svc__spent-bar">
                    <span style={{ width: `${row.share * 100}%`, background: serviceColor(row.name) }} />
                  </span>
                  <span className="svc__spent-pct">{(row.share * 100).toFixed(1)}%</span>
                  <span className="svc__spent-ms muted">{formatDuration(row.ms / Math.max(1, data.traces.length))} avg</span>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>
      <p className="page__hint muted">
        {compact(stat.logs)} logs ({compact(stat.errorLogs)} errors) in this window · version {stat.version} · pod {stat.pods.join(', ')}
      </p>
    </div>
  );
}
