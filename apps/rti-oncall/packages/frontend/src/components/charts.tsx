import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { formatMonitorValue, HOUR, type Monitor, type MonitorPoint, type MonitorState } from '@oncall';
import { utc } from '../lib/fabric';

export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? fallback);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);
  return { ref, width };
}

const STATE_FILL: Record<MonitorState, string> = { ok: 'transparent', warn: 'rgba(247, 99, 12, 0.12)', alert: 'rgba(197, 15, 31, 0.10)', no_data: 'rgba(97, 97, 97, 0.12)' };
const STATE_LABEL: Record<MonitorState, string> = { ok: 'OK', warn: 'Warn', alert: 'Alert', no_data: 'No data' };

function hourLabel(ms: number) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}

/** 24-hour value line for an Activator rule, with warn and alert thresholds. */
export function MonitorChart({ monitor, points, now, height = 220 }: { monitor: Monitor; points: MonitorPoint[]; now: number; height?: number }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<MonitorPoint | null>(null);
  const margin = { top: 14, right: 16, bottom: 26, left: 56 };
  const from = now - 24 * HOUR;
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  const below = monitor.comparison === 'below';
  const top = Math.max(monitor.alert * 1.25, monitor.warn !== null ? monitor.warn * 1.15 : 0, ...values.map((value) => value * 1.08)) || 1;
  const x = (t: number) => margin.left + ((t - from) / (now - from)) * innerW;
  const y = (value: number) => margin.top + innerH - (value / top) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * top);
  const hours = Array.from({ length: 7 }, (_, index) => from + index * 4 * HOUR);

  let path = '';
  let pen = false;
  for (const point of points) {
    if (point.value === null) {
      pen = false;
      continue;
    }
    path += `${pen ? 'L' : 'M'}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`;
    pen = true;
  }

  const bands = points
    .map((point, index) => ({ point, start: index === 0 ? point.t - 5 * 60_000 : points[index - 1].t }))
    .filter(({ point }) => point.state !== 'ok');
  const firstAt = points[0]?.t;
  const gapEnd = firstAt !== undefined && firstAt - from > 2 * HOUR ? firstAt - 5 * 60_000 : null;

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const t = from + ((event.clientX - box.left) / box.width) * (now - from);
    let best: MonitorPoint | null = null;
    for (const point of points) if (!best || Math.abs(point.t - t) < Math.abs(best.t - t)) best = point;
    setHover(best);
  };

  const summary = `${monitor.name}: ${points.length} evaluations in the last 24 hours, latest ${formatMonitorValue(monitor, values.at(-1) ?? null)}; warn ${monitor.warn === null ? 'none' : formatMonitorValue(monitor, monitor.warn)}, alert ${formatMonitorValue(monitor, monitor.alert)}.`;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={summary}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={margin.left} x2={margin.left + innerW} y1={y(tick)} y2={y(tick)} className="chart__grid" />
            <text x={margin.left - 8} y={y(tick)} className="chart__label" textAnchor="end" dominantBaseline="middle">
              {formatMonitorValue(monitor, tick)}
            </text>
          </g>
        ))}
        {hours.map((t) => (
          <text key={t} x={x(t)} y={height - 8} className="chart__label" textAnchor="middle">
            {hourLabel(t)}
          </text>
        ))}
        {gapEnd !== null && firstAt !== undefined && (
          <g>
            <rect x={margin.left} y={margin.top} width={Math.max(0, x(gapEnd) - margin.left)} height={innerH} className="chart__nodata" />
            <text x={(margin.left + x(gapEnd)) / 2} y={margin.top + innerH / 2} className="chart__label" textAnchor="middle">
              No rows in the Eventhouse before {hourLabel(firstAt)} UTC
            </text>
          </g>
        )}
        {bands.map(({ point, start }) => (
          <rect key={point.t} x={x(Math.max(start, from))} width={Math.max(2, x(point.t) - x(Math.max(start, from)))} y={margin.top} height={innerH} fill={STATE_FILL[point.state]} />
        ))}
        {monitor.warn !== null && (
          <g>
            <line x1={margin.left} x2={margin.left + innerW} y1={y(monitor.warn)} y2={y(monitor.warn)} className="chart__threshold chart__threshold--warn" />
            <text x={margin.left + innerW - 4} y={y(monitor.warn) + (below ? -5 : 12)} className="chart__tlabel chart__tlabel--warn" textAnchor="end">
              Warn {formatMonitorValue(monitor, monitor.warn)}
            </text>
          </g>
        )}
        <line x1={margin.left} x2={margin.left + innerW} y1={y(monitor.alert)} y2={y(monitor.alert)} className="chart__threshold chart__threshold--alert" />
        <text x={margin.left + innerW - 4} y={Math.min(y(monitor.alert) + (below ? 12 : -5), margin.top + innerH - 3)} className="chart__tlabel chart__tlabel--alert" textAnchor="end">
          Alert {formatMonitorValue(monitor, monitor.alert)}
        </text>
        <path d={path} className="chart__line" />
        {points.length <= 80 &&
          points.map((point) =>
            point.value === null ? null : <circle key={point.t} cx={x(point.t)} cy={y(point.value)} r={2.5} className={`chart__dot chart__dot--${point.state}`} />,
          )}
        {hover && (
          <line x1={x(hover.t)} x2={x(hover.t)} y1={margin.top} y2={margin.top + innerH} className="chart__cursor" />
        )}
        <rect x={margin.left} y={margin.top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover && (
        <div className="chart__tip" style={{ left: Math.min(Math.max(x(hover.t), 90), width - 90), top: 4 }}>
          <strong>{formatMonitorValue(monitor, hover.value)}</strong>
          <span>{STATE_LABEL[hover.state]}</span>
          <span>{utc(hover.t)}</span>
        </div>
      )}
      {points.length === 0 && <p className="chart__empty">No evaluations in the last 24 hours.</p>}
    </div>
  );
}

