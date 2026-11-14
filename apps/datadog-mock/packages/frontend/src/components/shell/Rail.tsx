import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleQuestionMark, Moon, Search, Sun, User, X } from 'lucide-react';
import { useDismiss } from '../../lib/hooks';
import type { Theme } from '../../lib/prefs';
import type { Route } from '../../lib/router';
import { useShell } from '../../lib/app';
import { useInert } from '../../lib/toast';
import { DISCLAIMER } from './Disclaimer';
import { NAV_GROUPS, type NavGroup } from './navModel';

export function BrandGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#632ca6" />
      <path d="M5 16.5h4.2l2.3-7 4 11 2.4-7.5H23" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface RailProps {
  route: Route;
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

type PanelId = NavGroup['id'] | 'user' | 'brand';

export function Rail({ route, open, onClose, theme, onToggleTheme }: RailProps) {
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [top, setTop] = useState(0);
  const railRef = useRef<HTMLElement>(null);
  const inert = useInert();
  const closePanel = useCallback(() => setPanel(null), []);
  useDismiss(panel !== null, closePanel, railRef);
  useEffect(() => {
    setPanel(null);
  }, [route]);

  const show = (id: PanelId, element: HTMLElement) => {
    setTop(Math.min(element.getBoundingClientRect().top, window.innerHeight - 320));
    setPanel(id);
  };
  const toggle = (id: PanelId, element: HTMLElement) => (panel === id ? setPanel(null) : show(id, element));

  const groupActive = (group: NavGroup) => group.sections.some((section) => section.items.some((item) => item.active?.(route)));

  return (
    <>
      {open && <div className="rail-scrim" onClick={onClose} aria-hidden="true" />}
      <nav className="rail" data-open={open} ref={railRef} aria-label="Main navigation" onMouseLeave={closePanel}>
        <a
          className="rail__logo"
          href="#/logs"
          aria-label="Datadog Mock home"
          onMouseEnter={(event) => show('brand', event.currentTarget)}
          onFocus={(event) => show('brand', event.currentTarget)}
        >
          <BrandGlyph />
        </a>
        <button type="button" className="rail__btn" aria-label="Search" onClick={inert} onMouseEnter={closePanel}>
          <Search size={19} />
        </button>
        {NAV_GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.id} className="rail__group">
              <button
                type="button"
                className="rail__btn"
                data-active={groupActive(group)}
                aria-label={group.label}
                aria-haspopup="menu"
                aria-expanded={panel === group.id}
                onMouseEnter={(event) => show(group.id, event.currentTarget)}
                onClick={(event) => toggle(group.id, event.currentTarget)}
              >
                <Icon size={19} />
              </button>
              {panel === group.id && (
                <div className="flyout" style={{ top }} role="menu" aria-label={group.label}>
                  <div className="flyout__title">{group.label}</div>
                  {group.sections.map((section, index) => (
                    <div key={index} className="flyout__section">
                      {section.title && <div className="flyout__heading">{section.title}</div>}
                      {section.items.map((item) =>
                        item.path ? (
                          <a key={item.label} href={`#${item.path}`} role="menuitem" className="flyout__item" aria-current={item.active?.(route) ? 'page' : undefined} onClick={onClose}>
                            {item.label}
                          </a>
                        ) : (
                          <button key={item.label} type="button" role="menuitem" className="flyout__item" onClick={inert}>
                            {item.label}
                          </button>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="rail__spacer" />
        <button type="button" className="rail__btn" aria-label="Help" onClick={inert} onMouseEnter={closePanel}>
          <CircleQuestionMark size={19} />
        </button>
        <div className="rail__group">
          <button type="button" className="rail__btn" aria-label="User menu" aria-haspopup="menu" aria-expanded={panel === 'user'} onClick={(event) => toggle('user', event.currentTarget)}>
            <span className="rail__avatar">
              <User size={15} />
            </span>
          </button>
          {panel === 'user' && <UserPanel theme={theme} onToggleTheme={onToggleTheme} onClose={closePanel} />}
        </div>
        {panel === 'brand' && (
          <div className="flyout flyout--brand" style={{ top: 8 }}>
            <div className="flyout__title">Datadog Mock</div>
            <div className="flyout__note">Fabric RTI demo · otel-demo / aks</div>
          </div>
        )}
        <button type="button" className="rail__close" aria-label="Close navigation" onClick={onClose}>
          <X size={16} />
        </button>
      </nav>
    </>
  );
}

function UserPanel({ theme, onToggleTheme, onClose }: { theme: Theme; onToggleTheme: () => void; onClose: () => void }) {
  const { source } = useShell();
  return (
    <div className="flyout flyout--user" style={{ bottom: 8, top: 'auto' }} role="menu" aria-label="User menu">
      <div className="flyout__title">Demo User</div>
      <div className="flyout__note">demo@fabric-rti.mock</div>
      <button type="button" role="menuitem" className="flyout__item" onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        {theme === 'dark' ? 'Light theme' : 'Dark theme'}
      </button>
      <button type="button" role="menuitem" className="flyout__item" onClick={() => { source.refresh(); onClose(); }}>
        Refresh data
      </button>
      <div className="flyout__disclaimer">{DISCLAIMER}</div>
    </div>
  );
}
