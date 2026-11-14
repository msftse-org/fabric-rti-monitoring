import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Minus, Plus, X } from 'lucide-react';
import { formatDuration } from '@telemetry';
import { useApp } from '../../lib/app';
import { fieldValue } from '../../lib/logsModel';
import { navigate, paths } from '../../lib/router';
import { severityColor } from '../../lib/palette';
import { buildTree, flatten } from '../../lib/tracesModel';
import { formatStampMs } from '../../lib/time';
import type { LogRow } from '../../lib/window';
import { CopyButton, NoticeBar, ServiceTag } from '../../components/ui';

interface Props {
  log: LogRow;
  env: string;
  traceAvailable: boolean;
  onClose: () => void;
  onMove: (delta: number) => void;
  onFilter: (key: string, value: string, exclude: boolean) => void;
}

type Tab = 'attributes' | 'trace' | 'json';

interface Attr {
  key: string;
  label: string;
  value: string;
  facet?: boolean;
}

function attributesOf(log: LogRow, env: string): Attr[] {
  const duration = log.durationMs === null ? '' : String(log.durationMs);
  return [
    { key: 'status', label: 'status', value: fieldValue(log, 'status', env), facet: true },
    { key: 'service', label: 'service', value: log.service, facet: true },
    { key: 'host', label: 'host', value: log.node, facet: true },
    { key: 'source', label: 'source', value: 'otel', facet: true },
    { key: 'env', label: 'env', value: env, facet: true },
    { key: 'pod', label: 'pod_name', value: log.pod, facet: true },
    { key: 'version', label: 'version', value: log.version, facet: true },
    { key: 'scenario', label: 'scenario', value: log.scenario, facet: true },
    { key: 'outcome', label: 'outcome', value: log.outcome, facet: true },
    { key: 'span_name', label: 'span.name', value: log.spanName, facet: true },
    { key: 'duration', label: 'duration_ms', value: duration },
    { key: 'trace_id', label: 'trace_id', value: log.traceId, facet: true },
    { key: 'span_id', label: 'span_id', value: log.spanId, facet: true },
    { key: 'run_id', label: 'run_id', value: log.runId },
    { key: 'timestamp', label: 'timestamp', value: log.ts },
  ].filter((attr) => attr.value !== '');
}

export function LogPanel({ log, env, traceAvailable, onClose, onMove, onFilter }: Props) {
  const [tab, setTab] = useState<Tab>('attributes');
  const attrs = useMemo(() => attributesOf(log, env), [log, env]);
  const json = useMemo(
    () =>
      JSON.stringify(
        {
          id: log.id,
          date: log.ts,
          host: log.node,
          service: log.service,
          status: log.severity.toLowerCase(),
          message: log.body,
          tags: [`env:${env}`, `service:${log.service}`, `version:${log.version}`, `pod_name:${log.pod}`, 'source:otel'],
          attributes: { scenario: log.scenario, outcome: log.outcome, span: { name: log.spanName, id: log.spanId, duration_ms: log.durationMs }, trace_id: log.traceId, run_id: log.runId },
        },
        null,
        2,
      ),
    [log, env],
  );

  return (
    <aside className="logpanel" aria-label="Log details">
      <header className="logpanel__head">
        <span className="chip" style={{ background: severityColor(log.severity) }}>
          {log.severity}
        </span>
        <ServiceTag name={log.service} />
        <span className="grow" />
        <button type="button" className="icon-btn" aria-label="Previous log" onClick={() => onMove(-1)}>
          <ChevronUp size={16} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next log" onClick={() => onMove(1)}>
          <ChevronDown size={16} />
        </button>
        <button type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="logpanel__summary">
        <div className="logpanel__date mono">{formatStampMs(log.ms)} UTC</div>
        <div className="logpanel__msg mono">{log.body}</div>
        <div className="logpanel__tags">
          {[`service:${log.service}`, `host:${log.node}`, 'source:otel', `env:${env}`, `version:${log.version}`].map((tag) => (
            <span key={tag} className="chip chip--soft chip--tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="logpanel__actions">
          <button type="button" className="btn btn--primary" disabled={!traceAvailable} onClick={() => navigate(paths.trace(log.traceId, log.spanId))}>
            <ExternalLink size={13} /> Related trace
          </button>
          <button type="button" className="btn" onClick={() => navigate(paths.service(log.service))}>
            View service
          </button>
        </div>
        {!traceAvailable && log.traceId && <NoticeBar>Trace not retained in this snapshot — the bundle keeps only the newest, error and slowest traces.</NoticeBar>}
      </div>
      <div className="tabs tabs--panel" role="tablist">
        {(['attributes', 'trace', 'json'] as const).map((id) => (
          <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {id === 'attributes' ? 'Event Attributes' : id === 'trace' ? 'Trace' : 'JSON'}
          </button>
        ))}
      </div>
      <div className="logpanel__body">
        {tab === 'attributes' && (
          <dl className="attrs">
            {attrs.map((attr) => (
              <div key={attr.key} className="attrs__row">
                <dt className="mono">{attr.label}</dt>
                <dd className="mono truncate" title={attr.value}>
                  {attr.value}
                </dd>
                <span className="attrs__actions">
                  {attr.facet && (
                    <>
                      <button type="button" className="icon-btn" aria-label={`Filter by ${attr.label}:${attr.value}`} title="Filter by value" onClick={() => onFilter(attr.key, attr.value, false)}>
                        <Plus size={13} />
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Exclude ${attr.label}:${attr.value}`} title="Exclude value" onClick={() => onFilter(attr.key, attr.value, true)}>
                        <Minus size={13} />
                      </button>
                    </>
                  )}
                  <CopyButton value={attr.value} />
                </span>
              </div>
            ))}
          </dl>
        )}
        {tab === 'trace' && <TraceTab log={log} available={traceAvailable} />}
        {tab === 'json' && (
          <div className="json">
            <div className="json__copy">
              <CopyButton value={json} label="Copy JSON" />
            </div>
            <pre className="mono">{json}</pre>
          </div>
        )}
      </div>
    </aside>
  );
}

function TraceTab({ log, available }: { log: LogRow; available: boolean }) {
  const { bundle } = useApp();
  const spans = bundle.spans[log.traceId];
  const summary = bundle.traces.find((trace) => trace.traceId === log.traceId);
  const rows = useMemo(() => (spans ? flatten(buildTree(spans), new Set()) : []), [spans]);
  if (!available || !summary) return <NoticeBar>This log belongs to trace {log.traceId.slice(0, 16)}…, which is not retained in the telemetry bundle.</NoticeBar>;
  return (
    <div className="mini-trace">
      <div className="mini-trace__summary">
        <b>{summary.rootName}</b> · {formatDuration(summary.durationMs)} · {summary.spanCount} spans · {summary.services.length} services
      </div>
      <ul>
        {rows.map(({ node, depth }) => (
          <li key={node.span.spanId} style={{ paddingLeft: depth * 14 }}>
            <button type="button" className="mini-trace__row" data-current={node.span.spanId === log.spanId} onClick={() => navigate(paths.trace(log.traceId, node.span.spanId))}>
              <ServiceTag name={node.span.service} />
              <span className="mono truncate grow">{node.span.name}</span>
              <span className="muted">{formatDuration(node.span.durationMs)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