/** Heartbeat rules have no meaningful value line, so show the state over time. */
export function StateStrip({ points, now }: { points: MonitorPoint[]; now: number }) {
  const from = now - 24 * HOUR;
  const span = now - from;
  const segments = points.map((point, index) => ({ state: point.state, start: Math.max(from, point.t), end: points[index + 1]?.t ?? now }));
  return (
    <div className="strip">
      <div className="strip__bar" role="img" aria-label={`Heartbeat state over 24 hours: ${segments.filter((item) => item.state !== 'ok').length} silent periods`}>
        {segments.map((item) => (
          <span
            key={item.start}
            className={`strip__seg strip__seg--${item.state}`}
            style={{ left: `${((item.start - from) / span) * 100}%`, width: `${(Math.max(0, item.end - item.start) / span) * 100}%` }}
            title={`${STATE_LABEL[item.state]} from ${utc(item.start)}`}
          />
        ))}
      </div>
      <div className="strip__axis" aria-hidden>
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>{hourLabel(from + index * 4 * HOUR)}</span>
        ))}
      </div>
      <div className="legend">
        <span className="legend__item">
          <span className="legend__swatch strip__seg--ok" /> Spans arriving
        </span>
        <span className="legend__item">
          <span className="legend__swatch strip__seg--no_data" /> No data
        </span>
      </div>
    </div>
  );
}

