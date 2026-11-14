import { useState } from 'react';
import { DAY, HOUR, MINUTE, clock, dateTime, evaluateMonitors, formatMonitorValue, historyOf, type Monitor, type MonitorPoint, type MonitorState, type OnCallInput } from '@oncall';
import { useElementWidth } from '../../lib/hooks';
import { niceMax } from '../../lib/time';

const cache = new Map<string, MonitorPoint[]>();

/** The engine keeps 24 h of status points, so longer ranges re-run it on a truncated history, one day at a time. */
export function monitorSeries(input: OnCallInput, monitor: Monitor, now: number, days: number): MonitorPoint[] {
  const key = `${input.generatedAt}|${monitor.id}|${days}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const history = historyOf(input);
  const bucket = history.bucketMinutes * MINUTE;
  const seen = new Map<number, MonitorPoint>();
  for (let day = days - 1; day >= 0; day -= 1) {
    const cutoff = now - day * DAY;
    const points = day === 0 ? history.points : history.points.filter((point) => Date.parse(point.t) + bucket <= cutoff);
    const [status] = evaluateMonitors([monitor], { bucketMinutes: history.bucketMinutes, points }, cutoff).status;
    for (const point of status?.points ?? []) seen.set(point.t, point);
  }
  const series = [...seen.values()].filter((point) => point.t > now - days * DAY).sort((a, b) => a.t - b.t);
  cache.set(key, series);
  return series;
}

const STATE_COLOR: Record<MonitorState, string> = { ok: 'var(--ok)', warn: 'var(--warn)', alert: 'var(--alert)', no_data: 'var(--nodata)' };
const MARGIN = { top: 12, right: 14, bottom: 40, left: 58 };
const BAND = 8;

export function MonitorChart({ monitor, points, from, to, height = 230 }: { monitor: Monitor; points: MonitorPoint[]; from: number; to: number; height?: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<MonitorPoint | null>(null);
  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  const scale = niceMax(Math.max(monitor.alert * 1.15, ...values), 4);
  const x = (t: number) => MARGIN.left + ((t - from) / (to - from)) * innerW;
  const y = (value: number) => MARGIN.top + innerH - (Math.min(value, scale.max) / scale.max) * innerH;
  const span = to - from;
  const tickStep = span <= DAY ? 3 * HOUR : DAY;
  const ticks = Array.from({ length: Math.floor(span / tickStep) + 1 }, (_, index) => Math.ceil(from / tickStep) * tickStep + index * tickStep).filter((t) => t <= to);
  const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

  let path = '';
  let previous: MonitorPoint | null = null;
  for (const point of points) {
    if (point.value === null) {
      previous = null;
      continue;
    }
    const gap = previous !== null && point.t - previous.t > 3 * monitor.windowMinutes * MINUTE;
    path += `${previous === null || gap ? 'M' : 'L'}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`;
    previous = point;
  }

  const band = points.map((point, index) => {
    const end = points[index + 1]?.t ?? Math.min(to, point.t + monitor.windowMinutes * MINUTE);
    return { start: Math.max(from, point.t), end: Math.min(to, end), state: point.state };
  });

  const nearest = (clientX: number, left: number) => {
    const t = from + ((clientX - left - MARGIN.left) / innerW) * span;
    let best: MonitorPoint | null = null;
    for (const point of points) if (!best || Math.abs(point.t - t) < Math.abs(best.t - t)) best = point;
    return best && Math.abs(best.t - t) < span / 40 ? best : null;
  };

  return (
    <div className="chart oc-mchart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${monitor.name}: ${points.length} evaluations between ${dateTime(from)} and ${dateTime(to)} UTC. Alert threshold ${formatMonitorValue(monitor, monitor.alert)}.`}
          onPointerMove={(event) => setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect().left))}
          onPointerLeave={() => setHover(null)}
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="chart__grid" />
              <text x={MARGIN.left - 6} y={y(tick) + 3.5} textAnchor="end" className="chart__label">
                {monitor.unit === 'minutes' ? `${Math.round(tick)}m` : formatMonitorValue(monitor, tick)}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={height - MARGIN.bottom + BAND + 16} textAnchor="middle" className="chart__label">
              {span <= DAY ? clock(t) : dayFmt.format(t)}
            </text>
          ))}
          {monitor.warn !== null && (
            <g>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(monitor.warn)} y2={y(monitor.warn)} className="oc-mchart__warn" />
              <text x={MARGIN.left + 4} y={y(monitor.warn) + 11} className="chart__label oc-mchart__label oc-mchart__label--warn">
                warn {formatMonitorValue(monitor, monitor.warn)}
              </text>
            </g>
          )}
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(monitor.alert)} y2={y(monitor.alert)} className="oc-mchart__alert" />
          <text x={MARGIN.left + 4} y={y(monitor.alert) - 4} className="chart__label oc-mchart__label oc-mchart__label--alert">
            alert {formatMonitorValue(monitor, monitor.alert)}
          </text>
          <path d={path} className="oc-mchart__line" />
          {points.length < 60 &&
            points.map((point) => (point.value === null ? null : <circle key={point.t} cx={x(point.t)} cy={y(point.value)} r={2.5} className="oc-mchart__dot" style={{ fill: STATE_COLOR[point.state] }} />))}
          {band.map((segment) =>
            segment.end > segment.start ? (
              <rect key={segment.start} x={x(segment.start)} y={height - MARGIN.bottom + 4} width={Math.max(1, x(segment.end) - x(segment.start))} height={BAND} fill={STATE_COLOR[segment.state]} />
            ) : null,
          )}
          {hover && <line x1={x(hover.t)} x2={x(hover.t)} y1={MARGIN.top} y2={height - MARGIN.bottom + BAND + 4} className="chart__cursor" />}
        </svg>
      )}
      {hover && (
        <div className="chart__tip" style={{ left: Math.min(width - 170, x(hover.t) + 10), top: MARGIN.top }}>
          <div className="chart__tip-head">{dateTime(hover.t)} UTC</div>
          <div className="chart__tip-row">
            <span className="sev-swatch" style={{ background: STATE_COLOR[hover.state] }} />
            {hover.state.replace('_', ' ').toUpperCase()} · {formatMonitorValue(monitor, hover.value)}
          </div>
        </div>
      )}
    </div>
  );
}
