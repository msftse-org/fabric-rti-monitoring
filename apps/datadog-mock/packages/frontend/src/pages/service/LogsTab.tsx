import { useMemo, useState } from 'react';
import { formatDuration } from '@telemetry';
import { useApp } from '../../lib/app';
import type { ServiceStat } from '../../lib/derive';
import { COLOR } from '../../lib/palette';
import { navigate, paths } from '../../lib/router';
import { formatStampMs } from '../../lib/time';
import { EmptyState } from '../../components/ui';

const PAGE = 100;

export function LogsTab({ stat }: { stat: ServiceStat }) {
  const data = useApp();
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => data.logs.filter((log) => log.service === stat.name), [data.logs, stat.name]);
  if (!rows.length) return <EmptyState title="No logs">No logs from {stat.name} in the selected window.</EmptyState>;
  return (
    <div className="svc__pad">
      <div className="svc__tracebar">
        <span className="muted">
          {rows.length.toLocaleString()} logs from <b>{stat.name}</b> ({stat.errorLogs.toLocaleString()} errors)
        </span>
        <button type="button" className="link-btn" onClick={() => navigate(paths.logs(`service:${stat.name}`))}>
          Open in Log Explorer
        </button>
      </div>
      <div className="card scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th className="logtable__bar-col" />
              <th>Date</th>
              <th>Status</th>
              <th>Content</th>
              <th>Span</th>
              <th className="num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((log) => (
              <tr key={log.id} className="row-link" onClick={() => navigate(paths.logs(`trace_id:${log.traceId}`))}>
                <td className="logtable__bar-col">
                  <span className="sev-bar" style={{ background: log.severity === 'ERROR' ? COLOR.error : COLOR.info, height: 36 }} />
                </td>
                <td className="mono">{formatStampMs(log.ms)}</td>
                <td>{log.severity.toLowerCase()}</td>
                <td className="mono">{log.body}</td>
                <td className="mono">{log.spanName}</td>
                <td className="num mono">{log.durationMs === null ? '–' : formatDuration(log.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > limit && (
          <div className="tracetable__more">
            <button type="button" className="btn" onClick={() => setLimit((value) => value + PAGE)}>
              Load more ({(rows.length - limit).toLocaleString()} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
