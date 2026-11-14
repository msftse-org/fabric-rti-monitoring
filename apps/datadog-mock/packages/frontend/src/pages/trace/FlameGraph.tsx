import { useMemo } from 'react';
import { formatDuration } from '@telemetry';
import { colorOf, place, spanLabel, TickGrid, TimeRuler, type SpanViewProps } from './shared';

const ROW = 22;

export function FlameGraph({ spans, range, colorBy, selected, faded, onSelect, onZoom, onHover }: SpanViewProps) {
  const depth = useMemo(() => Math.max(0, ...spans.map((span) => span.depth)) + 1, [spans]);
  return (
    <div className="flame scroll-x">
      <div className="flame__inner">
        <TimeRuler range={range} />
        <div className="flame__plot" style={{ height: depth * ROW + 8 }}>
          <TickGrid range={range} />
          {spans.map((span) => {
            const box = place(span, range);
            if (!box) return null;
            return (
              <button
                key={span.spanId}
                type="button"
                className="flame__span"
                data-selected={span.spanId === selected}
                data-error={span.status === 'error'}
                data-faded={faded(span)}
                aria-label={`${spanLabel(span)}, ${formatDuration(span.durationMs)}`}
                style={{ left: `${box.left}%`, width: `${box.width}%`, top: span.depth * ROW + 4, height: ROW - 2, background: colorOf(span, colorBy) }}
                onClick={() => onSelect(span.spanId)}
                onDoubleClick={() => onZoom(span)}
                onPointerMove={(event) => onHover({ span, x: event.clientX, y: event.clientY })}
                onPointerLeave={() => onHover(null)}
              >
                <span className="flame__label">{spanLabel(span)}</span>
                <span className="flame__dur">{formatDuration(span.durationMs)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
