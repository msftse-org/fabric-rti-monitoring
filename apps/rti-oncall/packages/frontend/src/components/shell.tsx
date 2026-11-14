import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Bell,
  Blocks,
  CirclePlus,
  Compass,
  Database,
  Folder,
  Grip,
  House,
  Menu,
  Monitor,
  Radio,
  RotateCcw,
  Search,
  Settings,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { clock } from '@oncall';
import { useData } from '../lib/oncall';
import { href, navigate, paths, type Route, type Section, sectionOf } from '../lib/router';
import { useToast } from '../lib/toast';
import { Avatar } from './ui';

export const SECTIONS: { id: Section; label: string; to: string }[] = [
  { id: 'overview', label: 'Overview', to: paths.overview() },
  { id: 'pages', label: 'Pages', to: paths.pages() },
  { id: 'teams', label: 'Teams', to: paths.teams() },
  { id: 'schedules', label: 'Schedules', to: paths.schedules() },
  { id: 'escalations', label: 'Escalations', to: paths.escalations() },
  { id: 'rules', label: 'Activator rules', to: paths.rules() },
  { id: 'analytics', label: 'Analytics', to: paths.analytics() },
  { id: 'compare', label: 'Compare with Datadog', to: paths.compare() },
  { id: 'settings', label: 'Settings', to: paths.settings() },
];

const RAIL: { icon: LucideIcon; label: string }[] = [
  { icon: House, label: 'Home' },
  { icon: CirclePlus, label: 'Create' },
  { icon: Compass, label: 'Browse' },
  { icon: Database, label: 'OneLake' },
  { icon: Monitor, label: 'Monitor' },
  { icon: Radio, label: 'Real-Time' },
  { icon: Blocks, label: 'Workloads' },
];

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="rail" aria-label="Fabric">
      <ul>
        {RAIL.map(({ icon: Icon, label }) => (
          <li key={label}>
            <span className="rail__item rail__item--static" title={`${label} (not part of this demo)`}>
              <Icon size={20} aria-hidden strokeWidth={1.6} />
              <span>{label}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="rail__sep" aria-hidden />
      <ul>
        <li>
          <span className="rail__item rail__item--static" title="Workspace fabric-rti-monitoring">
            <Folder size={20} aria-hidden strokeWidth={1.6} />
            <span>fabric-rti…</span>
          </span>
        </li>
        <li>
          <a className="rail__item rail__item--active" href={href(paths.overview())} aria-current="true" onClick={onNavigate}>
            <span className="rail__tile" aria-hidden>
              <Zap size={14} fill="currentColor" strokeWidth={1.5} />
            </span>
            <span>On-Call</span>
          </a>
        </li>
      </ul>
    </nav>
  );
}

function TopBar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const { onCall, mode, fellBack } = useData();
  const [query, setQuery] = useState('');
  const open = onCall?.model.pages.filter((page) => page.status === 'triggered').length ?? 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(paths.pages(query.trim()));
  };
  return (
    <header className="topbar">
      <div className="topbar__start">
        <button type="button" className="icon-btn topbar__menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={onMenu}>
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <span className="topbar__waffle" aria-hidden>
          <Grip size={18} />
        </span>
        <a className="topbar__brand" href={href(paths.overview())}>
          <span className="topbar__logo" aria-hidden>
            <svg viewBox="0 0 20 20" width="18" height="18">
              <path d="M4 3h9l-2 4H6z" fill="#0c5a4c" />
              <path d="M5 8h8l-2 4H7z" fill="#117865" />
              <path d="M6 13h5l-2 4H8z" fill="#3fb39c" />
            </svg>
          </span>
          Microsoft Fabric
        </a>
        <nav className="topbar__crumbs" aria-label="Location">
          <span className="topbar__ws">
            <Folder size={14} aria-hidden /> fabric-rti-monitoring
          </span>
          <span aria-hidden className="topbar__slash">
            /
          </span>
          <span className="topbar__item">
            <Zap size={13} aria-hidden /> On-Call
          </span>
        </nav>
      </div>
      <form className="topbar__search" role="search" onSubmit={submit}>
        <Search size={14} aria-hidden />
        <label htmlFor="global-search" className="sr-only">
          Search pages
        </label>
        <input id="global-search" type="search" placeholder="Search pages by number, title or team" value={query} onChange={(event) => setQuery(event.target.value)} />
      </form>
      <div className="topbar__end">
        {onCall && (
          <span className="asof" title={mode === 'live' ? 'Live: read from the Eventhouse through the local API' : fellBack ? 'Snapshot: the local API was unreachable' : 'Snapshot of Eventhouse data bundled with the app'}>
            <span className={`asof__dot ${mode === 'live' ? 'asof__dot--live' : ''}`} aria-hidden />
            <span className="asof__mode">{mode === 'live' ? 'Live' : 'Snapshot'}</span>
            <span className="asof__time">as of {clock(onCall.now)} UTC</span>
          </span>
        )}
        <a className="icon-btn topbar__bell" href={href(paths.pages())} aria-label={`${open} triggered pages`}>
          <Bell size={18} />
          {open > 0 && <span className="topbar__count" aria-hidden>{open}</span>}
        </a>
        <a className="icon-btn topbar__settings" href={href(paths.settings())} aria-label="Notification settings">
          <Settings size={18} />
        </a>
        {onCall && (
          <span className="topbar__me" title={`${onCall.me.name}, signed in (demo persona)`}>
            <Avatar user={onCall.me} size={28} label />
          </span>
        )}
      </div>
    </header>
  );
}

