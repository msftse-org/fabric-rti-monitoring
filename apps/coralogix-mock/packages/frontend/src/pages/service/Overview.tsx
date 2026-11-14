import { Bell, Ruler } from 'lucide-react';
import { useMemo } from 'react';
import { formatCount, formatDuration } from '@telemetry';
import { Legend } from '../../charts/Legend';
import { LineChart, type LineSeries } from '../../charts/LineChart';
import { StackedBars } from '../../charts/StackedBars';
import { Card } from '../../components/Card';
import { Chip, SloChips } from '../../components/Chips';
import { EmptyState } from '../../components/States';
import { StatCard } from '../../components/StatCard';
import { useData } from '../../lib/data';
import { APDEX_T_MS } from '../../lib/derive';
import { percent } from '../../lib/format';
import { SERIES, TOP_LINE_COLORS } from '../../lib/palette';
import { durationByScenario, serviceSeries } from '../../lib/series';
import { MINUTE } from '../../lib/time';
import { DependencyMap } from './DependencyMap';
import type { ServiceTabProps } from './types';

const APDEX_BANDS = [
  { from: 0, to: 0.5, color: 'rgba(192, 20, 69, 0.16)' },
  { from: 0.5, to: 0.85, color: 'rgba(225, 138, 60, 0.12)' },
  { from: 0.85, to: 1, color: 'rgba(62, 193, 131, 0.12)' },
];

export function Overview({ service, filters }: ServiceTabProps) {
  const { win, range, derived } = useData();
  const series = useMemo(() => serviceSeries(win, range, service.name), [win, range, service.name]);
  const topLines = useMemo(() => {
    const lines = durationByScenario(win, series.times, service.name).filter((line) => !filters.transaction || line.label === filters.transaction);
    return lines.slice(0, 5).map<LineSeries>((line, index) => ({ key: line.label, label: line.label, color: TOP_LINE_COLORS[index % TOP_LINE_COLORS.length], values: line.values }));
  }, [win, series.times, service.name, filters.transaction]);

  const bars = series.times.map((t, index) => ({ t, values: [series.successes[index], series.errors[index]] }));
  const edges = useMemo(() => derived.edges.filter((edge) => edge.from === service.name || edge.to === service.name), [derived.edges, service.name]);
  const successes = service.requests - service.errors;

  return (
    <>
      <div className="stat-grid">
        <StatCard title="Slo" hint="Two derived SLOs: 99% availability and 95% of requests under 500ms">
          <SloChips ok={service.sloOk} breached={service.sloBreached} />
        </StatCard>
        <StatCard title="Incidents" hint="Derived: one incident per breached SLO">
          {service.incidents > 0 ? (
            <Chip tone="bad">
              <Bell size={16} aria-hidden /> {service.incidents} TRIGGERED
            </Chip>
          ) : (
            <Chip tone="ok">NO INCIDENTS</Chip>
          )}
        </StatCard>
        <StatCard title="Average latency">
          <span className="stat-value">{formatDuration(service.avgMs)}</span>
        </StatCard>
        <StatCard title="Requests/min" hint="Requests in the selected window divided by the minutes of data it covers">
          <span className="stat-value">{formatCount(service.rpm)}</span>
        </StatCard>
        <StatCard title="Error rate">
          <span className="stat-value">{percent(service.errorRate)}</span>
        </StatCard>
      </div>

      <div className="chart-grid-3">
        <Card title="Transactions" meta={`${formatCount(successes)} Successes ${formatCount(service.errors)} Errors`}>
          <StackedBars
            ariaLabel="Transactions per minute"
            height={230}
            bucketMs={MINUTE}
            bars={bars}
            series={[
              { key: 'success', label: 'Successes', color: SERIES.success },
              { key: 'error', label: 'Errors', color: SERIES.ok },
            ]}
          />
          <Legend items={[{ label: 'Successes', color: SERIES.success }, { label: 'Errors', color: SERIES.ok }]} />
        </Card>
        <Card title="Errors" meta={`By version · ${service.summary.version}`}>
          <StackedBars
            ariaLabel="Errors per minute"
            height={230}
            bucketMs={MINUTE}
            bars={series.times.map((t, index) => ({ t, values: [series.errors[index]] }))}
            series={[{ key: 'errors', label: service.summary.version, color: SERIES.error }]}
          />
          <Legend items={[{ label: service.summary.version, color: SERIES.error }]} />
        </Card>
        <Card
          title="Apdex score"
          meta="Total"
          actions={
            <span className="card-threshold">
              <Ruler size={12} aria-hidden /> Threshold = {APDEX_T_MS}ms
            </span>
          }
        >
          <LineChart
            ariaLabel="Apdex score over time"
            times={series.times}
            height={230}
            yMax={1}
            bands={APDEX_BANDS}
            yFormat={(value) => String(Number(value.toFixed(2)))}
            series={[{ key: 'apdex', label: 'apdex_score', color: SERIES.p95, values: series.apdex }]}
          />
          <Legend items={[{ label: 'apdex_score', color: SERIES.p95 }]} />
        </Card>

        <Card title="Top 5 time consuming transactions" meta="Avg duration by scenario">
          {topLines.length === 0 ? (
            <EmptyState title="No duration metrics" hint="No demo.request.duration points match this window and filter." />
          ) : (
            <>
              <LineChart ariaLabel="Average duration by scenario" times={series.times} height={230} yFormat={formatDuration} series={topLines} />
              <Legend items={topLines.map((line) => ({ label: line.label, color: line.color }))} />
            </>
          )}
        </Card>
        <Card title="Latency" meta="By service">
          <LineChart
            ariaLabel="Latency percentiles"
            times={series.times}
            height={230}
            yFormat={formatDuration}
            series={[
              { key: 'avg', label: 'Avg', color: SERIES.avg, values: series.avg },
              { key: 'p50', label: 'P50', color: SERIES.p50, values: series.p50 },
              { key: 'p95', label: 'P95', color: SERIES.p95, values: series.p95 },
              { key: 'p99', label: 'P99', color: SERIES.p99, values: series.p99 },
            ]}
          />
          <Legend
            items={[
              { label: 'Avg', color: SERIES.avg },
              { label: 'P50', color: SERIES.p50 },
              { label: 'P95', color: SERIES.p95 },
              { label: 'P99', color: SERIES.p99 },
            ]}
          />
        </Card>
        <Card title="Map" bare>
          <DependencyMap service={service.name} edges={edges} />
        </Card>
      </div>
    </>
  );
}
