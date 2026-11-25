import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTelemetry, type TelemetryBundle, type TelemetryState } from '@telemetry';
import { computeEdges, computeStats, type EdgeStat, type ServiceStat } from './derive';
import { MINUTE } from './time';
import { buildWindow, type WindowedData } from './window';

export const TIME_PRESETS = [
  { minutes: 5, short: '5m', label: 'Past 5 Minutes' },
  { minutes: 15, short: '15m', label: 'Past 15 Minutes' },
  { minutes: 30, short: '30m', label: 'Past 30 Minutes' },
  { minutes: 60, short: '1h', label: 'Past 1 Hour' },
] as const;

export interface TimeState {
  minutes: number;
  label: string;
  short: string;
  shift: number;
  paused: boolean;
  canStepBack: boolean;
  setMinutes: (minutes: number) => void;
  stepBack: () => void;
  stepForward: () => void;
  zoomOut: () => void;
  togglePaused: () => void;
}

export interface AppData extends WindowedData {
  bundle: TelemetryBundle;
  stats: ServiceStat[];
  statsByName: Record<string, ServiceStat>;
  edges: EdgeStat[];
}

export interface SourceState extends TelemetryState {
  generatedAt: string | null;
}

interface AppContextValue {
  source: SourceState;
  time: TimeState;
  data: AppData | null;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'ddmock.minutes';

function initialMinutes(): number {
  try {
    const stored = Number(window.sessionStorage.getItem(STORAGE_KEY));
    if (TIME_PRESETS.some((preset) => preset.minutes === stored)) return stored;
  } catch {
    // Storage can be unavailable in embedded contexts.
  }
  return 60;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const telemetry = useTelemetry({ minutes: 60 });
  const [minutes, setMinutesState] = useState(initialMinutes);
  const [shift, setShift] = useState(0);
  const [frozen, setFrozen] = useState<TelemetryBundle | null>(null);
  const bundle = frozen ?? telemetry.bundle;

  const setMinutes = useCallback((next: number) => {
    setMinutesState(next);
    setShift(0);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const data = useMemo<AppData | null>(() => {
    if (!bundle) return null;
    const win = buildWindow(bundle, minutes, shift);
    const stats = computeStats(bundle, win);
    return {
      ...win,
      bundle,
      stats,
      statsByName: Object.fromEntries(stats.map((stat) => [stat.name, stat])),
      edges: computeEdges(bundle, stats, win),
    };
  }, [bundle, minutes, shift]);

  const preset = TIME_PRESETS.find((item) => item.minutes === minutes) ?? TIME_PRESETS[3];
  const firstMs = bundle ? Date.parse(bundle.environment.firstSeen) : 0;
  const until = data?.until ?? 0;

  const time = useMemo<TimeState>(
    () => ({
      minutes,
      label: preset.label,
      short: preset.short,
      shift,
      paused: frozen !== null,
      canStepBack: data !== null && firstMs < until - minutes * MINUTE,
      setMinutes,
      stepBack: () => setShift((value) => value + 1),
      stepForward: () => setShift((value) => Math.max(0, value - 1)),
      zoomOut: () => {
        const next = TIME_PRESETS.find((item) => item.minutes > minutes);
        if (next) setMinutes(next.minutes);
      },
      togglePaused: () => setFrozen((current) => (current ? null : telemetry.bundle)),
    }),
    [minutes, preset, shift, frozen, data, firstMs, until, setMinutes, telemetry.bundle],
  );

  const source: SourceState = {
    ...telemetry,
    bundle,
    mode: bundle?.source ?? telemetry.mode,
    generatedAt: bundle?.generatedAt ?? null,
  };

  return <AppContext.Provider value={{ source, time, data }}>{children}</AppContext.Provider>;
}

function useContextValue(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProvider is missing');
  return value;
}

export const useShell = () => useContextValue();
export const useTime = () => useContextValue().time;

/** Telemetry for pages; only valid below `DataGate`, which guarantees a loaded bundle. */
export function useApp(): AppData {
  const { data } = useContextValue();
  if (!data) throw new Error('useApp requires loaded telemetry');
  return data;
}