function ItemHeader() {
  const { onCall } = useData();
  const notify = useToast();
  const count = onCall?.actions.length ?? 0;
  return (
    <div className="item-head">
      <div className="item-head__id">
        <span className="item-icon" aria-hidden>
          <Zap size={18} fill="currentColor" strokeWidth={1.4} />
        </span>
        <div>
          <div className="item-head__name">On-Call</div>
          <div className="item-head__type">Real-Time Intelligence app · Eventhouse, Activator and Power Automate</div>
        </div>
      </div>
      {onCall && count > 0 && (
        <button
          type="button"
          className="btn btn--subtle btn--sm"
          onClick={() => {
            onCall.reset();
            notify('Demo actions cleared', 'Pages are back to the state computed from Eventhouse data.', 'info');
          }}
        >
          <RotateCcw size={14} aria-hidden />
          <span>Reset demo actions ({count})</span>
        </button>
      )}
    </div>
  );
}

function SubNav({ active, onNavigate }: { active: Section | null; onNavigate?: () => void }) {
  return (
    <nav className="subnav" aria-label="On-Call">
      <ul>
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a href={href(section.to)} className="subnav__link" aria-current={active === section.id ? 'page' : undefined} onClick={onNavigate}>
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Shell({ route, path, children }: { route: Route; path: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const active = sectionOf(route);

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="app">
      <a
        className="skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <TopBar onMenu={() => setMenuOpen((value) => !value)} menuOpen={menuOpen} />
      <div className="app__body">
        <div className="app__rail">
          <Rail />
        </div>
        {menuOpen && (
          <div className="drawer" id="mobile-nav">
            <button type="button" className="drawer__scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
            <div className="drawer__panel">
              <Rail onNavigate={() => setMenuOpen(false)} />
              <div className="drawer__sections">
                <div className="drawer__label">On-Call</div>
                <SubNav active={active} onNavigate={() => setMenuOpen(false)} />
              </div>
            </div>
          </div>
        )}
        <div className="app__main">
          <ItemHeader />
          <SubNav active={active} />
          <main id="main" className="view" tabIndex={-1}>
            {children}
          </main>
          <footer className="app__foot">Unofficial demo. Fictional people; alert data comes from the AKS OpenTelemetry workload in the Fabric Eventhouse. Not a Microsoft product UI.</footer>
        </div>
      </div>
    </div>
  );
}
