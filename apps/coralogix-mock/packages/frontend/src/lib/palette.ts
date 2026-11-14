import { hashHue } from '@telemetry';

const SERVICE_COLORS: Record<string, string> = {
  gateway: '#b8622d',
  checkout: '#5d7f8a',
  inventory: '#9a58a5',
  payment: '#a4902f',
  shipping: '#3f9a86',
  notifications: '#7e6bb5',
  postgres: '#4f78b8',
};

export function serviceColor(name: string): string {
  return SERVICE_COLORS[name] ?? `hsl(${hashHue(name)} 40% 48%)`;
}

export const SERIES = {
  success: '#ed4d7c',
  error: '#c01445',
  info: '#3cbcd5',
  errorLog: '#e5384e',
  ok: '#4c7ef0',
  avg: '#3ec183',
  p50: '#35b6d3',
  p95: '#4c7ef0',
  p99: '#a35cf0',
  max: '#e0489a',
} as const;

export const TOP_LINE_COLORS = ['#3ec183', '#35b6d3', '#4c7ef0', '#a35cf0', '#e0489a'];
