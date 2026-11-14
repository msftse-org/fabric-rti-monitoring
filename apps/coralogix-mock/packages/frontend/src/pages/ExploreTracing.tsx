import { Download, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDuration, type TraceSummary } from '@telemetry';
import { Legend } from '../charts/Legend';
import { StackedBars } from '../charts/StackedBars';
import { Card } from '../components/Card';
import { Chip } from '../components/Chips';
import { Segmented, Switch } from '../components/Controls';
import { DataTable, type Column } from '../components/DataTable';
import { DropdownMenu } from '../components/DropdownMenu';
import { ExploreHeader } from '../components/ExploreHeader';
import { LoadMore } from '../components/LoadMore';
import { QueryBar } from '../components/QueryBar';
import type { SavedView } from '../components/SavedViewsMenu';
import { EmptyState } from '../components/States';
import { downloadCsv } from '../lib/csv';
import { useData } from '../lib/data';
import { spanHaystack, spanResolver, type SpanRow } from '../lib/fields';
import { shortId } from '../lib/format';
import { histogram } from '../lib/histogram';
import { usePaging } from '../lib/paging';
import { compileQuery } from '../lib/query';
import { navigate, paths } from '../lib/router';
import { SERIES } from '../lib/palette';
import { useSpanRows } from '../lib/spans';
import { chooseBucketMs, formatTick, formatTimestamp } from '../lib/time';

type Tab = 'spans' | 'traces';

export const SPAN_VIEWS: SavedView[] = [
  { id: 'failed', label: 'Failed spans', query: 'status:error' },
  { id: 'slow', label: 'Slow spans (over 500ms)', query: 'durationMs:>500' },
  { id: 'db', label: 'Database calls', query: 'kind:client' },
  { id: 'checkout', label: 'Checkout path', query: 'scenario:checkout' },
  { id: 'payment-errors', label: 'Payment errors', query: 'service:payment AND status:error' },
];

const KINDS = ['server', 'client', 'internal', 'producer', 'consumer'];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function StatusChip({ status }: { status: string }) {
  return <Chip tone={status === 'error' ? 'bad' : status === 'ok' ? 'ok' : 'neutral'}>{status === 'unset' ? 'Unset' : status === 'ok' ? 'OK' : 'Error'}</Chip>;
}

const SPAN_COLUMNS: Column<SpanRow>[] = [
  { id: 'time', title: 'Timestamp', label: 'Timestamp', width: 190, render: (row) => <span className="mono">{formatTimestamp(row.startMs)}</span> },
  { id: 'name', title: 'Operation', label: 'Operation', render: (row) => <span className="mono">{row.span.name}</span> },
  { id: 'kind', title: 'Span kind', label: 'Span kind', render: (row) => <Chip>{capitalize(row.span.kind)}</Chip> },
  { id: 'service', title: 'Subsystem', label: 'Subsystem', render: (row) => row.span.service },
  { id: 'resource', title: 'Resource', label: 'Resource', render: (row) => row.span.scenario },
  { id: 'duration', title: 'Duration', label: 'Duration', align: 'right', render: (row) => formatDuration(row.span.durationMs) },
  { id: 'status', title: 'Status', label: 'Status', render: (row) => <StatusChip status={row.span.status} /> },
];

const TRACE_COLUMNS: Column<TraceSummary>[] = [
  { id: 'time', title: 'Timestamp', label: 'Timestamp', width: 190, render: (trace) => <span className="mono">{formatTimestamp(Date.parse(trace.start))}</span> },
  { id: 'name', title: 'Operation', label: 'Operation', render: (trace) => <span className="mono">{trace.rootName}</span> },
  { id: 'id', title: 'Trace ID', label: 'Trace ID', render: (trace) => <span className="mono muted">{shortId(trace.traceId, 12)}</span> },
  {
    id: 'services',
    title: 'Services',
    label: 'Services',
    render: (trace) => (
      <span className="chip-group">
        {trace.services.map((service) => (
          <Chip key={service}>{service}</Chip>
        ))}
      </span>
    ),
  },
  { id: 'spans', title: 'Spans', label: 'Spans', align: 'right', render: (trace) => trace.spanCount },
  { id: 'errors', title: 'Errors', label: 'Errors', align: 'right', render: (trace) => trace.errorCount },
  { id: 'duration', title: 'Duration', label: 'Duration', align: 'right', render: (trace) => formatDuration(trace.durationMs) },
  { id: 'status', title: 'Status', label: 'Status', render: (trace) => <StatusChip status={trace.status} /> },
];

interface Bucket {
  from: number;
  to: number;
}

