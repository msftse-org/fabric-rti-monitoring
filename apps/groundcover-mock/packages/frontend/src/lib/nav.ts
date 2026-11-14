import {
  Activity,
  Compass,
  FileText,
  Flag,
  Home,
  LayoutGrid,
  Map as MapIcon,
  Server,
  Waypoints,
  CalendarDays,
  Boxes,
  type LucideIcon,
} from 'lucide-react';

export interface NavChild {
  id: string;
  label: string;
  /** Route path without the leading slash; items without one are inert. */
  path?: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  /** First route segments that mark this item (or its children) as current. */
  sections: string[];
  children?: NavChild[];
  hasChevron?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'workloads', label: 'Workloads', icon: Home, path: 'workloads', sections: ['workloads'] },
  { id: 'infrastructure', label: 'Infrastructure', icon: Server, sections: [], hasChevron: true },
  { id: 'map', label: 'Map', icon: MapIcon, path: 'map', sections: ['map'] },
  { id: 'api-catalog', label: 'API Catalog', icon: Boxes, sections: [] },
  { id: 'logs', label: 'Logs', icon: FileText, path: 'logs', sections: ['logs'] },
  { id: 'traces', label: 'Traces', icon: Waypoints, path: 'traces', sections: ['traces'] },
  { id: 'events', label: 'Events', icon: CalendarDays, sections: [] },
  { id: 'issues', label: 'Issues', icon: Flag, path: 'issues', sections: ['issues'] },
  {
    id: 'monitors',
    label: 'Monitors',
    icon: Activity,
    sections: [],
    children: [
      { id: 'monitor-issues', label: 'Issues', path: 'issues' },
      { id: 'monitor-list', label: 'Monitor List' },
      { id: 'silences', label: 'Silences' },
      { id: 'workflows', label: 'Workflows' },
    ],
  },
  {
    id: 'dashboards',
    label: 'Dashboards',
    icon: LayoutGrid,
    path: 'dashboards',
    sections: ['dashboards'],
    children: [
      { id: 'dashboard-list', label: 'Dashboard List', path: 'dashboards' },
      { id: 'grafana-dashboards', label: 'Grafana Dashboards' },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: Compass,
    sections: ['metrics'],
    children: [
      { id: 'metrics', label: 'Metrics', path: 'metrics' },
      { id: 'data-explorer', label: 'Data Explorer' },
    ],
  },
];
