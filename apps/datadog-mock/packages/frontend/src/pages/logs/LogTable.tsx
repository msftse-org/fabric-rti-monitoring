import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatDuration } from '@telemetry';
import { severityColor } from '../../lib/palette';
import { fieldValue } from '../../lib/logsModel';
import { formatStampMs } from '../../lib/time';
import type { LogRow } from '../../lib/window';
import { ServiceTag } from '../../components/ui';

export type ColumnId = 'pod' | 'version' | 'scenario' | 'outcome' | 'duration' | 'trace_id';

export const OPTIONAL_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'pod', label: 'Pod' },
  { id: 'version', label: 'Version' },
  { id: 'scenario', label: 'Scenario' },
  { id: 'outcome', label: 'Outcome' },
  { id: 'duration', label: 'Duration' },
  { id: 'trace_id', label: 'Trace ID' },
];

interface Props {
  rows: LogRow[];
  total: number;
  env: string;
  selectedId: string | null;
  fresh: ReadonlySet<string>;
  columns: ColumnId[];
  ascending: boolean;
  onSort: () => void;
  onSelect: (id: string) => void;
  onMove: (delta: number) => void;
  onLoadMore: () => void;
}

function cell(log: LogRow, id: ColumnId, env: string): string {
  switch (id) {
    case 'duration':
      return log.durationMs === null ? '–' : formatDuration(log.durationMs);
    case 'trace_id':
      return log.traceId;
    default:
      return fieldValue(log, id, env);
  }
}

export function LogTable({ rows, total, env, selectedId, fresh, columns, ascending, onSort, onSelect, onMove, onLoadMore }: Props) {
  const selectedRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      onMove(event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  const extras = OPTIONAL_COLUMNS.filter((column) => columns.includes(column.id));

  return (
    <div className="logtable-wrap" onKeyDown={onKeyDown}>
      <table className="logtable">
        <thead>
          <tr>
            <th className="logtable__bar" aria-label="Status" />
            <th className="logtable__date">
              <button type="button" className="th-sort" onClick={onSort} aria-label={`Sort by date ${ascending ? 'newest first' : 'oldest first'}`}>
                Date (UTC) {ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              </button>
            </th>
            <th className="logtable__host">Host</th>
            <th className="logtable__service">Service</th>
            {extras.map((column) => (
              <th key={column.id} className="logtable__extra">{column.label}</th>
            ))}
            <th>Content</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((log) => {
            const selected = log.id === selectedId;
            return (
              <tr
                key={log.id}
                ref={selected ? selectedRef : undefined}
                tabIndex={0}
                aria-selected={selected}
                data-fresh={fresh.has(log.id) || undefined}
                className={selected ? 'is-selected' : undefined}
                onClick={() => onSelect(log.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(log.id);
                  }
                }}
              >
                <td className="logtable__bar">
                  <span className="sev-bar" style={{ background: severityColor(log.severity) }} title={log.severity} />
                </td>
                <td className="logtable__date mono">{formatStampMs(log.ms)}</td>
                <td className="logtable__host truncate" title={log.node}>
                  {log.node}
                </td>
                <td className="logtable__service">
                  <ServiceTag name={log.service} />
                </td>
                {extras.map((column) => (
                  <td key={column.id} className="mono truncate">
                    {cell(log, column.id, env)}
                  </td>
                ))}
                <td className="logtable__content mono">
                  <span className="logmsg">{log.body}</span>
                  <span className="logattrs">
                    {' '}
                    scenario:{log.scenario} outcome:{log.outcome}
                    {log.durationMs !== null && ` duration:${formatDuration(log.durationMs)}`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length < total && (
        <div className="logtable__more">
          <button type="button" className="btn" onClick={onLoadMore}>
            Load more ({(total - rows.length).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