export function Sparkline({ points, monitor, width = 96, height = 26 }: { points: MonitorPoint[]; monitor: Monitor; width?: number; height?: number }) {
  const values = points.filter((point) => point.value !== null);
  if (values.length < 2) return <span className="spark spark--empty">sparse data</span>;
  const top = Math.max(monitor.alert * 1.1, ...values.map((point) => point.value as number));
  const t0 = values[0].t;
  const t1 = values.at(-1)!.t;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (width - 2) + 1;
  const y = (value: number) => height - 2 - (value / top) * (height - 4);
  const d = values.map((point, index) => `${index ? 'L' : 'M'}${x(point.t).toFixed(1)},${y(point.value as number).toFixed(1)}`).join('');
  return (
    <svg className="spark" width={width} height={height} aria-hidden>
      <line x1={0} x2={width} y1={y(monitor.alert)} y2={y(monitor.alert)} className="spark__alert" />
      <path d={d} className="spark__line" />
    </svg>
  );
}

/** Pages per day, high urgency stacked on low. */
export function DayBars({ days, height = 200 }: { days: { day: number; high: number; low: number }[]; height?: number }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 12, right: 8, bottom: 28, left: 32 };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const max = Math.max(4, ...days.map((day) => day.high + day.low));
  const nice = Math.ceil(max / 4) * 4;
  const slot = innerW / Math.max(1, days.length);
  const bar = Math.min(40, slot * 0.6);
  const y = (value: number) => margin.top + innerH - (value / nice) * innerH;
  const label = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(ms);
  const total = days.reduce((sum, day) => sum + day.high + day.low, 0);
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`Pages per day, ${total} in total. ${days.map((day) => `${label(day.day)}: ${day.high} high, ${day.low} low`).join('; ')}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}>
            <line x1={margin.left} x2={margin.left + innerW} y1={y(ratio * nice)} y2={y(ratio * nice)} className="chart__grid" />
            <text x={margin.left - 6} y={y(ratio * nice)} className="chart__label" textAnchor="end" dominantBaseline="middle">
              {ratio * nice}
            </text>
          </g>
        ))}
        {days.map((day, index) => {
          const cx = margin.left + slot * index + slot / 2;
          const lowTop = y(day.low);
          const highTop = y(day.low + day.high);
          return (
            <g key={day.day} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
              <rect x={cx - slot / 2} y={margin.top} width={slot} height={innerH} fill={hover === index ? 'rgba(0,0,0,0.03)' : 'transparent'} />
              {day.low > 0 && <rect x={cx - bar / 2} y={lowTop} width={bar} height={margin.top + innerH - lowTop} className="bar--low" rx={2} />}
              {day.high > 0 && <rect x={cx - bar / 2} y={highTop} width={bar} height={lowTop - highTop - (day.low > 0 ? 1 : 0)} className="bar--high" rx={2} />}
              <text x={cx} y={height - 9} className="chart__label" textAnchor="middle">
                {label(day.day)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && days[hover] && (
        <div className="chart__tip" style={{ left: Math.min(Math.max(margin.left + slot * hover + slot / 2, 80), width - 80), top: 4 }}>
          <strong>{label(days[hover].day)}</strong>
          <span>{days[hover].high} high</span>
          <span>{days[hover].low} low</span>
        </div>
      )}
      <div className="legend">
        <span className="legend__item">
          <span className="legend__swatch bar--high" /> High urgency
        </span>
        <span className="legend__item">
          <span className="legend__swatch bar--low" /> Low urgency
        </span>
      </div>
    </div>
  );
}

export function BarList({ items, unit = 'pages' }: { items: { key: string; label: ReactNode; value: number; high?: number; href?: string; extra?: ReactNode }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="barlist">
      {items.map((item) => (
        <li key={item.key} className="barlist__row">
          <div className="barlist__label">{item.href ? <a href={item.href}>{item.label}</a> : item.label}</div>
          <div className="barlist__track" aria-hidden>
            <span className="barlist__fill" style={{ width: `${(item.value / max) * 100}%` }}>
              {item.high !== undefined && item.value > 0 && <span className="barlist__high" style={{ width: `${(item.high / item.value) * 100}%` }} />}
            </span>
          </div>
          <div className="barlist__value">
            {item.value} <span className="sr-only">{unit}</span>
            {item.extra && <span className="barlist__extra">{item.extra}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
