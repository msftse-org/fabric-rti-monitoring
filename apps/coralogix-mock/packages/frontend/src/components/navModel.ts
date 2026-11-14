import { Bell, Bot, Compass, House, LayoutDashboard, Layers, Radar, Server, Settings, ShieldCheck, Waypoints, type LucideIcon } from 'lucide-react';
import { paths, type Route } from '../lib/router';

export interface NavLeaf {
  id: string;
  label: string;
  /** Hash path. Leaves without one are inert and only show the "not part of this mock" toast. */
  path?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  children?: NavLeaf[];
  isActive: (route: Route) => boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'home', label: 'Home', icon: House, isActive: () => false },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard, isActive: () => false },
  {
    id: 'explore',
    label: 'Explore',
    icon: Compass,
    isActive: (route) => route.page === 'logs' || route.page === 'tracing' || route.page === 'trace',
    children: [
      { id: 'logs', label: 'Logs', path: paths.logs() },
      { id: 'tracing', label: 'Tracing', path: paths.tracing() },
      { id: 'metrics', label: 'Metrics' },
      { id: 'dataprime', label: 'DataPrime' },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: Bell,
    isActive: (route) => route.page === 'alert-incidents' || route.page === 'alert-definitions',
    children: [
      { id: 'incidents', label: 'Incidents', path: paths.alertIncidents() },
      { id: 'definitions', label: 'Alert Definitions', path: paths.alertDefinitions() },
    ],
  },
  {
    id: 'apm',
    label: 'APM',
    icon: Waypoints,
    isActive: (route) => route.page === 'catalog' || route.page === 'map' || route.page === 'service' || route.page === 'databases',
    children: [
      { id: 'catalog', label: 'Service Catalog', path: paths.catalog() },
      { id: 'map', label: 'Service Map', path: paths.map() },
      { id: 'serverless', label: 'Serverless' },
      { id: 'databases', label: 'Databases', path: paths.databases() },
    ],
  },
  { id: 'rum', label: 'RUM', icon: Radar, isActive: () => false },
  { id: 'infra', label: 'Infrastructure', icon: Server, isActive: () => false },
  { id: 'ai', label: 'AI Center', icon: Bot, isActive: () => false },
  {
    id: 'dataflow',
    label: 'Data Flow',
    icon: Layers,
    isActive: () => false,
    children: [{ id: 'parsing', label: 'Parsing Rules' }, { id: 'tco', label: 'TCO Optimizer' }],
  },
  { id: 'security', label: 'Security', icon: ShieldCheck, isActive: () => false },
];

export const SETTINGS_GROUP: NavGroup = { id: 'settings', label: 'Settings', icon: Settings, isActive: () => false };
