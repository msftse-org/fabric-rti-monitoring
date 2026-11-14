import { useMemo } from 'react';
import { formatDuration, formatPercent } from '@telemetry';
import { useApp } from '../../lib/app';
import type { EdgeStat, ServiceStat } from '../../lib/derive';
import { navigate, paths } from '../../lib/router';
import { ServiceMap } from '../../components/ServiceMap';
import { Widget } from '../../components/Widget';
import { ServiceTag } from '../../components/ui';

function EdgeTable({ title, rows, side, empty }: { title: string; rows: EdgeStat[]; side: 'from' | 'to'; empty: string }) {
  const { statsByName } = useApp();
  return (
    <Widget title={title} subtitle={`${rows.length} service${rows.length === 1 ? '' : 's'}`}>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th className="num">Calls</th>
                <th className="num">Req/s</th>
                <th className="num">Error rate</th>
                <th className="num">Avg latency</th>
                <th className="num">p95</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((edge) => {
                const peer = edge[side];
                const linkable = Boolean(statsByName[peer]);
                return (
                  <tr key={`${edge.from}-${edge.to}`} className={linkable ? 'row-link' : undefined} onClick={linkable ? () => navigate(paths.service(peer)) : undefined}>
                    <td>
                      <ServiceTag name={peer} />
                      {edge.kind === 'database' && <span className="chip chip--soft"> datastore</span>}
                    </td>
                    <td className="num">{edge.calls.toLocaleString()}</td>
                    <td className="num">{edge.rps.toFixed(2)}</td>
                    <td className="num">{formatPercent(edge.errorRate)}</td>
                    <td className="num">{formatDuration(edge.avgMs)}</td>
                    <td className="num">{formatDuration(edge.p95)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Widget>
  );
}

export function DependenciesTab({ stat }: { stat: ServiceStat }) {
  const { edges, stats } = useApp();
  const upstream = useMemo(() => edges.filter((edge) => edge.to === stat.name), [edges, stat.name]);
  const downstream = useMemo(() => edges.filter((edge) => edge.from === stat.name), [edges, stat.name]);
  return (
    <div className="svc__pad svc__deps">
      <Widget title="Service map" subtitle={`around ${stat.name}`}>
        <ServiceMap stats={stats} edges={edges} focus={stat.name} selected={stat.name} onSelect={(name) => navigate(paths.service(name))} />
      </Widget>
      <EdgeTable title="Upstream (callers)" rows={upstream} side="from" empty="Nothing calls this service: it is an entry point." />
      <EdgeTable title="Downstream (callees)" rows={downstream} side="to" empty="This service does not call any other service." />
    </div>
  );
}
