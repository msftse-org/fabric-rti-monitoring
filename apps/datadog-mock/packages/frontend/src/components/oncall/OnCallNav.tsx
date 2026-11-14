import { useState } from 'react';
import { PhoneCall, Settings } from 'lucide-react';
import { navigate, paths, type Route } from '../../lib/router';
import { AsOf, CompareLink, ResetActions } from './kit';
import { ManualPageModal } from './PageModals';

const TABS: { id: string; label: string; path: string; match: (route: Route) => boolean }[] = [
  { id: 'summary', label: 'Summary', path: paths.oncall(), match: (route) => route.name === 'oncall' },
  { id: 'teams', label: 'Teams', path: paths.oncallTeams(), match: (route) => route.name === 'oncall-teams' || route.name === 'oncall-team' },
  { id: 'pages', label: 'Pages', path: paths.oncallPages(), match: (route) => route.name === 'oncall-pages' },
  { id: 'schedules', label: 'Schedules', path: paths.oncallSchedules(), match: (route) => route.name === 'oncall-schedules' || route.name === 'oncall-schedule' },
  { id: 'policies', label: 'Escalation Policies', path: paths.oncallPolicies(), match: (route) => route.name === 'oncall-policies' || route.name === 'oncall-policy' },
  { id: 'analytics', label: 'Analytics', path: paths.oncallAnalytics(), match: (route) => route.name === 'oncall-analytics' },
];

/** Datadog's On-Call secondary navigation, with the Page and Settings buttons on the right. */
export function OnCallNav({ route, path }: { route: Route; path: string }) {
  const [paging, setPaging] = useState(false);
  return (
    <div className="oc-nav">
      <a className="oc-nav__brand" href={`#${paths.oncall()}`}>
        <PhoneCall size={17} aria-hidden="true" />
        On-Call
      </a>
      <nav className="oc-nav__tabs" aria-label="On-Call">
        {TABS.map((tab) => (
          <a key={tab.id} className="oc-nav__tab" href={`#${tab.path}`} aria-current={tab.match(route) ? 'page' : undefined}>
            {tab.label}
          </a>
        ))}
      </nav>
      <div className="oc-nav__right">
        <AsOf />
        <ResetActions />
        <CompareLink path={path} compact />
        <button type="button" className="btn" onClick={() => setPaging(true)}>
          <PhoneCall size={14} aria-hidden="true" />
          Page
        </button>
        <a className="btn" href={`#${paths.oncallSettings()}`} aria-current={route.name === 'oncall-settings' ? 'page' : undefined}>
          <Settings size={14} aria-hidden="true" />
          <span className="oc-nav__settings">Settings</span>
        </a>
      </div>
      {paging && (
        <ManualPageModal
          onClose={() => setPaging(false)}
          onCreated={(id) => {
            setPaging(false);
            navigate(paths.oncallPage(id));
          }}
        />
      )}
    </div>
  );
}
