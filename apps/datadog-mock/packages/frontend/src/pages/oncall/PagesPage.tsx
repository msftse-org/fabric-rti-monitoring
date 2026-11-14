import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { DAY, type Page } from '@oncall';
import { useOnCall } from '../../lib/oncall';
import { useIsMobile } from '../../lib/hooks';
import { navigate, paths, type PageFilter } from '../../lib/router';
import { Select } from '../../components/Select';
import { PageTabs } from '../../components/ui';
import { PagesTable } from './shared';
import { PagePanel } from './PageDetail';

const PAGE_SIZE = 25;

const STATUS_TABS: { id: PageFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'triggered', label: 'Triggered' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
];

const RANGES = [
  { value: 1, label: 'Past 1 Day' },
  { value: 7, label: 'Past 1 Week' },
  { value: 14, label: 'Past 2 Weeks' },
];

function matchesStatus(page: Page, status: PageFilter): boolean {
  if (status === 'all') return true;
  if (status === 'active') return page.status !== 'resolved';
  return page.status === status;
}

function toggle(set: string[], value: string): string[] {
  return set.includes(value) ? set.filter((item) => item !== value) : [...set, value];
}

export function PagesPage({ status, pageId }: { status: PageFilter; pageId: number | null }) {
  const { model, me, now, team } = useOnCall();
  const mobile = useIsMobile();
  const [controls, setControls] = useState(!mobile);
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [myTeams, setMyTeams] = useState(false);
  const [urgencies, setUrgencies] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(7);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
  }, [status, scope, myTeams, urgencies, teams, services, query, days]);

  const scoped = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^#/, '');
    return model.pages.filter((page) => {
      if (page.triggeredAt < now - days * DAY) return false;
      if (scope === 'mine' && !page.responderIds.includes(me.id)) return false;
      if (myTeams && !me.teamIds.includes(page.teamId)) return false;
      if (!needle) return true;
      return [String(page.id), page.title, page.description, page.service ?? '', team(page.teamId)?.name ?? ''].some((text) => text.toLowerCase().includes(needle));
    });
  }, [model.pages, now, days, scope, myTeams, me, query, team]);

  const faceted = (exclude: 'urgency' | 'team' | 'service' | null) =>
    scoped.filter(
      (page) =>
        (exclude === 'urgency' || !urgencies.length || urgencies.includes(page.urgency)) &&
        (exclude === 'team' || !teams.length || teams.includes(page.teamId)) &&
        (exclude === 'service' || !services.length || services.includes(page.service ?? '')),
    );
  const filtered = faceted(null);
  const rows = filtered.filter((page) => matchesStatus(page, status));
  const visible = rows.slice(offset, offset + PAGE_SIZE);

  const count = (pages: Page[], key: (page: Page) => string) => {
    const counts = new Map<string, number>();
    for (const page of pages) counts.set(key(page), (counts.get(key(page)) ?? 0) + 1);
    return counts;
  };
  const statusPages = (pages: Page[]) => pages.filter((page) => matchesStatus(page, status));
  const urgencyCounts = count(statusPages(faceted('urgency')), (page) => page.urgency);
  const teamCounts = count(statusPages(faceted('team')), (page) => page.teamId);
  const serviceCounts = count(statusPages(faceted('service')).filter((page) => page.service), (page) => page.service!);

  return (
    <div className="oc-body oc-body--list">
      <header className="oc-head">
        <h1 className="oc-head__title">Pages</h1>
      </header>
      <div className="input-wrap oc-search">
        <Search size={14} aria-hidden="true" />
        <input className="input" type="search" placeholder="Search Pages by title, #id, service or team" aria-label="Search Pages" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="oc-listbar">
        <button type="button" className="btn btn--ghost" aria-expanded={controls} aria-controls="oc-page-facets" onClick={() => setControls((value) => !value)}>
          {controls ? <PanelLeftClose size={14} aria-hidden="true" /> : <PanelLeftOpen size={14} aria-hidden="true" />}
          {controls ? 'Hide Controls' : 'Show Controls'}
        </button>
        <span className="muted">
          Showing {rows.length ? offset + 1 : 0}–{Math.min(offset + PAGE_SIZE, rows.length)} of {rows.length}
        </span>
        <span className="grow" />
        <Select label="Time range" value={days} options={RANGES} onChange={setDays} align="right" />
      </div>
      <div className="oc-listgrid" data-controls={controls}>
        {controls && (
          <aside id="oc-page-facets" className="oc-facets" aria-label="Page filters">
            <div className="segmented oc-facets__scope" role="group" aria-label="Pages scope">
              <button type="button" className="segmented__btn" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                All Pages
              </button>
              <button type="button" className="segmented__btn" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>
                My Pages
              </button>
            </div>
            <label className="oc-switch">
              <input type="checkbox" role="switch" checked={myTeams} onChange={(event) => setMyTeams(event.target.checked)} />
              <span className="oc-switch__track" aria-hidden="true" />
              My Teams
            </label>
            <FacetList
              title="Urgency"
              items={['high', 'low'].map((value) => ({ value, label: value.toUpperCase(), count: urgencyCounts.get(value) ?? 0 }))}
              selected={urgencies}
              onToggle={(value) => setUrgencies((current) => toggle(current, value))}
            />
            <FacetList
              title="Team"
              items={model.teams.map((item) => ({ value: item.id, label: item.name, count: teamCounts.get(item.id) ?? 0 }))}
              selected={teams}
              onToggle={(value) => setTeams((current) => toggle(current, value))}
            />
            <FacetList
              title="Service"
              items={[...serviceCounts.entries()].sort((a, b) => b[1] - a[1]).map(([value, total]) => ({ value, label: value, count: total }))}
              selected={services}
              onToggle={(value) => setServices((current) => toggle(current, value))}
            />
          </aside>
        )}
        <div className="oc-listmain">
          <PageTabs
            tabs={STATUS_TABS.map((tab) => ({ id: tab.id, label: tab.label, badge: String(filtered.filter((page) => matchesStatus(page, tab.id)).length) }))}
            current={status}
            onSelect={(id) => navigate(paths.oncallPages(id as PageFilter))}
          />
          <div className="card oc-listcard">
            <PagesTable pages={visible} status={status} />
          </div>
          {rows.length > PAGE_SIZE && (
            <nav className="oc-pager" aria-label="Pagination">
              <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                <ChevronLeft size={14} aria-hidden="true" /> Previous
              </button>
              <span className="muted">
                Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(rows.length / PAGE_SIZE)}
              </span>
              <button type="button" className="btn" disabled={offset + PAGE_SIZE >= rows.length} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next <ChevronRight size={14} aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      </div>
      {pageId !== null && <PagePanel key={pageId} id={pageId} onClose={() => navigate(paths.oncallPages(status))} />}
    </div>
  );
}

function FacetList({ title, items, selected, onToggle }: { title: string; items: { value: string; label: string; count: number }[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <fieldset className="oc-facet">
      <legend>{title}</legend>
      {items.map((item) => (
        <label key={item.value} className="oc-facet__item">
          <input type="checkbox" checked={selected.includes(item.value)} onChange={() => onToggle(item.value)} />
          <span className="truncate grow">{item.label}</span>
          <span className="oc-facet__count">{item.count}</span>
        </label>
      ))}
      {!items.length && <span className="muted">None</span>}
    </fieldset>
  );
}
