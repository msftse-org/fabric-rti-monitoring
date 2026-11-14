import { useMemo } from 'react';
import { formatCount, formatDuration, formatPercent } from '@telemetry';
import type { ChartKind, Widget } from '../lib/dashboards';
import { logHistogram } from '../lib/histogram';
import { HEALTH_COLOR } from '../lib/health';
import { runMetricQuery } from '../lib/metrics';
import type { View, Workload } from '../lib/model';
import { workloadColor } from '../lib/palette';
import {
  funnel,
  rankWorkloads,
  scenarioStat,
  SERIES_FORMAT,
  workloadSeries,
  workloadStat,
} from '../lib/widgets';
import { Card, Stat } from './Card';
import { Chart, Legend } from './Chart';
import { Donut } from './Donut';
import { MetricBar } from './MetricBar';
import { EmptyState } from './States';
import { IssuePill, WorkloadName } from './WorkloadLink';

interface WidgetProps {
  widget: Widget;
  view: View;
  /** Workloads selected by the dashboard variable. */
  workloads: Workload[];
}

function chartProps(view: View, kind: ChartKind) {
  return { axis: view.minuteAxis, step: 60_000, kind, height: 190 } as const;
}

function Body({ widget, view, workloads }: WidgetProps) {
  const selected = useMemo(() => workloads.map((workload) => workload.name), [workloads]);
  const query = widget.kind === 'metric' ? widget.query : null;
  const metricResult = useMemo(
    () => (query ? runMetricQuery(view, selected.length === view.workloads.length ? query : { ...query, tokens: [...query.tokens, `workload:${selected.join(',')}`] }) : null),
    [view, query, selected],
  );
  const logs = useMemo(
    () => (widget.kind === 'logs' ? logHistogram(view.logs.filter((log) => selected.includes(log.service)), view.since, view.newest) : null),
    [widget.kind, view, selected],
  );

  switch (widget.kind) {
    case 'stat': {
      const stat = workloadStat(view, workloads, widget.metric);
      return <Stat label={widget.title} value={stat.text} caption={stat.caption} tone={stat.tone} />;
    }
    case 'scenarioStat': {
      const stat = scenarioStat(view, widget.scenario, widget.stat);
      return <Stat label={widget.title} value={stat.text} caption={stat.caption} tone={stat.tone} />;
    }
    case 'timeseries': {
      const series = workloadSeries(workloads, widget.metric);
      const format = SERIES_FORMAT[widget.metric];
      return (
        <>
          <Chart {...chartProps(view, widget.chart)} stacked={widget.chart === 'bar' && (widget.metric === 'requests' || widget.metric === 'errors')} series={series} label={widget.title} formatValue={format.value} formatTick={format.tick} />
          <Legend items={series} />
        </>
      );
    }
    case 'metric': {
      if (!metricResult || metricResult.series.length === 0) return <EmptyState title="No data">Nothing matches in this time range.</EmptyState>;
      const isDuration = metricResult.unit === 'ms';
      return (
        <>
          <Chart {...chartProps(view, widget.chart)} stacked={widget.chart === 'bar'} series={metricResult.series} label={widget.title} formatValue={isDuration ? formatDuration : formatCount} formatTick={isDuration ? formatDuration : formatCount} />
          <Legend items={metricResult.series} />
        </>
      );
    }
    case 'toplist': {
      const rows = rankWorkloads(workloads, widget.metric);
      const max = Math.max(...rows.map((row) => row.value), 0.0001);
      return (
        <ol className="toplist">
          {rows.map((row) => (
            <li key={row.name}>
              <WorkloadName name={row.name} />
              <MetricBar text={row.text} value={row.value} max={max} color={widget.metric === 'p95' ? '#f0a30a' : '#e0382f'} />
            </li>
          ))}
        </ol>
      );
    }
    case 'funnel': {
      const rows = funnel(view);
      const top = Math.max(rows[0]?.value ?? 0, 1);
      return (
        <ol className="toplist toplist--funnel">
          {rows.map((row) => (
            <li key={row.name}>
              <span className="wl-name"><i style={{ background: workloadColor(row.name) }} aria-hidden="true" />{row.name}</span>
              <MetricBar text={`${row.text} · ${formatPercent(row.value / top, 0)}`} value={row.value} max={top} color={workloadColor(row.name)} />
            </li>
          ))}
        </ol>
      );
    }
    case 'donut': {
      const slices = workloads
        .map((workload) => ({ id: workload.name, label: workload.name, value: widget.metric === 'requests' ? workload.requests : workload.errors, color: workloadColor(workload.name) }))
        .filter((slice) => slice.value > 0);
      return slices.length ? <Donut slices={slices} label={widget.title} /> : <EmptyState title="No data">Nothing to show for this selection.</EmptyState>;
    }
    case 'logs':
      return logs && logs.series.length ? (
        <>
          <Chart axis={logs.axis} step={logs.step} series={logs.series} kind="bar" stacked height={190} label="Log volume by level" />
          <Legend items={logs.series} />
        </>
      ) : <EmptyState title="No logs">No log lines for this selection.</EmptyState>;
    case 'table':
      return (
        <div className="table-scroll">
          <table className="table table--compact">
            <thead><tr><th>Workload</th><th className="num">Reqs/s</th><th className="num">Errors</th><th className="num">P95</th><th className="num">Requests</th><th>Issues</th></tr></thead>
            <tbody>
              {workloads.map((workload) => (
                <tr key={workload.name}>
                  <td><WorkloadName name={workload.name} color={HEALTH_COLOR[workload.health]} /></td>
                  <td className="num">{workload.rps.toFixed(2)}</td>
                  <td className="num">{formatPercent(workload.errorRate, 1)}</td>
                  <td className="num">{formatDuration(workload.p95)}</td>
                  <td className="num">{formatCount(workload.requests)}</td>
                  <td><IssuePill count={workload.issues.length} severity={workload.issues[0]?.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function DashboardWidget(props: WidgetProps) {
  const { widget } = props;
  const bare = widget.kind === 'stat' || widget.kind === 'scenarioStat';
  return (
    <div className={`widget widget--${widget.span}`}>
      {bare ? <Body {...props} /> : <Card title={widget.title}><Body {...props} /></Card>}
    </div>
  );
}
