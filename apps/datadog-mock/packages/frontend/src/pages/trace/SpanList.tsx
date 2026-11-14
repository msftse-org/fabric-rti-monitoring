import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TraceSpan } from '@telemetry';
import { formatDuration } from '@telemetry';
import { selfTimes, spanService } from '../../lib/derive';
import { ServiceTag } from '../../components/ui';

type SortKey = 'start' | 'duration' | 'self' | 'service';

interface Props {
  spans: TraceSpan[];
  total: number;
  selected: string;
  faded: (span: TraceSpan) => boolean;
  onSelect: (spanId: string) => void;
}

export function SpanList({ spans, total, selected, faded, onSelect }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'start', dir: 1 });
  const self = useMemo(() => selfTimes(spans), [spans]);
  const rows = useMemo(() => {
    const value = (span: TraceSpan): number | string => (sort.key === 'start' ? span.offsetMs : sort.key === 'duration' ? span.durationMs : sort.key === 'self' ? self[span.spanId] : spanService(span));
    return spans
      .filter((span) => !faded(span))
      .sort((a, b) => {
        const left = value(a);
        const right = value(b);
        return (typeof left === 'string' ? left.localeCompare(String(right)) : (left as number) - (right as number)) * sort.dir || a.offsetMs - b.offsetMs;
      });
  }, [spans, self, sort, faded]);

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => setSort((current) => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : key === 'service' || key === 'start' ? 1 : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="scroll-x spanlist">
      <table className="table">
        <thead>
          <tr>
            {header('service', 'Service')}
            <th>Resource</th>
            <th>Kind</th>
            {header('start', 'Start', 'num')}
            {header('duration', 'Duration', 'num')}
            {header('self', 'Exec time', 'num')}
            <th>% of trace</th>
            <th>Status</th>
            <th>Pod</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((span) => (
            <tr
              key={span.spanId}
              className="row-link"
              tabIndex={0}
              aria-selected={span.spanId === selected}
              data-selected={span.spanId === selected}
              onClick={() => onSelect(span.spanId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSelect(span.spanId);
              }}
            >
              <td>
                <ServiceTag name={spanService(span)} />
              </td>
              <td className="mono">{span.name}</td>
              <td>{span.kind}</td>
              <td className="num mono">+{formatDuration(span.offsetMs)}</td>
              <td className="num mono">{formatDuration(span.durationMs)}</td>
              <td className="num mono">{formatDuration(self[span.spanId])}</td>
              <td>
                <span className="spanlist__pct">
                  <span style={{ width: `${Math.min(100, (span.durationMs / total) * 100)}%` }} />
                </span>
              </td>
              <td>
                <span className={`chip ${span.status === 'error' ? 'chip--light-error' : 'chip--soft'}`}>{span.status === 'unset' ? 'unset' : span.status === 'error' ? 'Error' : 'Ok'}</span>
              </td>
              <td className="mono muted">{span.pod}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
