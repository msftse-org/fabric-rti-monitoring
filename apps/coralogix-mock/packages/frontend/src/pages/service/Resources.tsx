import { useMemo } from 'react';
import { formatCount } from '@telemetry';
import { Chip } from '../../components/Chips';
import { DataTable, type Column } from '../../components/DataTable';
import { useData } from '../../lib/data';
import { href, paths } from '../../lib/router';
import { formatTimestamp } from '../../lib/time';
import type { ServiceTabProps } from './types';

interface PodRow {
  pod: string;
  node: string;
  version: string;
  namespace: string;
  logs: number;
  errorLogs: number;
  lastLogMs: number | null;
}

const COLUMNS: Column<PodRow>[] = [
  { id: 'pod', title: 'Pod', label: 'Pod', render: (row) => <span className="mono">{row.pod}</span> },
  { id: 'node', title: 'Node', label: 'Node', render: (row) => <span className="mono">{row.node}</span> },
  { id: 'version', title: 'Version', label: 'Version', render: (row) => <Chip>{row.version}</Chip> },
  { id: 'namespace', title: 'Namespace', label: 'Namespace', render: (row) => row.namespace },
  { id: 'logs', title: 'Logs', label: 'Logs', align: 'right', render: (row) => formatCount(row.logs) },
  { id: 'errorLogs', title: 'Error logs', label: 'Error logs', align: 'right', render: (row) => formatCount(row.errorLogs) },
  { id: 'last', title: 'Last log', label: 'Last log', render: (row) => (row.lastLogMs === null ? '–' : <span className="mono">{formatTimestamp(row.lastLogMs)}</span>) },
];

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Resources({ service }: ServiceTabProps) {
  const { bundle, win } = useData();
  const { environment } = bundle;
  const { summary } = service;

  const pods = useMemo<PodRow[]>(
    () =>
      summary.pods.map((pod) => {
        const logs = win.logs.filter((log) => log.service === service.name && log.pod === pod);
        return {
          pod,
          node: summary.node,
          version: summary.version,
          namespace: environment.namespace,
          logs: logs.length,
          errorLogs: logs.filter((log) => log.severity === 'ERROR' || log.severity === 'FATAL').length,
          lastLogMs: logs.length ? Date.parse(logs[0].ts) : null,
        };
      }),
    [summary, win.logs, service.name, environment.namespace],
  );

  return (
    <div className="resources">
      <section className="panel tab-panel">
        <Facts
          items={[
            ['Cluster', environment.cluster],
            ['Namespace', environment.namespace],
            ['Environment', environment.environment],
            ['Service version', summary.version],
            ['Pods', String(summary.pods.length)],
          ]}
        />
      </section>
      <section className="panel tab-panel">
        <h3 className="panel-title">Pods</h3>
        <DataTable ariaLabel={`Pods of ${service.name}`} columns={COLUMNS} rows={pods} rowKey={(row) => row.pod} />
      </section>
      <section className="panel tab-panel">
        <h3 className="panel-title">Dependencies</h3>
        <div className="dep-lists">
          <DependencyList title="Calls" names={summary.dependsOn} databases={bundle.edges.filter((edge) => edge.kind === 'database').map((edge) => edge.to)} />
          <DependencyList title="Called by" names={summary.dependedOnBy} databases={[]} />
        </div>
      </section>
    </div>
  );
}

function DependencyList({ title, names, databases }: { title: string; names: string[]; databases: string[] }) {
  return (
    <div>
      <h4 className="dep-title">{title}</h4>
      {names.length === 0 ? (
        <span className="muted">None</span>
      ) : (
        <ul className="dep-list">
          {names.map((name) => (
            <li key={name}>{databases.includes(name) ? <a href={href(paths.databases())}>{name}</a> : <a href={href(paths.service(name))}>{name}</a>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
