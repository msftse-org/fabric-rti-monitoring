import type { TraceSpan } from '@telemetry';
import { formatDuration } from '@telemetry';
import { spanService } from '../../lib/derive';
import { serviceColor } from '../../lib/palette';
import { durationTicks, formatTickMs } from '../../lib/tracesModel';
import { ServiceDot } from '../../components/ui';

export type ColorBy = 'service' | 'status';

export interface Range {
  from: number;
  to: number;
}

export interface Hover {
  span: TraceSpan;
  x: number;
  y: number;
}

export interface SpanViewProps {
  spans: TraceSpan[];
  range: Range;
  colorBy: ColorBy;
  selected: string;
  faded: (span: TraceSpan) => boolean;
  onSelect: (spanId: string) => void;
  onZoom: (span: TraceSpan) => void;
  onHover: (hover: Hover | null) => void;
}

export function colorOf(span: TraceSpan, colorBy: ColorBy): string {
  if (colorBy === 'service') return serviceColor(spanService(span));
  return span.status === 'error' ? 'var(--sev-error)' : span.status === 'ok' ? 'var(--ok)' : 'var(--sev-debug)';
}

export const spanLabel = (span: TraceSpan): string => `${spanService(span)} · ${span.name}`;

/** Position of a span inside the visible range as CSS percentages, or `null` when it lies outside. */
export function place(span: TraceSpan, range: Range): { left: number; width: number } | null {
  const total = range.to - range.from;
  const start = span.offsetMs - range.from;
  const end = start + span.durationMs;
  if (end < 0 || start > total) return null;
  const left = Math.max(0, start);
  return { left: (left / total) * 100, width: Math.max(0.25, ((Math.min(total, end) - left) / total) * 100) };
}

export function TimeRuler({ range }: { range: Range }) {
  const total = range.to - range.from;
  return (
    <div className="ruler" aria-hidden="true">
      {durationTicks(total).map((tick) => {
        const left = (tick / total) * 100;
        return (
          <span key={tick} className="ruler__tick" style={{ left: `${left}%` }} data-end={left > 94}>
            {formatTickMs(range.from + tick)}
          </span>
        );
      })}
    </div>
  );
}

export function TickGrid({ range }: { range: Range }) {
  const total = range.to - range.from;
  return (
    <div className="tickgrid" aria-hidden="true">
      {durationTicks(total).map((tick) => (
        <span key={tick} style={{ left: `${(tick / total) * 100}%` }} />
      ))}
    </div>
  );
}

export function SpanTip({ hover, total }: { hover: Hover; total: number }) {
  const { span } = hover;
  const service = spanService(span);
  const left = Math.min(hover.x + 14, window.innerWidth - 280);
  return (
    <div className="spantip" role="tooltip" style={{ left, top: hover.y + 16 }}>
      <div className="spantip__head">
        <ServiceDot name={service} size={12} />
        <b>{service}</b>
      </div>
      <div className="spantip__name">{span.name}</div>
      <div className="spantip__line">
        {formatDuration(span.durationMs)} <span className="spantip__dim">({((span.durationMs / total) * 100).toFixed(1)}% of trace)</span>
      </div>
      <div className="spantip__dim">
        starts +{formatDuration(span.offsetMs)} · {span.status === 'unset' ? 'no status' : span.status}
      </div>
    </div>
  );
}
