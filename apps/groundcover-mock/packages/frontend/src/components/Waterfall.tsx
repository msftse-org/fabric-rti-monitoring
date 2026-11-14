import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDuration, type TraceSpan } from '@telemetry';
import type { SpanTree } from '../lib/traceTree';

interface WaterfallProps {
  rows: TraceSpan[];
  tree: SpanTree;
  total: number;
  selectedId: string | null;
  collapsed: ReadonlySet<string>;
  onSelect: (spanId: string) => void;
  onToggle: (spanId: string) => void;
}

const TICKS = [0, 0.25, 0.5, 0.75, 1];

export function Waterfall({ rows, tree, total, selectedId, collapsed, onSelect, onToggle }: WaterfallProps) {
  return (
    <div className="waterfall" role="tree" aria-label="Span waterfall">
      <div className="waterfall__header">
        <div className="waterfall__name">Resource</div>
        <div className="waterfall__scale">
          {TICKS.map((tick) => (
            <span key={tick} style={{ left: `${tick * 100}%` }}>{formatDuration(total * tick)}</span>
          ))}
        </div>
      </div>
      {rows.map((span) => {
        const level = tree.depth.get(span.spanId) ?? 0;
        const children = tree.descendants.get(span.spanId) ?? 0;
        const left = (span.offsetMs / total) * 100;
        const width = Math.max(0.5, (span.durationMs / total) * 100);
        const failed = span.status === 'error';
        const labelInside = width > 22;
        return (
          <div
            key={span.spanId}
            role="treeitem"
            aria-level={level + 1}
            aria-selected={span.spanId === selectedId}
            aria-expanded={children > 0 ? !collapsed.has(span.spanId) : undefined}
            tabIndex={0}
            className={`waterfall__row${span.spanId === selectedId ? ' waterfall__row--selected' : ''}`}
            onClick={() => onSelect(span.spanId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(span.spanId);
              } else if (event.key === 'ArrowLeft' && children > 0 && !collapsed.has(span.spanId)) onToggle(span.spanId);
              else if (event.key === 'ArrowRight' && collapsed.has(span.spanId)) onToggle(span.spanId);
            }}
          >
            <div className="waterfall__name" style={{ paddingLeft: 8 + level * 16 }}>
              {children > 0 ? (
                <button type="button" className="waterfall__toggle" aria-label={`${collapsed.has(span.spanId) ? 'Expand' : 'Collapse'} ${children} child spans`} onClick={(event) => { event.stopPropagation(); onToggle(span.spanId); }}>
                  {collapsed.has(span.spanId) ? <ChevronRight size={11} aria-hidden="true" /> : <ChevronDown size={11} aria-hidden="true" />}
                  {children}
                </button>
              ) : <span className="waterfall__leaf" aria-hidden="true" />}
              <span className="waterfall__text">
                <span className="mono">{span.name}</span>
                <small>{span.service}{span.kind === 'client' ? ' · client' : ''}</small>
              </span>
            </div>
            <div className="waterfall__track">
              <div className={`waterfall__bar${failed ? ' waterfall__bar--error' : ''}`} style={{ left: `${left}%`, width: `${width}%` }}>
                {labelInside && <span>{formatDuration(span.durationMs)}</span>}
              </div>
              {!labelInside && (
                <span className="waterfall__dur" style={left > 70 ? { right: `${100 - left}%`, marginRight: 4 } : { left: `${left + width}%`, marginLeft: 4 }}>
                  {formatDuration(span.durationMs)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
