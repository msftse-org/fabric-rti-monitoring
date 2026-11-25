import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelemetryBundle } from './types';
import { createLiveClient } from './browser-live';
import { readLiveConfig, telemetryTransport } from './live-config';
import { ConnectRequiredError, KustoHttpError } from './kusto-browser';
import { createRefreshGate, initialRefreshState, liveSuccess, refreshFailure, type RefreshState } from './refresh-state';

export type TelemetryMode = 'live' | 'snapshot';

export interface TelemetryState extends RefreshState {
  /** Browser live uses delegated Kusto authentication; local live uses the loopback API. */
  liveConfigured: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  refresh: () => void;
}

const setup = readLiveConfig(import.meta.env);
const transport = telemetryTransport(import.meta.env, Boolean(setup.config), Boolean(setup.error));
const snapshotUrl = `${import.meta.env.BASE_URL}telemetry.snapshot.json`;
let browserClient: ReturnType<typeof createLiveClient> | null = null;
function client() {
  if (!setup.config) throw new Error('Live telemetry is not configured.');
  browserClient ??= createLiveClient(setup.config, new URL('/auth-redirect.html', window.location.origin).href);
  return browserClient;
}

async function getJson(url: string, signal: AbortSignal): Promise<TelemetryBundle> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  if (!response.ok) throw new Error(`Telemetry could not be loaded (HTTP ${response.status}). Try refreshing.`);
  const body = await response.json() as TelemetryBundle;
  if (body.schemaVersion !== 1 || !Array.isArray(body.services) || !Number.isFinite(Date.parse(body.generatedAt))) {
    throw new Error('Unexpected telemetry payload.');
  }
  return body;
}

/** Snapshot stays usable before sign-in. Only an explicit user gesture may open MSAL. */
export function useTelemetry(options: { minutes?: number; refreshMs?: number } = {}): TelemetryState {
  const { minutes = 60, refreshMs = 15_000 } = options;
  const [state, setState] = useState(initialRefreshState);
  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState(0);
  const stateRef = useRef(state);
  const loadRef = useRef<() => void>(() => undefined);
  const mounted = useRef(false);
  const connectingRef = useRef(false);
  const refresh = useCallback(() => loadRef.current(), []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const gate = createRefreshGate();
    const controller = new AbortController();
    let lastStartedAt = 0;
    const apply = (next: RefreshState, active: () => boolean) => {
      if (!active()) return;
      stateRef.current = next;
      setState(next);
    };
    const load = () => gate.run(async (active) => {
      lastStartedAt = Date.now();
      apply({ ...stateRef.current, loading: true }, active);
      let liveError: string | null = transport === 'snapshot' ? setup.error : null;
      let needsConnect = false;
      if (transport !== 'snapshot') {
        try {
          const bundle = transport === 'browser'
            ? await client().load(minutes, controller.signal)
            : await getJson(`/api/telemetry?minutes=${encodeURIComponent(minutes)}`, controller.signal);
          apply(liveSuccess(bundle, new Date().toISOString()), active);
          return;
        } catch (error) {
          // Do not display raw MSAL/network errors: they can contain identity details.
          needsConnect = error instanceof ConnectRequiredError || (error instanceof KustoHttpError && error.status === 401);
          liveError = needsConnect ? 'Sign in to connect live Eventhouse data.'
            : error instanceof KustoHttpError ? error.message
              : 'Live telemetry refresh failed. Check your connection; automatic refresh will retry.';
          if (!active()) return;
          if (stateRef.current.bundle) {
            apply(refreshFailure(stateRef.current, liveError, needsConnect), active);
            return;
          }
        }
      }
      try {
        const bundle = await getJson(snapshotUrl, controller.signal);
        apply({
          bundle: { ...bundle, source: 'snapshot' }, mode: 'snapshot', loading: false,
          error: liveError, fellBack: transport !== 'snapshot', needsConnect, lastSuccessAt: null,
        }, active);
      } catch {
        apply(refreshFailure(stateRef.current, liveError
          ? `${liveError} The bundled snapshot is also unavailable. Retry with Refresh.`
          : 'The bundled snapshot is unavailable. Retry with Refresh.', needsConnect), active);
      }
    });
    loadRef.current = () => { void load(); };
    void load();
    if (transport === 'snapshot') return () => { gate.invalidate(); controller.abort(); loadRef.current = () => undefined; };
    const visibleRefresh = () => {
      if (document.visibilityState === 'visible' && !stateRef.current.needsConnect && Date.now() - lastStartedAt >= 5_000) void load();
    };
    // Signed-out sessions do not repeatedly query Eventhouse or reload the snapshot.
    const timer = window.setInterval(visibleRefresh, Math.max(15_000, refreshMs));
    window.addEventListener('focus', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      gate.invalidate();
      controller.abort();
      loadRef.current = () => undefined;
      window.clearInterval(timer);
      window.removeEventListener('focus', visibleRefresh);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [minutes, refreshMs, session]);

  const connect = useCallback(async () => {
    if (transport !== 'browser' || connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    try {
      await client().connect();
      if (mounted.current) setSession((value) => value + 1);
    } catch {
      if (mounted.current) {
        const next = refreshFailure(stateRef.current, 'Sign-in was not completed. Allow popups and select Connect live data to try again.', true);
        stateRef.current = next;
        setState(next);
      }
    } finally {
      connectingRef.current = false;
      if (mounted.current) setConnecting(false);
    }
  }, []);

  return { ...state, liveConfigured: transport === 'browser', connecting, connect, refresh };
}
