import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Search, Settings, UserPlus } from 'lucide-react';
import { NAV_ITEMS, type NavChild, type NavItem } from '../lib/nav';
import { href, type Route } from '../lib/router';
import { useToast } from '../lib/toast';
import { Wordmark } from './Brand';
import { DISCLAIMER } from './Disclaimer';
import { Popover } from './Popover';

interface SidebarProps {
  route: Route;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onOpenPalette: () => void;
}

function isCurrent(item: NavItem, route: Route): boolean {
  return item.sections.includes(route.segments[0] ?? '');
}

function groupHasRoute(item: NavItem, route: Route): boolean {
  return Boolean(item.children?.some((child) => child.path === route.segments[0])) || isCurrent(item, route);
}

export function Sidebar({ route, collapsed, mobileOpen, onToggleCollapse, onCloseMobile, onOpenPalette }: SidebarProps) {
  const toast = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(NAV_ITEMS.filter((item) => item.children && groupHasRoute(item, route)).map((item) => item.id)));

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const item of NAV_ITEMS) if (item.children && groupHasRoute(item, route)) next.add(item.id);
      return next.size === current.size ? current : next;
    });
  }, [route]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const renderChild = (child: NavChild) =>
    child.path ? (
      <a key={child.id} className="nav-sub__item" href={href(child.path)} aria-current={route.segments[0] === child.path ? 'page' : undefined} onClick={onCloseMobile}>
        {child.label}
      </a>
    ) : (
      <button key={child.id} type="button" className="nav-sub__item nav-inert" title="Not part of this mock" onClick={() => toast()}>
        {child.label}
      </button>
    );

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const open = expanded.has(item.id);
    const current = isCurrent(item, route);
    const chevron = item.children || item.hasChevron ? (
      <span className="nav-item__chevron" aria-hidden="true">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
    ) : null;
    const content = (
      <>
        <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
        <span className="nav-item__label">{item.label}</span>
        {chevron}
      </>
    );
    let control;
    if (item.path) {
      control = (
        <a
          className="nav-item"
          href={href(item.path)}
          aria-current={current ? 'page' : undefined}
          data-current={current || undefined}
          onClick={() => {
            if (item.children) setExpanded((value) => new Set(value).add(item.id));
            onCloseMobile();
          }}
        >
          {content}
        </a>
      );
    } else if (item.children) {
      control = (
        <button type="button" className="nav-item" aria-expanded={open} onClick={() => toggle(item.id)}>
          {content}
        </button>
      );
    } else {
      control = (
        <button type="button" className="nav-item nav-inert" title="Not part of this mock" onClick={() => toast()}>
          {content}
        </button>
      );
    }
    return (
      <li key={item.id}>
        {control}
        {item.children && open && <div className="nav-sub">{item.children.map(renderChild)}</div>}
      </li>
    );
  };

  return (
    <>
      {mobileOpen && <div className="scrim" onClick={onCloseMobile} aria-hidden="true" />}
      <nav className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--open' : ''}`} aria-label="Primary">
        <div className="sidebar__brand">
          <a href={href('workloads')} aria-label="groundcover mock home" onClick={onCloseMobile}><Wordmark /></a>
        </div>
        <Popover
          buttonClassName="workspace"
          buttonLabel="Workspace menu"
          panelClassName="workspace__panel"
          button={
            <>
              <span className="avatar" aria-hidden="true">D</span>
              <span className="workspace__name">demo</span>
              <ChevronDown size={13} aria-hidden="true" />
            </>
          }
        >
          {() => (
            <div className="menu-card">
              <div className="menu-card__title">demo workspace</div>
              <p>{DISCLAIMER}</p>
            </div>
          )}
        </Popover>
        <button type="button" className="navigate" onClick={() => { onOpenPalette(); onCloseMobile(); }} aria-label="Navigate, press Command K">
          <Search size={14} aria-hidden="true" />
          <span className="navigate__label">Navigate</span>
          <kbd className="navigate__keys">⌘K</kbd>
        </button>
        <ul className="nav-list">{NAV_ITEMS.map(renderItem)}</ul>
        <div className="sidebar__footer">
          <button type="button" className="nav-item nav-inert" title="Not part of this mock" onClick={() => toast()}>
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" />
            <span className="nav-item__label">Settings</span>
          </button>
          <button type="button" className="nav-item nav-inert" title="Not part of this mock" onClick={() => toast()}>
            <UserPlus size={16} strokeWidth={1.7} aria-hidden="true" />
            <span className="nav-item__label">Invite Members</span>
          </button>
          <button type="button" className="nav-item sidebar__collapse" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {collapsed ? <ChevronsRight size={16} strokeWidth={1.7} aria-hidden="true" /> : <ChevronsLeft size={16} strokeWidth={1.7} aria-hidden="true" />}
            <span className="nav-item__label">Collapse</span>
          </button>
        </div>
      </nav>
    </>
  );
}
