import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatDuration, formatPercent } from '@telemetry';
import { useApp } from '../../lib/app';
import { scaledOperations, type ServiceStat } from '../../lib/derive';
import { navigate, paths } from '../../lib/router';

type SortKey = 'name' | 'requests' | 'errors' | 'errorRate' | 'avgMs' | 'p50' | 'p95' | 'p99';

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Resource' },
  { key: 'requests', label: 'Requests', num: true },
  { key: 'errors', label: 'Errors', num: true },
  { key: 'errorRate', label: 'Error rate', num: true },
  { key: 'avgMs', label: 'Avg', num: true },
  { key: 'p50', label: 'p50', num: true },
  { key: 'p95', label: 'p95', num: true },
  { key: 'p99', label: 'p99', num: true },
];

export function ResourcesTab({ stat }: { stat: ServiceStat }) {
  const data = useApp();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'requests', dir: -1 });
  const rows = useMemo(() => {
    const operations = scaledOperations(data.bundle, stat).map((op) => ({ ...op, errorRate: op.requests ? op.errors / op.requests : 0 }));
    return operations.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      return (typeof left === 'string' ? left.localeCompare(String(right)) : (left as number) - (right as number)) * sort.dir;
    });
  }, [data.bundle, stat, sort]);
  const total = rows.reduce((sum, row) => sum + row.requests, 0) || 1;

  return (
    <div className="svc__pad">
      <div className="card scroll-x">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className={column.num ? 'num' : undefined} aria-sort={sort.key === column.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="th-sort" onClick={() => setSort((current) => ({ key: column.key, dir: current.key === column.key ? (current.dir === 1 ? -1 : 1) : column.key === 'name' ? 1 : -1 }))}>
                    {column.label}
                    {sort.key === column.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
              <th>% of requests</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.name}-${row.scenario}`}>
                <td>
                  <span className="mono">{row.name}</span> <span className="chip chip--soft">scenario:{row.scenario}</span>
                </td>
                <td className="num">{row.requests.toLocaleString()}</td>
                <td className="num">{row.errors.toLocaleString()}</td>
                <td className="num">{formatPercent(row.errorRate)}</td>
                <td className="num">{formatDuration(row.avgMs)}</td>
                <td className="num">{formatDuration(row.p50)}</td>
                <td className="num">{formatDuration(row.p95)}</td>
                <td className="num">{formatDuration(row.p99)}</td>
                <td>
                  <span className="spanlist__pct">
                    <span style={{ width: `${(row.requests / total) * 100}%` }} />
                  </span>
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => navigate(paths.traces(`service:${stat.name} scenario:${row.scenario}`))}>
                    View traces
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="muted">
                  No resources reported for {stat.name}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="page__hint muted">Resources are the span names this service handles per scenario; counts are scaled from the full-run totals to the selected window.</p>
    </div>
  );
}
