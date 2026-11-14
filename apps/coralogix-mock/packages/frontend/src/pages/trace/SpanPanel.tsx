import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDuration, type LogEntry, type TraceSpan, type TraceSummary } from '@telemetry';
import { AttributeList, type Attribute } from '../../components/AttributeList';
import { Chip } from '../../components/Chips';
import { useData } from '../../lib/data';
import { href, navigate, paths } from '../../lib/router';
import { appendClause } from '../../lib/query';
import { severityTone } from '../../lib/severity';
import { formatTimestamp } from '../../lib/time';

const BINS = 12;

interface SpanPanelProps {
  trace: TraceSummary;
  span: TraceSpan;
  logs: LogEntry[];
  onClose: () => void;
}

/** Durations of every sampled span with the same name and service, binned for the distribution chart. */
function useDistribution(span: TraceSpan) {
  const { bundle } = useData();
  return useMemo(() => {
    const durations: number[] = [];
    for (const list of Object.values(bundle.spans)) {
      for (const candidate of list) if (candidate.name === span.name && candidate.service === span.service) durations.push(candidate.durationMs);
    }
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const step = (max - min) / BINS || 1;
    const bins = Array.from({ length: BINS }, () => 0);
    for (const value of durations) bins[Math.min(BINS - 1, Math.floor((value - min) / step))] += 1;
    return { bins, min, max, step, total: durations.length, selected: Math.min(BINS - 1, Math.floor((span.durationMs - min) / step)) };
  }, [bundle.spans, span.name, span.service, span.durationMs]);
}

function Distribution({ span }: { span: TraceSpan }) {
  const { bins, min, max, total, selected } = useDistribution(span);
  const peak = Math.max(1, ...bins);
  return (
    <figure className="dist">
      <svg viewBox={`0 0 ${BINS * 20} 64`} preserveAspectRatio="none" role="img" aria-label={`Duration distribution of ${total} ${span.name} spans on ${span.service}`}>
        {bins.map((count, index) => (
          <rect key={index} x={index * 20 + 1} width={18} y={62 - (count / peak) * 60} height={(count / peak) * 60} className={index === selected ? 'is-selected' : undefined} />
        ))}
      </svg>
      <figcaption>
        <span>{formatDuration(min)}</span>
        <span>{total} sampled spans</span>
        <span>{formatDuration(max)}</span>
      </figcaption>
    </figure>
  );
}

export function SpanPanel({ trace, span, logs, onClose }: SpanPanelProps) {
  const { bundle } = useData();
  const [filter, setFilter] = useState('');
  const { environment } = bundle;

  const attributes = useMemo<Attribute[]>(
    () => [
      { key: 'Trace ID', value: trace.traceId, field: 'traceId' },
      { key: 'Span ID', value: span.spanId, field: 'spanId' },
      { key: 'Parent span ID', value: span.parentId },
      { key: 'Span name', value: span.name, field: 'name' },
      { key: 'Span kind', value: span.kind, field: 'kind' },
      { key: 'Status', value: span.status, field: 'status' },
      { key: 'Start time', value: formatTimestamp(Date.parse(span.start)) },
      { key: 'Offset', value: formatDuration(span.offsetMs) },
      { key: 'Duration', value: formatDuration(span.durationMs), field: 'durationMs' },
      { key: 'Service', value: span.service, field: 'service' },
      { key: 'Namespace', value: environment.namespace },
      { key: 'Cluster', value: environment.cluster },
      { key: 'Scenario', value: span.scenario, field: 'scenario' },
      { key: 'Outcome', value: span.outcome, field: 'outcome' },
      { key: 'Pod', value: span.pod, field: 'pod' },
      { key: 'Node', value: span.node, field: 'node' },
      { key: 'Version', value: span.version, field: 'version' },
    ],
    [trace.traceId, span, environment],
  );
  const needle = filter.trim().toLowerCase();
  const shown = needle ? attributes.filter((attribute) => `${attribute.key} ${attribute.value}`.toLowerCase().includes(needle)) : attributes;

  return (
    <aside className="trace-side" aria-label="Span details">
      <div className="trace-side-search">
        <label className="search-box">
          <Search size={14} aria-hidden />
          <input type="search" placeholder="Search field or value" aria-label="Search span fields" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <button type="button" className="icon-btn" aria-label="Close span details" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {span.status === 'error' && (
        <section className="side-section">
          <h3>Error</h3>
          <p className="muted">
            This span ended with an error status. The synthetic workload records the outcome but no exception message, so none is shown.
          </p>
        </section>
      )}

      <section className="side-section">
        <h3>Span duration distribution</h3>
        <Distribution span={span} />
      </section>

      <section className="side-section">
        <h3>Metadata</h3>
        {shown.length ? (
          <AttributeList attributes={shown} onFilter={(field, value, negate) => navigate(paths.tracing(appendClause('', field, value, negate)))} />
        ) : (
          <p className="muted">No field matches “{filter}”.</p>
        )}
      </section>

      <section className="side-section">
        <h3>
          Related logs <Chip>{logs.length}</Chip>
        </h3>
        {logs.length ? (
          <ul className="related-list">
            {logs.slice(0, 20).map((log) => (
              <li key={log.id}>
                <Chip tone={severityTone(log.severity)}>{log.severity}</Chip>
                <span className="mono">{formatTimestamp(Date.parse(log.ts)).slice(11)}</span>
                <span>{log.body}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No log is linked to this span in the bundle.</p>
        )}
        <a className="link-btn" href={href(paths.logs(`traceId:${trace.traceId}`))}>
          Open all logs of this trace
        </a>
      </section>
    </aside>
  );
}
