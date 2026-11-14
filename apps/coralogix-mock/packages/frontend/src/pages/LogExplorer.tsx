import { Download, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDuration, type LogEntry, type Severity } from '@telemetry';
import { Legend } from '../charts/Legend';
import { StackedBars, type BarSeries } from '../charts/StackedBars';
import { Card } from '../components/Card';
import { Chip } from '../components/Chips';
import { DataTable, type Column } from '../components/DataTable';
import { DropdownMenu } from '../components/DropdownMenu';
import { LoadMore } from '../components/LoadMore';
import { QueryBar } from '../components/QueryBar';
import { EmptyState } from '../components/States';
import { downloadCsv } from '../lib/csv';
import { useData } from '../lib/data';
import { logHaystack, logResolver } from '../lib/fields';
import { histogram } from '../lib/histogram';
import { usePaging } from '../lib/paging';
import { appendClause, compileQuery } from '../lib/query';
import { SEVERITIES, severityColor, severityLabel } from '../lib/severity';
import { chooseBucketMs, formatTick, formatTimestamp } from '../lib/time';
import { LogDrawer } from './LogDrawer';

export interface LogScope {
  service?: string;
  scenario?: string | null;
  /** `success` or `error`. */
  outcome?: string | null;
}

interface LogExplorerProps {
  query: string;
  onApply: (query: string) => void;
  scope?: LogScope;
  placeholder?: string;
}

interface BucketSelection {
  from: number;
  to: number;
}

const COLUMNS: Column<LogEntry>[] = [
  {
    id: 'severity',
    title: 'Severity',
    label: <span className="visually-hidden">Severity</span>,
    width: 28,
    render: (log) => <i className="sev-dot" style={{ background: severityColor(log.severity) }} title={log.severity} />,
  },
  { id: 'time', title: 'Timestamp', label: 'Timestamp', width: 190, render: (log) => <span className="mono">{formatTimestamp(Date.parse(log.ts))}</span> },
  {
    id: 'content',
    title: 'Content',
    label: 'Content',
    render: (log) => (
      <span className="log-content">
        <span className={log.severity === 'ERROR' || log.severity === 'FATAL' ? 'log-body is-error' : 'log-body'}>{log.body}</span>
        {log.spanName && <span className="tag">{log.spanName}</span>}
        {log.durationMs !== null && <span className="tag">{formatDuration(log.durationMs)}</span>}
      </span>
    ),
  },
  { id: 'subsystem', title: 'Subsystem', label: 'Subsystem', render: (log) => log.service },
  { id: 'resource', title: 'Resource', label: 'Resource', render: (log) => <Chip>{log.scenario}</Chip> },
  { id: 'outcome', title: 'Outcome', label: 'Outcome', render: (log) => <Chip tone={log.outcome === 'error' ? 'bad' : 'ok'}>{log.outcome}</Chip> },
  { id: 'pod', title: 'Pod', label: 'Pod', render: (log) => <span className="mono muted">{log.pod}</span> },
];

