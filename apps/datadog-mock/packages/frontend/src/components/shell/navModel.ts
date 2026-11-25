import {
  Activity,
  BookOpen,
  Binoculars,
  Globe,
  PhoneCall,
  LayoutDashboard,
  Puzzle,
  Rocket,
  ScrollText,
  Server,
  ShieldCheck,
  Siren,
  ChartLine,
  type LucideIcon,
} from 'lucide-react';
import { paths, type Route } from '../../lib/router';

export interface NavItem {
  label: string;
  /** Hash path; items without one are not backed by data and show the "Not part of this mock" toast. */
  path?: string;
  active?: (route: Route) => boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  sections: NavSection[];
}

const inert = (...labels: string[]): NavItem[] => labels.map((label) => ({ label }));

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    icon: Server,
    sections: [
      { items: inert('Infrastructure List', 'Resource Catalog', 'Kubernetes', 'Containers', 'Processes') },
      { title: 'Cloud', items: inert('Cloud Network Monitoring', 'Serverless') },
    ],
  },
  {
    id: 'apm',
    label: 'APM',
    icon: Activity,
    sections: [
      {
        title: 'Services',
        items: [
          { label: 'Service Catalog', path: paths.catalog(), active: (r) => r.name === 'catalog' || r.name === 'service' },
          { label: 'Service Map', path: paths.map(), active: (r) => r.name === 'map' },
        ],
      },
      { title: 'Traces', items: [{ label: 'Traces', path: paths.traces(), active: (r) => r.name === 'traces' || r.name === 'trace' }, ...inert('Trace Queries')] },
      { title: 'Explore', items: inert('Profiles', 'Error Tracking', 'Databases', 'Data Streams') },
    ],
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: ScrollText,
    sections: [
      { items: [{ label: 'Log Explorer', path: paths.logs(), active: (r) => r.name === 'logs' }, ...inert('Live Tail', 'Patterns')] },
      { title: 'Configuration', items: inert('Pipelines', 'Indexes', 'Archives', 'Generate Metrics') },
    ],
  },
  {
    id: 'metrics',
    label: 'Metrics',
    icon: ChartLine,
    sections: [{ items: [{ label: 'Metrics Explorer', path: paths.metrics(), active: (r) => r.name === 'metrics' }, ...inert('Summary', 'Distributions', 'Volume')] }],
  },
  {
    id: 'dashboards',
    label: 'Dashboards',
    icon: LayoutDashboard,
    sections: [
      {
        items: [
          { label: 'Dashboard List', path: paths.dashboards(), active: (r) => r.name === 'dashboards' },
          { label: 'AKS Services Overview', path: paths.dashboard('aks-services-overview'), active: (r) => r.name === 'dashboard' },
          ...inert('Reports', 'Shared Dashboards'),
        ],
      },
    ],
  },
  {
    id: 'monitors',
    label: 'Monitors',
    icon: Siren,
    sections: [
      {
        items: [
          { label: 'Manage Monitors', path: paths.monitors(), active: (r) => (r.name === 'monitors' && !r.triggered) || r.name === 'monitor' },
          { label: 'Triggered Monitors', path: paths.monitors(true), active: (r) => r.name === 'monitors' && r.triggered },
          ...inert('New Monitor', 'Downtimes', 'SLOs'),
        ],
      },
    ],
  },
  {
    id: 'oncall',
    label: 'On-Call',
    icon: PhoneCall,
    sections: [
      {
        items: [
          { label: 'Summary', path: paths.oncall(), active: (r) => r.name === 'oncall' },
          { label: 'Teams', path: paths.oncallTeams(), active: (r) => r.name === 'oncall-teams' || r.name === 'oncall-team' },
          { label: 'Pages', path: paths.oncallPages(), active: (r) => r.name === 'oncall-pages' },
          { label: 'Incidents', path: paths.oncallIncidents(), active: (r) => r.name === 'oncall-incidents' },
          { label: 'Schedules', path: paths.oncallSchedules(), active: (r) => r.name === 'oncall-schedules' || r.name === 'oncall-schedule' },
          { label: 'Escalation Policies', path: paths.oncallPolicies(), active: (r) => r.name === 'oncall-policies' || r.name === 'oncall-policy' },
          { label: 'Analytics', path: paths.oncallAnalytics(), active: (r) => r.name === 'oncall-analytics' },
          { label: 'Settings', path: paths.oncallSettings(), active: (r) => r.name === 'oncall-settings' },
        ],
      },
    ],
  },
  { id: 'watchdog', label: 'Watchdog', icon: Binoculars, sections: [{ items: inert('Alerts', 'Insights') }] },
  { id: 'security', label: 'Security', icon: ShieldCheck, sections: [{ items: inert('Cloud Security', 'App & API Protection', 'Vulnerabilities', 'Sensitive Data Scanner') }] },
  { id: 'dx', label: 'Digital Experience', icon: Globe, sections: [{ items: inert('Real User Monitoring', 'Synthetic Tests', 'Session Replay') }] },
  { id: 'delivery', label: 'Software Delivery', icon: Rocket, sections: [{ items: inert('CI Visibility', 'Test Optimization', 'Feature Flags') }] },
  { id: 'notebooks', label: 'Notebooks', icon: BookOpen, sections: [{ items: inert('Notebook List') }] },
  { id: 'integrations', label: 'Integrations', icon: Puzzle, sections: [{ items: inert('Integrations', 'Fleet Automation', 'Marketplace') }] },
];
