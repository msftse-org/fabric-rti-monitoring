import type { ServiceStats } from '../../lib/derive';

export interface DrillFilters {
  cluster: string | null;
  transaction: string | null;
  env: string | null;
  statusCode: string | null;
}

export interface ServiceTabProps {
  service: ServiceStats;
  filters: DrillFilters;
}

/** Status_Code filter values map onto the `outcome` field of the telemetry. */
export function outcomeOf(statusCode: string | null): string | null {
  if (statusCode === 'ok') return 'success';
  return statusCode;
}
