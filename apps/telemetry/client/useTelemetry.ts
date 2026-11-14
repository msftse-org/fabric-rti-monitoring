import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelemetryBundle } from './types';

export type TelemetryMode = 'live' | 'snapshot';

export interface TelemetryState {
  bundle: TelemetryBundle | null;
  /** `live` reads the loopback API; `snapshot` reads the bundled JSON file. */
  mode: TelemetryMode | null;
  loading: boolean;
  error: string | null;
  /** Set when live mode was requested but the API was unreachable. */
  fellBack: boolean;
  refresh: () => void;
}

const requested = (import.meta.env.VITE_TELEMETRY_MODE as string | undefined) ?? (import.meta.env.PROD ? 'snapshot' : 'live');
const snapshotUrl = `${import.meta.env.BASE_URL}telemetry.snapshot.json`;

async function getJson(url: string, timeoutMs: number): Promise<TelemetryBundle> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as TelemetryBundle;
  if (body.schemaVersion !== 1 || !Array.isArray(body.services)) throw new Error('Unexpected telemetry payload');
  return body;
}

/**
 * Loads the telemetry bundle. In `live` mode it polls the local API every
 * `refreshMs` and falls back to the bundled snapshot when the API is not running.
 */
export function useTelemetry(options: { minutes?: number; refreshMs?: number } = {}): TelemetryState {
  const { minutes = 60, refreshMs = 15_000 } = options;
  const [state, setState] = useState<Omit<TelemetryState, 'refresh'>>({ bundle: null, mode: null, loading: true, error: null, fellBack: false });
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    const apply = (next: Omit<TelemetryState, 'refresh'>) => {
      if (current === generation.current) setState(next);
    };
    if (requested === 'live') {
      try {
        const bundle = await getJson(`/api/telemetry?minutes=${minutes}`, 20_000);
        return apply({ bundle: { ...bundle, source: 'live' }, mode: 'live', loading: false, error: null, fellBack: false });
      } catch {
        // Fall through to the snapshot below.
      }
    }
    try {
      const bundle = await getJson(snapshotUrl, 20_000);
      apply({ bundle: { ...bundle, source: 'snapshot' }, mode: 'snapshot', loading: false, error: null, fellBack: requested === 'live' });
    } catch (error) {
      apply({ bundle: null, mode: null, loading: false, error: error instanceof Error ? error.message : String(error), fellBack: false });
    }
  }, [minutes]);

  useEffect(() => {
    void load();
    if (requested !== 'live') return undefined;
    const timer = window.setInterval(() => void load(), refreshMs);
    return () => window.clearInterval(timer);
  }, [load, refreshMs]);

  return { ...state, refresh: () => void load() };
}
