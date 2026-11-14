import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { DashboardWidget } from '../components/DashboardWidget';
import { EmptyState } from '../components/States';
import { Popover } from '../components/Popover';
import { useView } from '../lib/data';
import { DASHBOARDS, findDashboard } from '../lib/dashboards';
import { href, navigate } from '../lib/router';
import { useToast } from '../lib/toast';

const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', day: '2-digit', year: 'numeric', timeZone: 'UTC' };

export function DashboardList() {
  const view = useView();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const built = new Date(view.bundle.generatedAt).toLocaleDateString('en-US', DATE_FORMAT);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return DASHBOARDS.filter((dashboard) => !needle || `${dashboard.name} ${dashboard.description}`.toLowerCase().includes(needle));
  }, [search]);

  return (
    <div className="page">
      <section className="card">
        <div className="card__head">
          <label className="search search--wide">
            <Search size={14} aria-hidden="true" />
            <input type="search" placeholder="Search" aria-label="Search dashboards" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="card__spacer" />
          <select className="select" aria-label="Dashboard state" defaultValue="active">
            <option value="active">Active Dashboards</option>
          </select>
          <button type="button" className="btn btn--primary" onClick={() => toast()}>
            <Plus size={14} aria-hidden="true" />
            Create Dashboard
          </button>
        </div>
        <div className="table-scroll">
          <table className="table table--dashboards">
            <thead>
              <tr><th>Name</th><th>Description</th><th>Owner</th><th>Last Modified</th><th>Created At</th></tr>
            </thead>
            <tbody>
              {rows.map((dashboard) => (
                <tr key={dashboard.id} className="row--link" tabIndex={0} onClick={() => navigate(`dashboards/${dashboard.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`dashboards/${dashboard.id}`); }}>
                  <td><a className="dash-name" href={href(`dashboards/${dashboard.id}`)} onClick={(event) => event.stopPropagation()}>{dashboard.name}</a></td>
                  <td className="muted">{dashboard.description}</td>
                  <td><span className="owner"><i className="avatar avatar--sm" aria-hidden="true">B</i>Built-in</span></td>
                  <td>{built}</td>
                  <td>{built}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title="No dashboards match">Try a different search.</EmptyState>}
        </div>
        <div className="card__foot muted">Dashboards are defined in code for this mock; dates show when the telemetry bundle was generated.</div>
      </section>
    </div>
  );
}

export function DashboardDetail({ id }: { id: string }) {
  const view = useView();
  const toast = useToast();
  const dashboard = findDashboard(id);
  const names = useMemo(() => view.workloads.map((workload) => workload.name), [view.workloads]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const selectedNames = useMemo(() => chosen ?? new Set(names), [chosen, names]);
  const workloads = useMemo(() => view.workloads.filter((workload) => selectedNames.has(workload.name)), [view.workloads, selectedNames]);
  const env = view.bundle.environment;

  if (!dashboard) {
    return (
      <div className="page">
        <EmptyState title="Dashboard not found" action={<a className="btn" href={href('dashboards')}>Back to dashboards</a>}>
          There is no dashboard called “{id}” in this mock.
        </EmptyState>
      </div>
    );
  }

  const toggle = (name: string) => {
    const next = new Set(selectedNames);
    if (!next.delete(name)) next.add(name);
    setChosen(next.size === names.length ? null : next);
  };

  return (
    <div className="page">
      <div className="dash-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href={href('dashboards')}>Dashboards</a>
          <ChevronRight size={12} aria-hidden="true" />
          <span className="crumbs__current">{dashboard.name}</span>
        </nav>
        <div className="card__spacer" />
        <span className="muted">Built-in · defined in code</span>
        <button type="button" className="btn btn--primary" onClick={() => toast()}>
          <Plus size={14} aria-hidden="true" />
          Create Widget
        </button>
      </div>
      <div className="dash-vars" aria-label="Dashboard variables">
        <span className="var"><span className="var__name">clusters</span><span className="var__value">{env.cluster}</span></span>
        <Popover
          buttonClassName="var var--btn"
          button={
            <>
              <span className="var__name">workloads</span>
              <span className="var__value">{chosen ? `${selectedNames.size} of ${names.length}` : 'All'}</span>
            </>
          }
          panelClassName="scope-panel"
        >
          {() => (
            <div role="group" aria-label="Workloads">
              <div className="scope-panel__title">Workloads</div>
              {names.map((name) => (
                <label key={name} className="scope-panel__row">
                  <input type="checkbox" checked={selectedNames.has(name)} onChange={() => toggle(name)} />
                  <span>{name}</span>
                </label>
              ))}
              {chosen && <button type="button" className="btn btn--ghost" onClick={() => setChosen(null)}>Select all</button>}
            </div>
          )}
        </Popover>
        <span className="var"><span className="var__name">namespaces</span><span className="var__value">{env.namespace}</span></span>
      </div>
      {workloads.length === 0 ? (
        <EmptyState title="No workloads selected" action={<button type="button" className="btn" onClick={() => setChosen(null)}>Select all</button>}>
          Pick at least one workload to populate the widgets.
        </EmptyState>
      ) : (
        <div className="widgets">
          {dashboard.widgets.map((widget) => <DashboardWidget key={widget.id} widget={widget} view={view} workloads={workloads} />)}
        </div>
      )}
    </div>
  );
}
