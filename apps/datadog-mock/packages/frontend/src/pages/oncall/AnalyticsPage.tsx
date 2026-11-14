import { useMemo, type ReactNode } from 'react';
import { computeAnalytics, dateTime, duration, type Breakdown } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { paths } from '../../lib/router';
import { Histogram } from '../../components/charts/Histogram';
import { ServiceTag } from '../../components/ui';
import { Avatar, Section, TeamPill } from '../../components/oncall/kit';

const pct = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`);

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="oc-kpi">
      <div className="oc-kpi__label">{label}</div>
      <div className="oc-kpi__value">{value}</div>
      {hint && <div className="oc-kpi__hint muted">{hint}</div>}
    </div>
  );
}

function Bar({ value, max, tone = 'primary' }: { value: number; max: number; tone?: 'primary' | 'alert' | 'warn' }) {
  return (
    <span className="oc-bar" aria-hidden="true">
      <span className={`oc-bar__fill oc-bar__fill--${tone}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </span>
  );
}

function BreakdownTable({ rows, label, render }: { rows: Breakdown[]; label: string; render: (key: string) => ReactNode }) {
  const max = Math.max(1, ...rows.map((row) => row.pages));
  return (
    <div className="scroll-x">
      <table className="table oc-table oc-table--dense">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">Pages</th>
            <th className="oc-col-bar">
              <span className="sr-only">Share</span>
            </th>
            <th className="num">High</th>
            <th className="num">Low</th>
            <th className="num">MTTA</th>
            <th className="num">MTTR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{render(row.key)}</td>
              <td className="num">{row.pages}</td>
              <td className="oc-col-bar">
                <Bar value={row.pages} max={max} />
              </td>
              <td className="num">{row.high}</td>
              <td className="num">{row.low}</td>
              <td className="num">{duration(row.mttaMs)}</td>
              <td className="num">{duration(row.mttrMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsPage() {
  const { model, team, user } = useOnCall();
  const stats = useMemo(() => computeAnalytics(model), [model]);
  const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const resolvedTotal = stats.resolvedBy.monitor + stats.resolvedBy.user + stats.resolvedBy.policy;
  const monitors = new Map(model.monitors.map((monitor) => [monitor.id, monitor]));
  const monitorMax = Math.max(1, ...stats.byMonitor.map((row) => row.pages));
  const loadMax = Math.max(1, ...stats.responders.map((row) => row.notifications));

  return (
    <div className="oc-body">
      <header className="oc-head oc-head--split">
        <div>
          <h1 className="oc-head__title">Analytics</h1>
          <p className="oc-head__sub muted">
            Past 1 Week · {dateTime(stats.from)} – {dateTime(stats.to)} UTC
          </p>
        </div>
      </header>

      <div className="oc-kpis">
        <Kpi label="Pages" value={String(stats.pages)} hint={`${stats.acknowledged} acknowledged`} />
        <Kpi label="High urgency" value={String(stats.high)} hint={`${stats.low} low urgency`} />
        <Kpi label="MTTA" value={duration(stats.mttaMs)} hint="Median time to acknowledge" />
        <Kpi label="MTTR" value={duration(stats.mttrMs)} hint="Median time to resolve" />
        <Kpi label="Acknowledged within 5m" value={pct(stats.ackWithin5Pct)} hint="Of acknowledged Pages" />
        <Kpi label="Escalated" value={pct(stats.escalatedPct)} hint="Reached a second step or repeat" />
      </div>

      <div className="oc-analytics">
        <Section title="Pages per day" className="oc-analytics__wide">
          <div className="legend">
            <span className="legend-item">
              <span className="sev-swatch" style={{ background: 'var(--alert)' }} /> High urgency
            </span>
            <span className="legend-item">
              <span className="sev-swatch" style={{ background: 'var(--warn)' }} /> Low urgency
            </span>
          </div>
          <Histogram
            bins={stats.byDay.map((day) => ({ key: String(day.day), label: dayFmt.format(day.day), counts: [day.high, day.low] }))}
            colors={['var(--alert)', 'var(--warn)']}
            segmentLabels={['High', 'Low']}
            height={190}
            ariaLabel={`Pages per day: ${stats.byDay.map((day) => `${dayFmt.format(day.day)} ${day.high} high, ${day.low} low`).join('; ')}`}
          />
        </Section>

        <Section title="Resolved by">
          <ul className="oc-resolved">
            {[
              { key: 'monitor', label: 'Monitor recovered', value: stats.resolvedBy.monitor },
              { key: 'user', label: 'Responder', value: stats.resolvedBy.user },
              { key: 'policy', label: 'Policy exhausted', value: stats.resolvedBy.policy },
            ].map((row) => (
              <li key={row.key}>
                <span className="grow">{row.label}</span>
                <Bar value={row.value} max={Math.max(1, resolvedTotal)} />
                <strong className="num">{row.value}</strong>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="By team">
          <BreakdownTable rows={stats.byTeam} label="Team" render={(key) => <TeamPill team={team(key)} />} />
        </Section>

        <Section title="By service">
          <BreakdownTable rows={stats.byService} label="Service" render={(key) => <ServiceTag name={key} />} />
        </Section>

        <Section title="By monitor">
          <div className="scroll-x">
            <table className="table oc-table oc-table--dense">
              <thead>
                <tr>
                  <th>Monitor</th>
                  <th className="num">Pages</th>
                  <th className="oc-col-bar">
                    <span className="sr-only">Share</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.byMonitor.map((row) => (
                  <tr key={row.monitorId}>
                    <td>
                      <a href={`#${paths.monitor(row.monitorId)}`}>{monitors.get(row.monitorId)?.name ?? `#${row.monitorId}`}</a>
                    </td>
                    <td className="num">{row.pages}</td>
                    <td className="oc-col-bar">
                      <Bar value={row.pages} max={monitorMax} tone="alert" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Responder load" className="oc-analytics__wide">
          <div className="scroll-x">
            <table className="table oc-table oc-table--dense">
              <thead>
                <tr>
                  <th>Responder</th>
                  <th className="num">Notifications</th>
                  <th className="oc-col-bar">
                    <span className="sr-only">Share</span>
                  </th>
                  <th className="num">Off-hours</th>
                  <th className="num">Acknowledgments</th>
                  <th className="num">Ack rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.responders.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      <span className="oc-person">
                        <Avatar user={user(row.userId)} size={20} />
                        {user(row.userId)?.name ?? row.userId}
                      </span>
                    </td>
                    <td className="num">{row.notifications}</td>
                    <td className="oc-col-bar">
                      <Bar value={row.notifications} max={loadMax} />
                    </td>
                    <td className="num">{row.offHours ? <span className="text-warn">{row.offHours}</span> : 0}</td>
                    <td className="num">{row.acknowledgments}</td>
                    <td className="num">{pct(row.notifications ? row.acknowledgments / row.notifications : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
