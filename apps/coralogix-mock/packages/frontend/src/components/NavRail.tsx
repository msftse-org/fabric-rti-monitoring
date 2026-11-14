import { useEffect, useRef, useState } from 'react';
import { useRoute } from '../lib/router';
import { useToast } from '../lib/toast';
import { LogoGlyph } from './LogoGlyph';
import { NAV_GROUPS, SETTINGS_GROUP, type NavGroup } from './navModel';

interface NavRailProps {
  open: boolean;
  onClose: () => void;
}

export function NavRail({ open, onClose }: NavRailProps) {
  const route = useRoute();
  const { inert } = useToast();
  const [flyout, setFlyout] = useState<string | null>(null);
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!flyout) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setFlyout(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFlyout(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [flyout]);

  const renderGroup = (group: NavGroup) => {
    const Icon = group.icon;
    const active = group.isActive(route);
    const expanded = flyout === group.id;
    return (
      <div className="rail-item" key={group.id}>
        <button
          type="button"
          className={`rail-button${active ? ' is-active' : ''}${expanded ? ' is-open' : ''}`}
          aria-haspopup={group.children ? 'menu' : undefined}
          aria-expanded={group.children ? expanded : undefined}
          aria-current={active ? 'true' : undefined}
          onClick={() => (group.children ? setFlyout(expanded ? null : group.id) : inert())}
        >
          <Icon size={18} aria-hidden />
          <span>{group.label}</span>
        </button>
        {expanded && group.children && (
          <div className="rail-flyout" role="menu" aria-label={group.label}>
            <div className="rail-flyout-title">{group.label}</div>
            {group.children.map((leaf) =>
              leaf.path ? (
                <a
                  key={leaf.id}
                  role="menuitem"
                  className="rail-flyout-item"
                  href={`#${leaf.path}`}
                  onClick={() => {
                    setFlyout(null);
                    onClose();
                  }}
                >
                  {leaf.label}
                </a>
              ) : (
                <button
                  key={leaf.id}
                  type="button"
                  role="menuitem"
                  className="rail-flyout-item is-inert"
                  onClick={() => {
                    inert();
                    setFlyout(null);
                  }}
                >
                  {leaf.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {open && <div className="rail-backdrop" onClick={onClose} aria-hidden />}
      <nav ref={railRef} className={`rail${open ? ' rail--open' : ''}`} aria-label="Main navigation">
        <a className="rail-logo" href="#/apm/services" aria-label="Coralogix Mock, go to Service Catalog" onClick={onClose}>
          <LogoGlyph />
        </a>
        {NAV_GROUPS.map(renderGroup)}
        <div className="rail-spacer" />
        {renderGroup(SETTINGS_GROUP)}
      </nav>
    </>
  );
}
