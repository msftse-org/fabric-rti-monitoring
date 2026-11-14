import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Filter } from 'lucide-react';
import { formatDuration, formatPercent } from '@telemetry';
import { useApp } from '../lib/app';
import type { ServiceStat } from '../lib/derive';
import { minuteGrid, minuteSeries } from '../lib/series';
import { COLOR } from '../lib/palette';
import { navigate, paths } from '../lib/router';
import { compact } from '../lib/time';
import { useInert } from '../lib/toast';
import { Sparkline } from '../components/charts/Sparkline';
import { HealthChip, PageTabs, ServiceDot } from '../components/ui';

type SortKey = 'name' | 'status' | 'requests' | 'rps' | 'errorRate' | 'avgMs' | 'p50' | 'p95' | 'p99' | 'apdex';

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Service' },
  { key: 'status', label: 'Monitors' },
  { key: 'requests', label: 'Requests', num: true },
  { key: 'rps', label: 'Req/s', num: true },
  { key: 'errorRate', label: 'Error rate', num: true },
  { key: 'avgMs', label: 'Avg latency', num: true },
  { key: 'p50', label: 'p50', num: true },
  { key: 'p95', label: 'p95', num: true },
  { key: 'p99', label: 'p99', num: true },
  { key: 'apdex', label: 'Apdex', num: true },
];

const STATUS_RANK = { alert: 3, warn: 2, nodata: 1, ok: 0 };

function sortValue(stat: ServiceStat, key: SortKey): number | string {
  if (key === 'name') return stat.name;
  if (key === 'status') return STATUS_RANK[stat.status];
  return stat[key] ?? -1;
}

export function ServiceCatalogPage() {
  const data = useApp();
  const inert = useInert();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'requests', dir: -1 });
  const grid = useMemo(() => minuteGrid(data), [data]);
  const series = useMemo(() => Object.fromEntries(data.stats.map((stat) => [stat.name, minuteSeries(data, grid, [stat.name])])), [data, grid]);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return data.stats
      .filter((stat) => !needle || stat.name.includes(needle))
      .sort((a, b) => {
        const left = sortValue(a, sort.key);
        const right = sortValue(b, sort.key);
        const order = typeof left === 'string' ? left.localeCompare(String(right)) : (left as number) - (right as number);
        return order * sort.dir || a.name.localeCompare(b.name);
      });
  }, [data.stats, filter, sort]);

  const totals = data.stats.reduce((sum, stat) => ({ requests: sum.requests + stat.requests, errors: sum.errors + stat.errors }), { requests: 0, errors: 0 });
  const unhealthy = data.stats.filter((stat) => stat.status === 'alert' || stat.status === 'warn').length;

  return (
    <div className="page">
      <div className="page__head">
        <PageTabs
          tabs={[
            { id: 'services', label: 'Services' },
            { id: 'map', label: 'Service Map' },
            { id: 'setup', label: 'Setup & Config' },
          ]}
          current="services"
          onSelect={(id) => (id === 'map' ? navigate(paths.map()) : id === 'setup' ? inert() : undefined)}
        />
      </div>
      <div className="page__bar">
        <div className="input-wrap page__filter">
          <Filter size={13} />
          <input className="input" aria-label="Filter services" placeholder="Filter services" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </div>
        <span className="chip chip--soft">env:aks</span>
        <span className="chip chip--soft">namespace:otel-demo</span>
        <span className="grow" />
        <span className="muted page__summary">
          {data.stats.length} services · {compact(totals.requests)} requests · {formatPercent(totals.requests ? totals.errors / totals.requests : 0)} errors · {unhealthy} need attention
        </span>
      </div>
      <div className="page__pad">
        <div className="card scroll-x">
          <table className="table catalog">
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
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((stat) => (
                <tr key={stat.name} className="row-link" onClick={() => navigate(paths.service(stat.name))}>
                  <td>
                    <a className="catalog__name" href={`#${paths.service(stat.name)}`} onClick={(event) => event.stopPropagation()}>
                      <ServiceDot name={stat.name} size={12} />
                      <b>{stat.name}</b>
                      <span className="chip chip--soft">web</span>
                    </a>
                  </td>
                  <td>
                    <HealthChip status={stat.status} />
                  </td>
                  <td className="num">
                    <span className="catalog__spark">
                      <Sparkline values={series[stat.name].requests} width={72} height={20} color={COLOR.hits} />
                      {stat.requests.toLocaleString()}
                    </span>
                  </td>
                  <td className="num">{stat.rps.toFixed(2)}</td>
                  <td className="num">
                    <span className="catalog__spark">
                      <Sparkline values={series[stat.name].errors} width={56} height={20} color={COLOR.errors} />
                      <span className={stat.errorRate >= 0.1 ? 'text-alert' : stat.errorRate >= 0.05 ? 'text-warn' : undefined}>{formatPercent(stat.errorRate)}</span>
                    </span>
                  </td>
                  <td className="num">{formatDuration(stat.avgMs)}</td>
                  <td className="num">{formatDuration(stat.p50)}</td>
                  <td className="num">{formatDuration(stat.p95)}</td>
                  <td className="num">{formatDuration(stat.p99)}</td>
                  <td className="num">{stat.apdex === null ? '–' : stat.apdex.toFixed(2)}</td>
                  <td className="mono">{stat.version}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="muted">
                    No services match “{filter}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="page__hint muted">Monitor status and Apdex (T = 500 ms) are derived from the error rate, p95 latency and indexed server spans of this window.</p>
      </div>
    </div>
  );
}
