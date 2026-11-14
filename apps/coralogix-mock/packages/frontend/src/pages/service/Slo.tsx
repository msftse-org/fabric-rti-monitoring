import { useMemo } from 'react';
import { Legend } from '../../charts/Legend';
import { LineChart } from '../../charts/LineChart';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chips';
import { useData } from '../../lib/data';
import { SLO_AVAILABILITY_TARGET, SLO_LATENCY_TARGET, type SloResult } from '../../lib/derive';
import { percent } from '../../lib/format';
import { SERIES } from '../../lib/palette';
import { serviceSeries } from '../../lib/series';
import type { ServiceTabProps } from './types';

function budgetLabel(slo: SloResult): string {
  const remaining = Math.round(slo.budgetRemaining * 100);
  return remaining < 0 ? `${remaining}% (overspent)` : `${remaining}%`;
}

function SloCard({ slo, times, burn, bad }: { slo: SloResult; times: number[]; burn: (number | null)[]; bad: string }) {
  const budget = 1 - slo.target;
  const budgetText = `${Math.round(budget * 100)}%`;
  const width = Math.max(0, Math.min(1, slo.budgetRemaining)) * 100;
  return (
    <Card title={slo.name} meta={slo.description} bare actions={<Chip tone={slo.breached ? 'bad' : 'ok'}>{slo.breached ? 'BREACHED' : 'OK'}</Chip>} className="slo-card">
      <dl className="slo-facts">
        <div>
          <dt>Target</dt>
          <dd>{Math.round(slo.target * 100)}%</dd>
        </div>
        <div>
          <dt>Compliance</dt>
          <dd>{(slo.compliance * 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt>Burn rate</dt>
          <dd>{slo.burnRate.toFixed(1)}x</dd>
        </div>
        <div>
          <dt>Error budget left</dt>
          <dd>{budgetLabel(slo)}</dd>
        </div>
      </dl>
      <div className="budget-bar" role="img" aria-label={`Error budget remaining ${budgetLabel(slo)}`}>
        <i className={slo.breached ? 'is-over' : undefined} style={{ width: `${width}%` }} />
      </div>
      <h4 className="slo-chart-title">{bad} per minute against the {budgetText} budget</h4>
      <LineChart
        ariaLabel={`${slo.name} budget burn`}
        times={times}
        height={200}
        yFormat={(value) => percent(value)}
        threshold={budget}
        series={[{ key: slo.id, label: bad, color: slo.breached ? SERIES.errorLog : SERIES.avg, values: burn }]}
      />
      <Legend items={[{ label: bad, color: slo.breached ? SERIES.errorLog : SERIES.avg }, { label: 'Budget', color: '#8a8a90' }]} />
    </Card>
  );
}

export function Slo({ service }: ServiceTabProps) {
  const { win, range } = useData();
  const series = useMemo(() => serviceSeries(win, range, service.name), [win, range, service.name]);
  const slowShare = useMemo(() => series.latencyCompliance.map((value) => (value === null ? null : 1 - value)), [series.latencyCompliance]);
  const [availability, latency] = service.slos;

  return (
    <div className="slo-grid">
      <SloCard slo={availability} times={series.times} burn={series.errorRate} bad="Failed requests" />
      <SloCard slo={latency} times={series.times} burn={slowShare} bad="Requests over 500ms" />
      <p className="note slo-note">
        SLOs are derived from real request data: {SLO_AVAILABILITY_TARGET * 100}% of requests succeed, and {SLO_LATENCY_TARGET * 100}% of requests finish under 500ms (estimated from the per-minute p50/p95/p99). Coralogix SLO definitions are not part of this mock.
      </p>
    </div>
  );
}
