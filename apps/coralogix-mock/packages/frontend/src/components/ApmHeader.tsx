import { ChevronDown, Database, Rows3, Waypoints, Zap } from 'lucide-react';
import { useState } from 'react';
import { href, paths } from '../lib/router';
import { useToast } from '../lib/toast';
import { DropdownMenu } from './DropdownMenu';
import { Tabs } from './Tabs';
import { TimeControls } from './TimeControls';

export type ApmTab = 'catalog' | 'map' | 'databases';

function EnvironmentSelect({ environment }: { environment: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <DropdownMenu
      ariaLabel="Select environments"
      triggerClassName="env-select"
      trigger={
        <>
          <span className={selected ? 'has-value' : undefined}>{selected ?? 'Select environments'}</span>
          <ChevronDown size={14} aria-hidden />
        </>
      }
      items={[{ id: environment, label: environment, selected: selected === environment, onSelect: () => setSelected(selected === environment ? null : environment) }]}
    />
  );
}

/** Title row, environment select, tab strip and time controls shared by the APM list pages. */
export function ApmHeader({ active, environment }: { active: ApmTab; environment: string }) {
  const { inert } = useToast();
  return (
    <header className="page-head">
      <div className="page-head-title">
        <h1>APM</h1>
        <EnvironmentSelect environment={environment} />
      </div>
      <div className="page-head-row">
        <Tabs
          ariaLabel="APM sections"
          active={active}
          onSelect={(id) => id === 'serverless' && inert()}
          items={[
            { id: 'catalog', label: 'Service Catalog', icon: <Rows3 size={14} />, href: href(paths.catalog()) },
            { id: 'map', label: 'Service Map', icon: <Waypoints size={14} />, href: href(paths.map()) },
            { id: 'serverless', label: 'Serverless', icon: <Zap size={14} /> },
            { id: 'databases', label: 'Databases', icon: <Database size={14} />, href: href(paths.databases()) },
          ]}
        />
        <TimeControls />
      </div>
    </header>
  );
}
