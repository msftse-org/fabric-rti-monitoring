import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { formatDuration } from '@telemetry';
import { serviceColor } from '../../lib/palette';
import type { TreeRow } from '../../lib/traceTree';

interface GanttProps {
  rows: TreeRow[];
  totalMs: number;
  selectedId: string | null;
  onSelect: (spanId: string) => void;
  onToggle: (spanId: string) => void;
}

const TICKS = [0, 0.25, 0.5, 0.75, 1];

function statusLabel(status: string): string {
  return status === 'error' ? 'ERR' : status === 'ok' ? 'OK' : 'UNSET';
}

export function Gantt({ rows, totalMs, selectedId, onSelect, onToggle }: GanttProps) {
  const tree = useRef<HTMLDivElement>(null);

  const move = (index: number) => {
    const target = rows[Math.min(rows.length - 1, Math.max(0, index))];
    if (!target) return;
    onSelect(target.span.spanId);
    tree.current?.querySelector<HTMLElement>(`[data-span="${target.span.spanId}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number, row: TreeRow) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(index - 1);
        break;
      case 'ArrowLeft':
        if (row.hasChildren && !row.collapsed) {
          event.preventDefault();
          onToggle(row.span.spanId);
        }
        break;
      case 'ArrowRight':
        if (row.hasChildren && row.collapsed) {
          event.preventDefault();
          onToggle(row.span.spanId);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(row.span.spanId);
        break;
    }
  };

  return (
    <div className="gantt" role="tree" aria-label="Trace spans" ref={tree}>
      <div className="gantt-head" role="presentation">
        <div className="gantt-head-name">Name</div>
        <div className="gantt-ruler">
          {TICKS.map((tick) => (
            <span key={tick} style={{ left: `${tick * 100}%` }} className={tick === 1 ? 'is-last' : undefined}>
              {formatDuration(totalMs * tick)}
            </span>
          ))}
        </div>
      </div>
      {rows.map((row, index) => {
        const { span } = row;
        const left = (span.offsetMs / totalMs) * 100;
        const width = Math.max(0.4, (span.durationMs / totalMs) * 100);
        const share = (span.durationMs / totalMs) * 100;
        const labelInside = width > 22;
        const labelOnLeft = !labelInside && left + width > 72;
        const label = `${formatDuration(span.durationMs)} (${share.toFixed(share >= 10 ? 1 : 2)}%)`;
        return (
          <div
            key={span.spanId}
            className={`gantt-row${span.status === 'error' ? ' is-error' : ''}${span.spanId === selectedId ? ' is-selected' : ''}`}
            role="treeitem"
            data-span={span.spanId}
            aria-level={row.depth + 1}
            aria-selected={span.spanId === selectedId}
            aria-expanded={row.hasChildren ? !row.collapsed : undefined}
            tabIndex={span.spanId === selectedId ? 0 : -1}
            onClick={() => onSelect(span.spanId)}
            onKeyDown={(event) => onKeyDown(event, index, row)}
          >
            <div className="gantt-name" style={{ paddingLeft: 8 + row.depth * 16 }}>
              {row.hasChildren ? (
                <button
                  type="button"
                  className="gantt-toggle"
                  tabIndex={-1}
                  aria-label={`${row.collapsed ? 'Expand' : 'Collapse'} ${span.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(span.spanId);
                  }}
                >
                  {row.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : (
                <span className="gantt-toggle" aria-hidden />
              )}
              <span className={`gantt-status gantt-status--${span.status}`}>{statusLabel(span.status)}</span>
              <span className="gantt-dot" style={{ background: serviceColor(span.service) }} aria-hidden />
              <span className="gantt-op" title={`${span.service} · ${span.name}`}>
                {span.name}
              </span>
              <span className="gantt-svc">{span.service}</span>
            </div>
            <div className="gantt-track">
              <div className="gantt-bar" style={{ left: `${left}%`, width: `${width}%`, background: serviceColor(span.service) }}>
                {labelInside && <span className="gantt-label">{label}</span>}
              </div>
              {!labelInside && (
                <span className="gantt-label gantt-label--out" style={labelOnLeft ? { right: `${100 - left}%` } : { left: `${left + width}%` }}>
                  {label}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