export function LogExplorer({ query, onApply, scope, placeholder = 'Search logs, e.g. service:checkout AND severity:ERROR' }: LogExplorerProps) {
  const { bundle, win, range } = useData();
  const { environment } = bundle;
  const [draft, setDraft] = useState(query);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [bucket, setBucket] = useState<BucketSelection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => setDraft(query), [query]);

  const compiled = useMemo(() => compileQuery(query), [query]);
  const scopeService = scope?.service;
  const scopeScenario = scope?.scenario;
  const scopeOutcome = scope?.outcome;

  const scoped = useMemo(
    () =>
      win.logs.filter(
        (log) =>
          (!scopeService || log.service === scopeService) &&
          (!scopeScenario || log.scenario === scopeScenario) &&
          (!scopeOutcome || log.outcome === scopeOutcome),
      ),
    [win.logs, scopeService, scopeScenario, scopeOutcome],
  );

  const matched = useMemo(
    () => (compiled.ok ? scoped.filter((log) => (!severity || log.severity === severity) && compiled.test(logResolver(log, environment), logHaystack(log))) : []),
    [scoped, compiled, severity, environment],
  );

  const bucketMs = useMemo(() => chooseBucketMs(range.endMs - range.startMs), [range]);
  const presentSeverities = useMemo(() => SEVERITIES.filter((candidate) => matched.some((log) => log.severity === candidate)), [matched]);
  const series = useMemo<BarSeries[]>(
    () => (presentSeverities.length ? presentSeverities : (['INFO'] as Severity[])).map((item) => ({ key: item, label: severityLabel(item), color: severityColor(item) })),
    [presentSeverities],
  );
  const bars = useMemo(
    () => histogram(matched, range, bucketMs, series.length, (log) => ({ t: Date.parse(log.ts), series: series.findIndex((item) => item.key === log.severity) })),
    [matched, range, bucketMs, series],
  );

  const rows = useMemo(
    () => (bucket ? matched.filter((log) => {
      const t = Date.parse(log.ts);
      return t >= bucket.from && t < bucket.to;
    }) : matched),
    [matched, bucket],
  );
  const paging = usePaging(rows);

  const traceIds = useMemo(() => new Set(Object.keys(bundle.spans)), [bundle.spans]);
  const selected = useMemo(() => (selectedId ? rows.find((log) => log.id === selectedId) ?? win.logs.find((log) => log.id === selectedId) ?? null : null), [selectedId, rows, win.logs]);
  const related = useMemo(() => (selected ? win.logs.filter((log) => log.traceId === selected.traceId && log.id !== selected.id) : []), [selected, win.logs]);

  const apply = useCallback((next: string) => {
    setBucket(null);
    onApply(next);
  }, [onApply]);
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const exportCsv = () =>
    downloadCsv(
      'logs.csv',
      ['timestamp', 'service', 'severity', 'body', 'spanName', 'durationMs', 'scenario', 'outcome', 'pod', 'node', 'traceId', 'spanId'],
      rows.map((log) => [new Date(log.ts).toISOString(), log.service, log.severity, log.body, log.spanName, log.durationMs ?? '', log.scenario, log.outcome, log.pod, log.node, log.traceId, log.spanId]),
    );

  return (
    <div className={`explorer${selected ? ' has-drawer' : ''}`}>
      <QueryBar
        value={draft}
        onChange={setDraft}
        onRun={() => apply(draft)}
        error={compiled.ok ? null : compiled.error}
        ariaLabel="Lucene query"
        placeholder={placeholder}
        leading={
          <DropdownMenu
            ariaLabel="Severity filter"
            triggerClassName="select-btn"
            trigger={<>{severity ? severityLabel(severity) : 'All severities'}</>}
            items={[
              { id: 'all', label: 'All severities', selected: severity === null, onSelect: () => setSeverity(null) },
              ...SEVERITIES.filter((candidate) => scoped.some((log) => log.severity === candidate)).map((candidate) => ({
                id: candidate,
                label: severityLabel(candidate),
                selected: severity === candidate,
                onSelect: () => setSeverity(candidate),
              })),
            ]}
          />
        }
      />

      <Card title="Count Logs grouped by severity" meta={`${rows.length.toLocaleString()} matching · ${Math.round(bucketMs / 1000)}s buckets`} bare>
        <StackedBars
          ariaLabel="Count of logs over time grouped by severity"
          series={series}
          bars={bars}
          bucketMs={bucketMs}
          height={170}
          onBarClick={(index) => {
            const from = bars[index].t;
            setBucket((current) => (current?.from === from ? null : { from, to: from + bucketMs }));
          }}
        />
        <Legend items={series.map((item) => ({ label: item.label, color: item.color }))} />
      </Card>

      <section className="panel results">
        <header className="results-head">
          <h3>
            Logs <span className="count-badge">{rows.length.toLocaleString()}</span>
          </h3>
          {bucket && (
            <button type="button" className="filter-chip" onClick={() => setBucket(null)} aria-label="Clear time bucket filter">
              {formatTick(bucket.from, bucketMs < 60_000)} – {formatTick(bucket.to, bucketMs < 60_000)} <X size={12} aria-hidden />
            </button>
          )}
          <span className="card-spacer" />
          <button type="button" className="link-btn" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={13} aria-hidden /> Export
          </button>
        </header>
        {rows.length === 0 ? (
          <EmptyState title="No logs match this query" hint="Adjust the query, widen the time range or reset the filters." />
        ) : (
          <>
            <DataTable
              ariaLabel="Logs"
              className="logs-table"
              columns={COLUMNS}
              rows={paging.visible}
              rowKey={(log) => log.id}
              selectedKey={selectedId}
              onRowActivate={(log) => setSelectedId(log.id)}
              rowClassName={(log) => (log.severity === 'ERROR' || log.severity === 'FATAL' ? 'is-error-row' : undefined)}
            />
            <LoadMore shown={paging.visible.length} total={paging.total} onMore={paging.more} noun="logs" />
          </>
        )}
      </section>

      {selected && (
        <LogDrawer
          log={selected}
          env={environment}
          related={related}
          traceAvailable={traceIds.has(selected.traceId)}
          onClose={closeDrawer}
          onSelect={(log) => setSelectedId(log.id)}
          onFilter={(field, value, negate) => {
            apply(appendClause(query, field, value, negate));
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
