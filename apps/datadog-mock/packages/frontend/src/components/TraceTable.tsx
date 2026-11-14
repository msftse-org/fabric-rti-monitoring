import { useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TraceSpan } from '@telemetry';
import { formatDuration } from '@telemetry';
import { serviceSelfTimes } from '../lib/derive';
import { serviceColor } from '../lib/palette';
import { formatStampMs } from '../lib/time';
import type { TraceRow } from '../lib/window';
import { ServiceTag } from './ui';

export type TraceSortKey = 'date' | 'duration' | 'spans';

interface Props {
  rows: TraceRow[];
  total: number;
  spans: Record<string, TraceSpan[]>;
  sort: { key: TraceSortKey; dir: 1 | -1 };
  onSort: (key: TraceSortKey) => void;
  onOpen: (traceId: string) => void;
  onLoadMore?: () => void;
}

interface Breakdown {
  name: string;
  share: number;
}

function breakdownOf(spans: TraceSpan[] | undefined): Breakdown[] {
  if (!spans?.length) return [];
  const self = serviceSelfTimes(spans);
  const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
  return [...self.entries()].map(([name, ms]) => ({ name, share: ms / total })).sort((a, b) => b.share - a.share);
}

export function TraceTable({ rows, total, spans, sort, onSort, onOpen, onLoadMore }: Props) {
  const maxDuration = useMemo(() => Math.max(1, ...rows.map((row) => row.durationMs)), [rows]);
  const breakdowns = useMemo(() => new Map(rows.map((row) => [row.traceId, breakdownOf(spans[row.traceId])])), [rows, spans]);
  const header = (key: TraceSortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => onSort(key)}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="tracetable scroll-x">
      <table className="table tracetable__table">
        <thead>
          <tr>
            <th className="tracetable__bar-col" />
            {header('date', 'Date')}
            <th>Service</th>
            <th>Resource</th>
            {header('duration', 'Duration')}
            {header('spans', 'Spans', 'num')}
            <th>Status</th>
            <th>Latency breakdown</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const parts = breakdowns.get(row.traceId) ?? [];
            const failed = row.status === 'error';
            return (
              <tr
                key={row.traceId}
                className="row-link"
                tabIndex={0}
                onClick={() => onOpen(row.traceId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpen(row.traceId);
                }}
              >
                <td className="tracetable__bar-col">
                  <span className="sev-bar" style={{ background: failed ? 'var(--sev-error)' : 'var(--sev-info)', height: 36 }} />
                </td>
                <td className="mono tracetable__date">{formatStampMs(row.ms)}</td>
                <td>
                  <ServiceTag name={row.rootService} />
                </td>
                <td className="mono">{row.rootName}</td>
                <td>
                  <span className="tracetable__dur">
                    <span className="tracetable__dur-bar" style={{ width: `${Math.max(2, (row.durationMs / maxDuration) * 100)}%`, background: failed ? 'var(--sev-error)' : 'var(--chart-hits)' }} />
                    <span className="tracetable__dur-val">{formatDuration(row.durationMs)}</span>
                  </span>
                </td>
                <td className="num">{row.spanCount}</td>
                <td>
                  <span className={`chip ${failed ? 'chip--light-error' : 'chip--soft'}`}>{failed ? 'Error' : 'Ok'}</span>
                </td>
                <td>
                  <span className="tracetable__breakdown" role="img" aria-label={parts.map((part) => `${part.name} ${(part.share * 100).toFixed(0)}%`).join(', ') || 'No span data'}>
                    {parts.map((part) => (
                      <span key={part.name} title={`${part.name} ${(part.share * 100).toFixed(0)}%`} style={{ width: `${part.share * 100}%`, background: serviceColor(part.name) }} />
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length < total && onLoadMore && (
        <div className="tracetable__more">
          <button type="button" className="btn" onClick={onLoadMore}>
            Load more ({(total - rows.length).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
