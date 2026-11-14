import { useMemo } from 'react';
import type { TelemetryBundle } from '@telemetry';
import { useData } from './data';
import type { SpanRow } from './fields';

/** Every span of the traces inside the window, newest first. */
export function buildSpanRows(bundle: TelemetryBundle, traces: TelemetryBundle['traces']): SpanRow[] {
  const rows: SpanRow[] = [];
  for (const trace of traces) {
    for (const span of bundle.spans[trace.traceId] ?? []) rows.push({ span, trace, startMs: Date.parse(span.start) });
  }
  return rows.sort((a, b) => b.startMs - a.startMs);
}

export function useSpanRows(): SpanRow[] {
  const { bundle, win } = useData();
  return useMemo(() => buildSpanRows(bundle, win.traces), [bundle, win.traces]);
}
