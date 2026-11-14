import { useMemo, useState } from 'react';
import { formatDuration } from '@telemetry';
import { COLOR, PALETTES, serviceColor } from '../../lib/palette';
import { GROUP_FIELDS, fieldValue, isErrorLog } from '../../lib/logsModel';
import { bucketize, type TimeGrid } from '../../lib/time';
import type { LogRow } from '../../lib/window';
import { Donut } from '../../components/charts/Donut';
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';
import { Select } from '../../components/Select';
import { ServiceTag } from '../../components/ui';

export type VizKind = 'list' | 'timeseries' | 'toplist' | 'table' | 'pie';

interface Group {
  value: string;
  count: number;
  errors: number;
  durations: number[];
}

function groupLogs(logs: LogRow[], key: string, env: string): Group[] {
  const groups = new Map<string, Group>();
  for (const log of logs) {
    const value = fieldValue(log, key, env) || '(none)';
    const group = groups.get(value) ?? { value, count: 0, errors: 0, durations: [] };
    group.count += 1;
    if (isErrorLog(log)) group.errors += 1;
    if (log.durationMs !== null) group.durations.push(log.durationMs);
    groups.set(value, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function colorFor(key: string, value: string, index: number): string {
  if (key === 'status') return value === 'error' ? COLOR.error : value === 'warn' ? COLOR.warn : COLOR.info;
  if (key === 'service') return serviceColor(value);
  return PALETTES.classic[index % PALETTES.classic.length];
}

interface Props {
  kind: Exclude<VizKind, 'list'>;
  logs: LogRow[];
  grid: TimeGrid;
  env: string;
}

export function LogViz({ kind, logs, grid, env }: Props) {
  const [groupBy, setGroupBy] = useState(kind === 'timeseries' || kind === 'pie' ? 'status' : 'service');
  const groups = useMemo(() => groupLogs(logs, groupBy, env), [logs, groupBy, env]);
  const top = groups.slice(0, 8);

  const series = useMemo(() => {
    const index = new Map(top.map((group, i) => [group.value, i]));
    const rows = bucketize(grid, logs, (log) => index.get(fieldValue(log, groupBy, env) || '(none)') ?? -1, (log) => log.ms, top.length);
    return top.map((group, i) => ({ key: group.value, label: group.value, color: colorFor(groupBy, group.value, i), values: rows[i] }));
  }, [top, grid, logs, groupBy, env]);

  const max = Math.max(1, ...groups.map((group) => group.count));
  const total = logs.length;

  return (
    <div className="logviz">
      <div className="logviz__head">
        <span className="muted">Group by</span>
        <Select label="Group by" value={groupBy} options={GROUP_FIELDS.map((field) => ({ value: field.key, label: field.label }))} onChange={setGroupBy} />
        <span className="muted">{total.toLocaleString()} logs</span>
      </div>
      {kind === 'timeseries' && (
        <div className="logviz__card">
          <TimeSeriesChart grid={grid} series={series} mode="stacked" height={260} ariaLabel={`Log count by ${groupBy}`} />
          <ul className="legend">
            {series.map((s) => (
              <li key={s.key} className="legend-item">
                <span className="sev-swatch" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {kind === 'toplist' && (
        <ul className="toplist">
          {groups.slice(0, 20).map((group, i) => (
            <li key={group.value} className="toplist__row">
              <span className="toplist__name truncate">{groupBy === 'service' ? <ServiceTag name={group.value} /> : group.value}</span>
              <span className="toplist__track">
                <span className="toplist__bar" style={{ width: `${(group.count / max) * 100}%`, background: colorFor(groupBy, group.value, i) }} />
              </span>
              <b className="toplist__value">{group.count.toLocaleString()}</b>
            </li>
          ))}
        </ul>
      )}
      {kind === 'table' && (
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>{GROUP_FIELDS.find((field) => field.key === groupBy)?.label}</th>
                <th className="num">Count</th>
                <th className="num">Errors</th>
                <th className="num">Error %</th>
                <th className="num">Avg duration</th>
                <th className="num">Max duration</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.value}>
                  <td>{groupBy === 'service' ? <ServiceTag name={group.value} /> : group.value}</td>
                  <td className="num">{group.count.toLocaleString()}</td>
                  <td className="num">{group.errors.toLocaleString()}</td>
                  <td className="num">{((group.errors / group.count) * 100).toFixed(1)}%</td>
                  <td className="num">{group.durations.length ? formatDuration(group.durations.reduce((a, b) => a + b, 0) / group.durations.length) : '–'}</td>
                  <td className="num">{group.durations.length ? formatDuration(Math.max(...group.durations)) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {kind === 'pie' && (
        <div className="logviz__pie">
          <Donut slices={top.map((group, i) => ({ key: group.value, label: group.value, value: group.count, color: colorFor(groupBy, group.value, i) }))} centre={total.toLocaleString()} />
          <ul className="legend legend--col">
            {top.map((group, i) => (
              <li key={group.value} className="legend-item">
                <span className="sev-swatch" style={{ background: colorFor(groupBy, group.value, i) }} />
                <span className="grow">{group.value}</span>
                <b>{group.count.toLocaleString()}</b>
                <span className="muted">{((group.count / Math.max(1, total)) * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const pattern = (body: string) => body.replace(/\b[0-9a-f]{8,}\b/gi, '*').replace(/\d+(\.\d+)?/g, '*');

/** Groups logs by message shape; numbers and hex ids collapse to `*`. */
export function PatternsView({ logs, onFilter }: { logs: LogRow[]; onFilter: (text: string) => void }) {
  const rows = useMemo(() => {
    const map = new Map<string, { pattern: string; sample: string; count: number; errors: number; services: Set<string> }>();
    for (const log of logs) {
      const key = pattern(log.body);
      const row = map.get(key) ?? { pattern: key, sample: log.body, count: 0, errors: 0, services: new Set<string>() };
      row.count += 1;
      if (isErrorLog(log)) row.errors += 1;
      row.services.add(log.service);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [logs]);
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className="logviz scroll-x">
      <table className="table">
        <thead>
          <tr>
            <th>Count</th>
            <th>Pattern</th>
            <th>Error share</th>
            <th>Services</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pattern}>
              <td className="pattern__count">
                <span className="pattern__bar" style={{ width: `${(row.count / max) * 100}%` }} />
                <b>{row.count.toLocaleString()}</b>
              </td>
              <td>
                <button type="button" className="link-btn mono" onClick={() => onFilter(row.sample)}>
                  {row.pattern}
                </button>
              </td>
              <td>
                <span className="pattern__split" title={`${row.errors} errors`}>
                  <span style={{ width: `${(row.errors / row.count) * 100}%`, background: COLOR.error }} />
                </span>{' '}
                {((row.errors / row.count) * 100).toFixed(1)}%
              </td>
              <td>
                <span className="pattern__services">
                  {[...row.services].map((name) => (
                    <ServiceTag key={name} name={name} />
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
