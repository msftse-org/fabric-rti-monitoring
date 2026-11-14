import { useMemo } from 'react';
import { formatDuration } from '@telemetry';
import { Chip } from '../../components/Chips';
import { DataTable, useSortedRows, type Column } from '../../components/DataTable';
import { LoadMore } from '../../components/LoadMore';
import { EmptyState } from '../../components/States';
import type { SpanRow } from '../../lib/fields';
import { usePaging } from '../../lib/paging';
import { href, navigate, paths } from '../../lib/router';
import { useSpanRows } from '../../lib/spans';
import { shortId } from '../../lib/format';
import { formatTimestamp } from '../../lib/time';
import type { ServiceTabProps } from './types';

const COLUMNS: Column<SpanRow>[] = [
  { id: 'time', title: 'Timestamp', label: 'Timestamp', sortValue: (row) => row.startMs, render: (row) => <span className="mono">{formatTimestamp(row.startMs)}</span> },
  { id: 'name', title: 'Operation', label: 'Operation', sortValue: (row) => row.span.name, render: (row) => <span className="mono">{row.span.name}</span> },
  { id: 'scenario', title: 'Resource', label: 'Resource', sortValue: (row) => row.span.scenario, render: (row) => <Chip>{row.span.scenario}</Chip> },
  { id: 'duration', title: 'Duration', label: 'Duration', align: 'right', sortValue: (row) => row.span.durationMs, render: (row) => formatDuration(row.span.durationMs) },
  { id: 'status', title: 'Status', label: 'Status', render: () => <Chip tone="bad">Error</Chip> },
  {
    id: 'trace',
    title: 'Trace ID',
    label: 'Trace ID',
    render: (row) => (
      <a className="mono" href={href(paths.trace(row.trace.traceId, row.span.spanId))} onClick={(event) => event.stopPropagation()}>
        {shortId(row.trace.traceId, 12)}
      </a>
    ),
  },
];

export function ApiErrors({ service, filters }: ServiceTabProps) {
  const spanRows = useSpanRows();
  const rows = useMemo(
    () => spanRows.filter((row) => row.span.service === service.name && row.span.status === 'error' && (!filters.transaction || row.span.scenario === filters.transaction)),
    [spanRows, service.name, filters.transaction],
  );
  const { sorted, sort, onSort } = useSortedRows(rows, COLUMNS, { id: 'time', dir: 'desc' });
  const paging = usePaging(sorted);

  return (
    <section className="panel tab-panel">
      <p className="note">Error spans of {service.name} found in the sampled traces of the bundle (newest, failed and slowest traces).</p>
      {sorted.length === 0 || filters.statusCode === 'ok' ? (
        <EmptyState title="No error spans" hint="This service reported no failed spans in the selected window." />
      ) : (
        <>
          <DataTable
            ariaLabel={`API errors of ${service.name}`}
            columns={COLUMNS}
            rows={paging.visible}
            rowKey={(row) => row.span.spanId}
            sort={sort}
            onSort={onSort}
            onRowActivate={(row) => navigate(paths.trace(row.trace.traceId, row.span.spanId))}
          />
          <LoadMore shown={paging.visible.length} total={paging.total} onMore={paging.more} noun="error spans" />
        </>
      )}
    </section>
  );
}
