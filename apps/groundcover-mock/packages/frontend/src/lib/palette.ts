import type { Severity } from '@telemetry';

export const SEVERITY_COLOR: Record<Severity, string> = {
  FATAL: '#9f1239',
  ERROR: '#e0382f',
  WARN: '#f59f0b',
  INFO: '#7480e8',
  DEBUG: '#9aa3b5',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  FATAL: 'Fatal',
  ERROR: 'Error',
  WARN: 'Warning',
  INFO: 'Info',
  DEBUG: 'Debug',
};

const CATEGORICAL = ['#3d8bfd', '#6bb36b', '#f2c230', '#232b6e', '#e5848c', '#55c1c1', '#cf8be0', '#9b7cf0', '#a6d95b'];
const KNOWN = ['gateway', 'checkout', 'inventory', 'payment', 'shipping', 'notifications', 'postgres'];

export function categoricalColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length];
}

/** Stable colour per workload so a service looks the same on every page. */
export function workloadColor(name: string): string {
  const known = KNOWN.indexOf(name);
  if (known >= 0) return CATEGORICAL[known];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CATEGORICAL[hash % CATEGORICAL.length];
}

export const OUTCOME_COLOR: Record<string, string> = { success: '#3d8bfd', error: '#e0382f' };

export const ERROR_SHADES = ['#7f1d2d', '#d9482e', '#c25a63', '#f0b4b4', '#f01c1c', '#e8773a', '#b3304a'];
