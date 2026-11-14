import { useState } from 'react';
import { Plus, Search, Star } from 'lucide-react';
import { formatAgo } from '@telemetry';
import { useApp } from '../lib/app';
import { navigate, paths } from '../lib/router';
import { useInert } from '../lib/toast';
import { PageTabs } from '../components/ui';

export const DASHBOARD_ID = 'aks-services-overview';

export function DashboardsPage() {
  const data = useApp();
  const inert = useInert();
  const [filter, setFilter] = useState('');
  const [starred, setStarred] = useState(false);
  const title = 'AKS Services Overview';
  const visible = !filter.trim() || title.toLowerCase().includes(filter.trim().toLowerCase());

  return (
    <div className="page">
      <div className="page__head page__head--split">
        <h1 className="page__title">Dashboard List</h1>
        <span className="grow" />
        <button type="button" className="btn btn--primary" onClick={inert}>
          <Plus size={14} /> New Dashboard
        </button>
      </div>
      <div className="page__bar">
        <div className="input-wrap page__filter">
          <Search size={13} />
          <input className="input" aria-label="Search dashboards" placeholder="Search dashboards" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </div>
        <PageTabs
          tabs={[
            { id: 'all', label: 'All Dashboards' },
            { id: 'shared', label: 'Shared' },
            { id: 'mine', label: 'Created by me' },
          ]}
          current="all"
          onSelect={(id) => id !== 'all' && inert()}
        />
      </div>
      <div className="page__pad">
        <div className="card scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Name</th>
                <th>Description</th>
                <th>Tags</th>
                <th>Modified</th>
                <th>Widgets</th>
              </tr>
            </thead>
            <tbody>
              {visible && (
                <tr className="row-link" onClick={() => navigate(paths.dashboard(DASHBOARD_ID))}>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={starred ? 'Remove from favourites' : 'Add to favourites'}
                      aria-pressed={starred}
                      onClick={(event) => {
                        event.stopPropagation();
                        setStarred((value) => !value);
                      }}
                    >
                      <Star size={14} fill={starred ? 'var(--warn)' : 'none'} />
                    </button>
                  </td>
                  <td>
                    <a href={`#${paths.dashboard(DASHBOARD_ID)}`} onClick={(event) => event.stopPropagation()}>
                      <b>{title}</b>
                    </a>
                  </td>
                  <td className="muted">Requests, errors, latency, logs and traces of the otel-demo services on AKS.</td>
                  <td>
                    <span className="chip chip--soft">env:{data.bundle.environment.environment}</span> <span className="chip chip--soft">team:otel-demo</span>
                  </td>
                  <td>{formatAgo(data.bundle.generatedAt)}</td>
                  <td>10</td>
                </tr>
              )}
              {!visible && (
                <tr>
                  <td colSpan={6} className="muted">
                    No dashboards match “{filter}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
