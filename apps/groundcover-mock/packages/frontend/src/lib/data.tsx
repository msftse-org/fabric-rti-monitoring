import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTelemetry, type TelemetryState } from '@telemetry';
import { buildView } from './derive';
import type { View } from './model';

export const TIME_OPTIONS = [
  { minutes: 5, label: 'Last 5 minutes' },
  { minutes: 15, label: 'Last 15 minutes' },
  { minutes: 30, label: 'Last 30 minutes' },
  { minutes: 60, label: 'Last 1 hour' },
] as const;

interface DataContextValue {
  telemetry: TelemetryState;
  minutes: number;
  setMinutes: (minutes: number) => void;
  view: View | null;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const telemetry = useTelemetry({ minutes: 60 });
  const [minutes, setMinutes] = useState(15);
  const { bundle } = telemetry;
  const view = useMemo(() => (bundle ? buildView(bundle, minutes) : null), [bundle, minutes]);
  const value = useMemo(() => ({ telemetry, minutes, setMinutes, view }), [telemetry, minutes, view]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside DataProvider');
  return value;
}

/** For pages that render only after the bundle has loaded (see DataGate). */
export function useView(): View {
  const { view } = useData();
  if (!view) throw new Error('useView called before telemetry loaded');
  return view;
}

export function timeLabel(minutes: number): string {
  return TIME_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `Last ${minutes} minutes`;
}
