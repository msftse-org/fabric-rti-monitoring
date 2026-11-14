import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { formatCount, formatDuration, formatPercent } from '@telemetry';
import { MetricBar } from '../components/MetricBar';
import { Sparkline } from '../components/Sparkline';
import { EmptyState } from '../components/States';
import { IssuePill, WorkloadName } from '../components/WorkloadLink';
import { useView } from '../lib/data';
import { HEALTH_COLOR } from '../lib/health';
import type { Workload } from '../lib/model';
import { navigate } from '../lib/router';

type SortKey = 'name' | 'rps' | 'errorRate' | 'p50' | 'p95' | 'p99' | 'requests' | 'issues';

const SORT_VALUE: Record<SortKey, (workload: Workload) => string | number> = {
  name: (workload) => workload.name,
  rps: (workload) => workload.rps,
  errorRate: (workload) => workload.errorRate,
  p50: (workload) => workload.p50,
  p95: (workload) => workload.p95,
  p99: (workload) => workload.p99,
  requests: (workload) => workload.requests,
  issues: (workload) => workload.issues.length,
};

const COLUMNS: { key: SortKey | null; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Workload' },
  { key: null, label: 'Environment' },
  { key: null, label: 'Cluster' },
  { key: null, label: 'Namespace' },
  { key: null, label: 'Kind' },
  { key: 'rps', label: 'Reqs/s', numeric: true },
  { key: 'errorRate', label: 'Errors', numeric: true },
  { key: 'p50', label: 'P50', numeric: true },
  { key: 'p95', label: 'P95', numeric: true },
  { key: 'p99', label: 'P99', numeric: true },
  { key: 'requests', label: 'Requests', numeric: true },
  { key: null, label: 'Trend' },
  { key: 'issues', label: 'Issues' },
];

export function WorkloadsPage() {
  const view = useView();
  const env = view.bundle.environment;
  const [search, setSearch] = useState('');
  const [namespace, setNamespace] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rps', dir: 'desc' });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = view.workloads.filter(
      (workload) => (!needle || workload.name.toLowerCase().includes(needle)) && (namespace === 'all' || namespace === env.namespace),
    );
    const pick = SORT_VALUE[sort.key];
    return [...filtered].sort((a, b) => {
      const x = pick(a);
      const y = pick(b);
      const order = typeof x === 'string' ? x.localeCompare(String(y)) : Number(x) - Number(y);
      return sort.dir === 'asc' ? order : -order;
    });
  }, [view.workloads, search, namespace, sort, env.namespace]);

  const max = {
    rps: Math.max(...view.workloads.map((workload) => workload.rps), 0),
    error: Math.max(...view.workloads.map((workload) => workload.errorRate), 0.001),
    p95: Math.max(...view.workloads.map((workload) => workload.p95), 1),
  };

  const toggleSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  return (
    <div className="page">
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">Workloads</h2>
          <span className="muted">Showing {rows.length} out of {view.workloads.length}</span>
          <div className="card__spacer" />
          <label className="search">
            <Search size={14} aria-hidden="true" />
            <input type="search" placeholder="Search Workloads" aria-label="Search workloads" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="select" aria-label="Namespace" value={namespace} onChange={(event) => setNamespace(event.target.value)}>
            <option value="all">All Namespaces</option>
            <option value={env.namespace}>{env.namespace}</option>
          </select>
          <button type="button" className="btn btn--ghost" onClick={() => { setSearch(''); setNamespace('all'); }}>Clear</button>
        </div>
        <div className="table-scroll">
          <table className="table table--workloads">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.label} className={column.numeric ? 'num' : undefined} aria-sort={column.key && sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {column.key ? (
                      <button type="button" className="th-btn" onClick={() => toggleSort(column.key as SortKey)}>
                        {column.label}
                        {sort.key === column.key && (sort.dir === 'asc' ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />)}
                      </button>
                    ) : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((workload) => (
                <tr key={workload.name} className="row--link" tabIndex={0} onClick={() => navigate(`workloads/${workload.name}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`workloads/${workload.name}`); }}>
                  <td><WorkloadName name={workload.name} /></td>
                  <td>{env.environment}</td>
                  <td>{env.cluster}</td>
                  <td>{env.namespace}</td>
                  <td>{workload.kind}</td>
                  <td className="num"><MetricBar text={workload.rps.toFixed(2)} value={workload.rps} max={max.rps} color="#3d8bfd" /></td>
                  <td className="num"><MetricBar text={formatPercent(workload.errorRate, 1)} value={workload.errorRate} max={max.error} color="#e0382f" title={`${workload.errors} of ${formatCount(workload.requests)} requests failed`} /></td>
                  <td className="num">{formatDuration(workload.p50)}</td>
                  <td className="num"><MetricBar text={formatDuration(workload.p95)} value={workload.p95} max={max.p95} color="#f0a30a" /></td>
                  <td className="num">{formatDuration(workload.p99)}</td>
                  <td className="num">{formatCount(workload.requests)}</td>
                  <td><Sparkline values={workload.series.map((point) => point.requests)} color={HEALTH_COLOR[workload.health]} label={`${workload.name} requests per minute`} bars /></td>
                  <td><IssuePill count={workload.issues.length} severity={workload.issues[0]?.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title="No workloads match">Try a different search or clear the filters.</EmptyState>}
        </div>
        <div className="card__foot muted">
          {view.workloads[0]?.percentilesApprox
            ? 'Percentiles are request-weighted means of 1-minute percentiles for this window.'
            : 'Percentiles come from every server span in the bundle.'}
          {' '}Req/s = server spans ÷ observed seconds. Issues are derived from error rate (≥ 5%) and p95 (≥ 500ms).
        </div>
      </section>
    </div>
  );
}
