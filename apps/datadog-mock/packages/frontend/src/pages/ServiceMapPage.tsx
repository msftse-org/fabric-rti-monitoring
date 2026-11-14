import { useMemo, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { formatDuration, formatPercent } from '@telemetry';
import { useApp } from '../lib/app';
import { navigate, paths } from '../lib/router';
import { useInert } from '../lib/toast';
import { ServiceMap } from '../components/ServiceMap';
import { Select } from '../components/Select';
import { HealthChip, ServiceTag } from '../components/ui';

export function ServiceMapPage() {
  const { stats, edges, statsByName } = useApp();
  const inert = useInert();
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState('all');
  const stat = selected ? statsByName[selected] : undefined;
  const options = useMemo(() => [{ value: 'all', label: 'All services' }, ...stats.map((s) => ({ value: s.name, label: s.name }))], [stats]);

  return (
    <div className="page page--map">
      <div className="page__bar">
        <Select label="Focus service" prefix="Show" value={focus} options={options} onChange={setFocus} />
        <span className="chip chip--soft">env:aks</span>
        <span className="chip chip--soft">namespace:otel-demo</span>
        <button type="button" className="btn btn--ghost" onClick={inert}>
          Color by: Health
        </button>
        <span className="grow" />
        <div className="btn-group" role="group" aria-label="Zoom">
          <button type="button" className="btn btn--icon" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, +(value - 0.15).toFixed(2)))}>
            <Minus size={14} />
          </button>
          <button type="button" className="btn btn--icon" aria-label="Reset zoom" onClick={() => setZoom(1)}>
            <Scan size={14} />
          </button>
          <button type="button" className="btn btn--icon" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, +(value + 0.15).toFixed(2)))}>
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="map">
        <ServiceMap stats={stats} edges={edges} selected={selected} focus={focus === 'all' ? undefined : focus} zoom={zoom} onSelect={setSelected} />
        {stat && (
          <aside className="map__card" aria-label={`${stat.name} summary`}>
            <header>
              <ServiceTag name={stat.name} />
              <HealthChip status={stat.status} />
            </header>
            <dl>
              <dt>Requests</dt>
              <dd>{stat.requests.toLocaleString()}</dd>
              <dt>Error rate</dt>
              <dd>{formatPercent(stat.errorRate)}</dd>
              <dt>p95 latency</dt>
              <dd>{formatDuration(stat.p95)}</dd>
              <dt>Upstream</dt>
              <dd>{stat.dependedOnBy.join(', ') || '—'}</dd>
              <dt>Downstream</dt>
              <dd>{stat.dependsOn.join(', ') || '—'}</dd>
            </dl>
            <button type="button" className="btn btn--primary" onClick={() => navigate(paths.service(stat.name))}>
              View service
            </button>
          </aside>
        )}
      </div>
      <p className="page__hint muted">Edges are derived from parent/child spans across services; datastore edges come from client spans. Click a service for details.</p>
    </div>
  );
}
