import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTelemetry, windowBundle, type TelemetryBundle, type TelemetryState } from '@telemetry';
import { derive, type Derived, type Windowed } from './derive';
import { MINUTE, type TimeRange } from './time';

export const TIME_OPTIONS = [
  { minutes: 5, label: 'Last 5 minutes' },
  { minutes: 15, label: 'Last 15 minutes' },
  { minutes: 30, label: 'Last 30 minutes' },
  { minutes: 60, label: 'Last hour' },
] as const;
export const DEFAULT_MINUTES = 15;

export interface ReadyData {
  bundle: TelemetryBundle;
  win: Windowed;
  /** Whole-minute span actually covered by data inside the selected window. */
  range: TimeRange;
  derived: Derived;
}

interface DataContextValue {
  telemetry: TelemetryState;
  minutes: number;
  setMinutes: (minutes: number) => void;
  ready: ReadyData | null;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const telemetry = useTelemetry({ minutes: 60 });
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const { bundle } = telemetry;

  const ready = useMemo<ReadyData | null>(() => {
    if (!bundle) return null;
    const win = windowBundle(bundle, minutes);
    const firstSeenMs = Date.parse(bundle.environment.firstSeen);
    const range: TimeRange = {
      startMs: Math.max(Math.ceil(win.since / MINUTE) * MINUTE, Math.floor(firstSeenMs / MINUTE) * MINUTE),
      endMs: (Math.floor(win.newest / MINUTE) + 1) * MINUTE,
    };
    return { bundle, win, range, derived: derive(bundle, win, firstSeenMs) };
  }, [bundle, minutes]);

  const value = useMemo(() => ({ telemetry, minutes, setMinutes, ready }), [telemetry, minutes, ready]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useDataContext(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('DataProvider is missing');
  return value;
}

export function useDataState() {
  return useDataContext();
}

/** Only valid below `DataBoundary`, which guarantees the bundle is loaded. */
export function useData(): ReadyData {
  const { ready } = useDataContext();
  if (!ready) throw new Error('Telemetry bundle is not loaded');
  return ready;
}
