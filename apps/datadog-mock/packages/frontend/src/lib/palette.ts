import { hashHue } from '@telemetry';

const SERVICE_COLORS: Record<string, string> = {
  gateway: '#5ab59a',
  checkout: '#f4a340',
  inventory: '#f2c62e',
  payment: '#4a9fe0',
  shipping: '#a681da',
  notifications: '#e57c5d',
  postgres: '#3d8fbf',
};

export function serviceColor(name: string): string {
  return SERVICE_COLORS[name] ?? `hsl(${hashHue(name)} 52% 56%)`;
}

export type Health = 'ok' | 'warn' | 'alert' | 'nodata';

export const HEALTH_LABEL: Record<Health, string> = { alert: 'ALERT', warn: 'WARN', nodata: 'NO DATA', ok: 'OK' };

export const PALETTES: Record<string, string[]> = {
  classic: ['#8fc3fa', '#378fe4', '#7a69d6', '#f2c94c', '#e8826a', '#5dbf9a', '#d98ac1', '#8a97a8'],
  cool: ['#3b8fe0', '#5dbf9a', '#7a69d6', '#4fb8d6', '#8fc3fa', '#a3d977', '#5f7fb3', '#8a97a8'],
  warm: ['#e8826a', '#f2c94c', '#d9638a', '#f4a340', '#b5523c', '#ecb7a5', '#c89a2c', '#8a97a8'],
};

export const COLOR = {
  info: 'var(--sev-info)',
  error: 'var(--sev-error)',
  warn: 'var(--sev-warn)',
  debug: 'var(--sev-debug)',
  hits: 'var(--chart-hits)',
  errors: 'var(--chart-errors)',
};

export function severityColor(severity: string): string {
  switch (severity) {
    case 'ERROR':
    case 'FATAL':
      return COLOR.error;
    case 'WARN':
      return COLOR.warn;
    case 'DEBUG':
      return COLOR.debug;
    default:
      return COLOR.info;
  }
}
