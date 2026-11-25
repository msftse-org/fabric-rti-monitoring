import type { TelemetryBundle } from './types.ts';

export interface RefreshState {
  bundle: TelemetryBundle | null;
  mode: 'live' | 'snapshot' | null;
  loading: boolean;
  error: string | null;
  fellBack: boolean;
  lastSuccessAt: string | null;
  needsConnect: boolean;
}

export const initialRefreshState: RefreshState = {
  bundle: null, mode: null, loading: true, error: null, fellBack: false, lastSuccessAt: null, needsConnect: false,
};

/** One refresh at a time; invalidation prevents late results from changing a new view. */
export function createRefreshGate() {
  let busy = false;
  let valid = true;
  return {
    async run(work: (active: () => boolean) => Promise<void>) {
      if (busy || !valid) return;
      busy = true;
      try { await work(() => valid); } finally { busy = false; }
    },
    invalidate() { valid = false; },
  };
}

export function liveSuccess(bundle: TelemetryBundle, now: string): RefreshState {
  return { bundle: { ...bundle, source: 'live' }, mode: 'live', loading: false, error: null, fellBack: false, lastSuccessAt: now, needsConnect: false };
}

export function refreshFailure(previous: RefreshState, error: string, needsConnect: boolean): RefreshState {
  // In particular, do not overwrite a good live bundle with an old bundled snapshot.
  return { ...previous, loading: false, error, needsConnect, fellBack: previous.mode === 'snapshot' };
}

export function createHistoryCache<T>(load: () => Promise<T>, now = Date.now, ttl = 60_000): () => Promise<T> {
  let cached: { value: T; at: number } | null = null;
  let pending: Promise<T> | null = null;
  return () => {
    if (cached && now() - cached.at < ttl) return Promise.resolve(cached.value);
    if (!pending) pending = load().then((value) => {
      cached = { value, at: now() };
      return value;
    }).finally(() => { pending = null; });
    return pending;
  };
}
