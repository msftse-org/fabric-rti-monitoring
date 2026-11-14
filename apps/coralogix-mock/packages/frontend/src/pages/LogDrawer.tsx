import { ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, type Environment, type LogEntry } from '@telemetry';
import { AttributeList, type Attribute } from '../components/AttributeList';
import { Chip } from '../components/Chips';
import { Segmented } from '../components/Controls';
import { JsonView, type Json } from '../components/JsonView';
import { formatTimestamp } from '../lib/time';
import { href, paths } from '../lib/router';
import { severityTone } from '../lib/severity';

type Mode = 'table' | 'json' | 'raw';

interface LogDrawerProps {
  log: LogEntry;
  env: Environment;
  related: LogEntry[];
  traceAvailable: boolean;
  onClose: () => void;
  onFilter: (field: string, value: string, negate: boolean) => void;
  onSelect: (log: LogEntry) => void;
}

function toDocument(log: LogEntry, env: Environment): { [key: string]: Json } {
  return {
    timestamp: new Date(log.ts).toISOString(),
    severity: log.severity,
    body: log.body,
    service: log.service,
    namespace: env.namespace,
    cluster: env.cluster,
    environment: env.environment,
    pod: log.pod,
    node: log.node,
    version: log.version,
    scenario: log.scenario,
    outcome: log.outcome,
    runId: log.runId,
    trace: { traceId: log.traceId, spanId: log.spanId, spanName: log.spanName, durationMs: log.durationMs },
  };
}

export function LogDrawer({ log, env, related, traceAvailable, onClose, onFilter, onSelect }: LogDrawerProps) {
  const [mode, setMode] = useState<Mode>('table');
  const closeRef = useRef<HTMLButtonElement>(null);
  const doc = useMemo(() => toDocument(log, env), [log, env]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const attributes: Attribute[] = [
    { key: 'timestamp', value: formatTimestamp(Date.parse(log.ts)) },
    { key: 'severity', value: log.severity, field: 'severity', render: <Chip tone={severityTone(log.severity)}>{log.severity}</Chip> },
    { key: 'body', value: log.body },
    { key: 'service', value: log.service, field: 'service' },
    { key: 'namespace', value: env.namespace, field: 'namespace' },
    { key: 'cluster', value: env.cluster, field: 'cluster' },
    { key: 'environment', value: env.environment, field: 'environment' },
    { key: 'pod', value: log.pod, field: 'pod' },
    { key: 'node', value: log.node, field: 'node' },
    { key: 'version', value: log.version, field: 'version' },
    { key: 'scenario', value: log.scenario, field: 'scenario' },
    { key: 'outcome', value: log.outcome, field: 'outcome' },
    { key: 'spanName', value: log.spanName, field: 'spanName' },
    { key: 'durationMs', value: log.durationMs === null ? '' : String(log.durationMs), render: log.durationMs === null ? '–' : formatDuration(log.durationMs) },
    { key: 'traceId', value: log.traceId, field: 'traceId' },
    { key: 'spanId', value: log.spanId, field: 'spanId' },
    { key: 'runId', value: log.runId, field: 'runId' },
  ];

  return (
    <aside className="drawer" aria-label="Log details">
      <header className="drawer-head">
        <h2>Log</h2>
        <Chip tone={severityTone(log.severity)}>{log.severity}</Chip>
        <span className="card-spacer" />
        {traceAvailable ? (
          <a className="btn btn--small" href={href(paths.trace(log.traceId, log.spanId))}>
            <ExternalLink size={12} aria-hidden /> Open trace
          </a>
        ) : (
          <button type="button" className="btn btn--small" disabled title="This trace is not part of the sampled traces in the bundle">
            <ExternalLink size={12} aria-hidden /> Open trace
          </button>
        )}
        <button ref={closeRef} type="button" className="icon-btn" aria-label="Close log details" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="drawer-tools">
        <Segmented<Mode>
          ariaLabel="Detail format"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'table', label: 'Table' },
            { id: 'json', label: 'JSON' },
            { id: 'raw', label: 'Raw' },
          ]}
        />
      </div>
      <div className="drawer-body">
        {mode === 'table' && <AttributeList attributes={attributes} onFilter={onFilter} />}
        {mode === 'json' && <JsonView value={doc} />}
        {mode === 'raw' && <pre className="raw-view">{JSON.stringify(doc)}</pre>}

        <h3 className="drawer-section">Logs in the same trace ({related.length})</h3>
        {related.length === 0 ? (
          <p className="muted">No other logs share this trace id.</p>
        ) : (
          <ul className="related-list">
            {related.slice(0, 12).map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => onSelect(entry)}>
                  <span className="mono">{formatTimestamp(Date.parse(entry.ts)).slice(11)}</span>
                  <span>{entry.service}</span>
                  <span className="muted">{entry.spanName || 'no span'}</span>
                  <Chip tone={severityTone(entry.severity)}>{entry.severity}</Chip>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
