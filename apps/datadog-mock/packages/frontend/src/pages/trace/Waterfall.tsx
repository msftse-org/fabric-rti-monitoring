import { useMemo } from 'react';
import { ChevronDown, ChevronRight, CircleAlert } from 'lucide-react';
import { formatDuration } from '@telemetry';
import { spanService } from '../../lib/derive';
import { buildTree, countDescendants, flatten } from '../../lib/tracesModel';
import { ServiceDot } from '../../components/ui';
import { colorOf, place, TickGrid, TimeRuler, type SpanViewProps } from './shared';

interface Props extends SpanViewProps {
  collapsed: ReadonlySet<string>;
  onToggle: (spanId: string) => void;
}

export function Waterfall({ spans, range, colorBy, selected, faded, onSelect, onZoom, onHover, collapsed, onToggle }: Props) {
  const tree = useMemo(() => buildTree(spans), [spans]);
  const rows = useMemo(() => flatten(tree, collapsed), [tree, collapsed]);
  const total = range.to - range.from;

  return (
    <div className="wf scroll-x" role="treegrid" aria-label="Trace waterfall">
      <div className="wf__inner">
        <div className="wf__head">
          <div className="wf__cell wf__cell--name">Service · Resource</div>
          <div className="wf__cell wf__cell--bars">
            <TimeRuler range={range} />
          </div>
        </div>
        <div className="wf__body">
          {rows.map(({ node, depth }) => {
            const { span } = node;
            const box = place(span, range);
            const closed = collapsed.has(span.spanId);
            const service = spanService(span);
            return (
              <div
                key={span.spanId}
                role="row"
                className="wf__row"
                data-selected={span.spanId === selected}
                data-faded={faded(span)}
                onClick={() => onSelect(span.spanId)}
                onDoubleClick={() => onZoom(span)}
                onPointerMove={(event) => onHover({ span, x: event.clientX, y: event.clientY })}
                onPointerLeave={() => onHover(null)}
              >
                <div className="wf__cell wf__cell--name" role="gridcell" style={{ paddingLeft: 8 + depth * 14 }}>
                  {node.children.length ? (
                    <button
                      type="button"
                      className="wf__caret"
                      aria-label={`${closed ? 'Expand' : 'Collapse'} ${span.name}`}
                      aria-expanded={!closed}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggle(span.spanId);
                      }}
                    >
                      {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                  ) : (
                    <span className="wf__caret" />
                  )}
                  <ServiceDot name={service} />
                  <b className="wf__service">{service}</b>
                  <span className="wf__op truncate">{span.name}</span>
                  {closed && <span className="wf__count">+{countDescendants(node)}</span>}
                  {span.status === 'error' && <CircleAlert size={13} className="wf__err" aria-label="Error" />}
                </div>
                <div className="wf__cell wf__cell--bars" role="gridcell">
                  <TickGrid range={range} />
                  {box && (
                    <span className="wf__bar" style={{ left: `${box.left}%`, width: `${box.width}%`, background: colorOf(span, colorBy) }}>
                      {box.width > 18 && <span className="wf__bar-dur">{formatDuration(span.durationMs)}</span>}
                    </span>
                  )}
                  {box && box.width <= 18 && (
                    <span className="wf__outside" style={box.left > 70 ? { right: `${100 - box.left + 0.6}%` } : { left: `${box.left + box.width + 0.6}%` }}>
                      {formatDuration(span.durationMs)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="wf__foot muted">
          {rows.length} of {spans.length} spans shown · trace duration {formatDuration(total)}
        </div>
      </div>
    </div>
  );
}
