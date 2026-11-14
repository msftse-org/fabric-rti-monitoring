import { formatDuration, type TraceSpan } from '@telemetry';
import { serviceColor } from '../../lib/palette';

interface FlameProps {
  spans: TraceSpan[];
  totalMs: number;
  selectedId: string | null;
  onSelect: (spanId: string) => void;
}

export function Flame({ spans, totalMs, selectedId, onSelect }: FlameProps) {
  const rows = Math.max(0, ...spans.map((span) => span.depth)) + 1;
  return (
    <div className="flame" style={{ height: rows * 26 + 8 }} role="group" aria-label="Flame graph of the trace">
      {spans.map((span) => (
        <button
          key={span.spanId}
          type="button"
          className={`flame-cell${span.status === 'error' ? ' is-error' : ''}${span.spanId === selectedId ? ' is-selected' : ''}`}
          style={{ top: span.depth * 26 + 4, left: `${(span.offsetMs / totalMs) * 100}%`, width: `${Math.max(0.4, (span.durationMs / totalMs) * 100)}%`, background: serviceColor(span.service) }}
          title={`${span.service} · ${span.name} · ${formatDuration(span.durationMs)}`}
          aria-label={`${span.name}, ${span.service}, ${formatDuration(span.durationMs)}`}
          onClick={() => onSelect(span.spanId)}
        >
          {span.name}
        </button>
      ))}
    </div>
  );
}