export function ExploreTracing({ query }: { query: string }) {
  const { bundle, win, range } = useData();
  const { environment } = bundle;
  const spanRows = useSpanRows();
  const [tab, setTab] = useState<Tab>('spans');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const [draft, setDraft] = useState(query);
  const [bucket, setBucket] = useState<Bucket | null>(null);

  useEffect(() => setDraft(query), [query]);

  const go = useCallback((next: string) => {
    setBucket(null);
    navigate(paths.tracing(next));
  }, []);

  const compiled = useMemo(() => compileQuery(query), [query]);
  const matched = useMemo(
    () =>
      compiled.ok
        ? spanRows.filter((row) => (!errorsOnly || row.span.status === 'error') && (!kind || row.span.kind === kind) && compiled.test(spanResolver(row, environment), spanHaystack(row)))
        : [],
    [spanRows, compiled, errorsOnly, kind, environment],
  );

  const bucketMs = useMemo(() => chooseBucketMs(range.endMs - range.startMs), [range]);
  const bars = useMemo(() => histogram(matched, range, bucketMs, 2, (row) => ({ t: row.startMs, series: row.span.status === 'error' ? 1 : 0 })), [matched, range, bucketMs]);
  const series = [
    { key: 'count', label: 'Count', color: SERIES.ok },
    { key: 'error', label: 'Error', color: SERIES.errorLog },
  ];

  const inBucket = useCallback((t: number) => !bucket || (t >= bucket.from && t < bucket.to), [bucket]);
  const spans = useMemo(() => matched.filter((row) => inBucket(row.startMs)), [matched, inBucket]);
  const traces = useMemo(() => {
    const ids = new Set(spans.map((row) => row.trace.traceId));
    return win.traces.filter((trace) => ids.has(trace.traceId)).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  }, [spans, win.traces]);

  const spanPaging = usePaging(spans);
  const tracePaging = usePaging(traces);

  const exportCsv = () =>
    tab === 'spans'
      ? downloadCsv('spans.csv', ['timestamp', 'traceId', 'spanId', 'name', 'kind', 'service', 'scenario', 'durationMs', 'status'], spans.map((row) => [new Date(row.startMs).toISOString(), row.trace.traceId, row.span.spanId, row.span.name, row.span.kind, row.span.service, row.span.scenario, row.span.durationMs, row.span.status]))
      : downloadCsv('traces.csv', ['start', 'traceId', 'rootName', 'services', 'spanCount', 'errorCount', 'durationMs', 'status'], traces.map((trace) => [trace.start, trace.traceId, trace.rootName, trace.services.join(' '), trace.spanCount, trace.errorCount, trace.durationMs, trace.status]));

  const current = tab === 'spans' ? spans.length : traces.length;

  return (
    <div className="page">
      <ExploreHeader dataset="tracing" views={SPAN_VIEWS} query={query} onPickView={go} onReset={() => go('')} />
      <div className="explorer">
        <QueryBar
          value={draft}
          onChange={setDraft}
          onRun={() => go(draft)}
          error={compiled.ok ? null : compiled.error}
          ariaLabel="Lucene query"
          placeholder="Search spans, e.g. service:payment AND status:error"
          leading={
            <>
              <Switch checked={errorsOnly} onChange={setErrorsOnly} label="Errors" />
              <DropdownMenu
                ariaLabel="Span kind filter"
                triggerClassName="select-btn"
                trigger={<>{kind ? capitalize(kind) : 'All kinds'}</>}
                items={[
                  { id: 'all', label: 'All kinds', selected: kind === null, onSelect: () => setKind(null) },
                  ...KINDS.filter((candidate) => spanRows.some((row) => row.span.kind === candidate)).map((candidate) => ({
                    id: candidate,
                    label: capitalize(candidate),
                    selected: kind === candidate,
                    onSelect: () => setKind(candidate),
                  })),
                ]}
              />
            </>
          }
        />

        <Card title="Count Spans over time" meta={`${Math.round(bucketMs / 1000)}s buckets · from ${win.traces.length} sampled traces`} bare>
          <StackedBars
            ariaLabel="Count of spans over time"
            series={series}
            bars={bars}
            bucketMs={bucketMs}
            height={170}
            onBarClick={(index) => {
              const from = bars[index].t;
              setBucket((existing) => (existing?.from === from ? null : { from, to: from + bucketMs }));
            }}
          />
          <Legend items={series.map((item) => ({ label: item.label, color: item.color }))} />
        </Card>

        <section className="panel results">
          <header className="results-head">
            <Segmented<Tab>
              ariaLabel="Result type"
              value={tab}
              onChange={setTab}
              options={[
                { id: 'spans', label: 'Spans', count: spans.length },
                { id: 'traces', label: 'Traces', count: traces.length },
              ]}
            />
            {bucket && (
              <button type="button" className="filter-chip" onClick={() => setBucket(null)} aria-label="Clear time bucket filter">
                {formatTick(bucket.from, bucketMs < 60_000)} – {formatTick(bucket.to, bucketMs < 60_000)} <X size={12} aria-hidden />
              </button>
            )}
            <span className="card-spacer" />
            <button type="button" className="link-btn" onClick={exportCsv} disabled={current === 0}>
              <Download size={13} aria-hidden /> Export
            </button>
          </header>
          <p className="note">Spans come from the traces kept in the telemetry bundle: the newest traces plus the failed and slowest ones, so errors are over-represented.</p>
          {current === 0 ? (
            <EmptyState title={tab === 'spans' ? 'No spans match this query' : 'No traces match this query'} hint="Adjust the query, switch off the Errors filter or widen the time range." />
          ) : tab === 'spans' ? (
            <>
              <DataTable
                ariaLabel="Spans"
                className="logs-table"
                columns={SPAN_COLUMNS}
                rows={spanPaging.visible}
                rowKey={(row) => `${row.trace.traceId}/${row.span.spanId}`}
                onRowActivate={(row) => navigate(paths.trace(row.trace.traceId, row.span.spanId))}
                rowClassName={(row) => (row.span.status === 'error' ? 'is-error-row' : undefined)}
              />
              <LoadMore shown={spanPaging.visible.length} total={spanPaging.total} onMore={spanPaging.more} noun="spans" />
            </>
          ) : (
            <>
              <DataTable
                ariaLabel="Traces"
                className="logs-table"
                columns={TRACE_COLUMNS}
                rows={tracePaging.visible}
                rowKey={(trace) => trace.traceId}
                onRowActivate={(trace) => navigate(paths.trace(trace.traceId))}
                rowClassName={(trace) => (trace.status === 'error' ? 'is-error-row' : undefined)}
              />
              <LoadMore shown={tracePaging.visible.length} total={tracePaging.total} onMore={tracePaging.more} noun="traces" />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
