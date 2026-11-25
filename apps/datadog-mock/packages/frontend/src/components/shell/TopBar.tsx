import { ChevronRight, Menu } from 'lucide-react';
import { Fragment } from 'react';
import { useShell } from '../../lib/app';
import { entityName } from '../../lib/oncall';
import { isOnCallRoute, type Route } from '../../lib/router';
import { TimeControls } from './TimeControls';
import { crumbsFor } from './crumbs';

export function TopBar({ route, onMenu }: { route: Route; onMenu: () => void }) {
  const { data } = useShell();
  const crumbs = crumbsFor(route, (kind, id) => entityName(data?.bundle, kind, id));
  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" aria-label="Open navigation" onClick={onMenu}>
        <Menu size={20} />
      </button>
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <ChevronRight size={14} className="crumbs__sep" aria-hidden="true" />}
              {crumb.path ? (
                <a className="crumbs__item" href={`#${crumb.path}`}>
                  {crumb.label}
                </a>
              ) : (
                <span className="crumbs__item" data-last={last} aria-current={last ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>
      <div className="grow" />
      {!isOnCallRoute(route) && <TimeControls />}
    </header>
  );
}
