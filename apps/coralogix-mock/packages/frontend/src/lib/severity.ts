import type { Severity } from '@telemetry';
import { SERIES } from './palette';

export const SEVERITIES: Severity[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

const COLORS: Record<Severity, string> = {
  DEBUG: '#8a8a90',
  INFO: SERIES.info,
  WARN: '#e1bc4f',
  ERROR: SERIES.errorLog,
  FATAL: '#a3123b',
};

export const severityColor = (severity: Severity): string => COLORS[severity];

export const severityLabel = (severity: Severity): string => severity.charAt(0) + severity.slice(1).toLowerCase();

export const severityTone = (severity: Severity): 'info' | 'warn' | 'bad' | 'neutral' =>
  severity === 'INFO' ? 'info' : severity === 'WARN' ? 'warn' : severity === 'ERROR' || severity === 'FATAL' ? 'bad' : 'neutral';
