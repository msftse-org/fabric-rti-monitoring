import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTelemetry, type TelemetryMode } from '@telemetry';
import { useLiveAlerts } from './liveAlerts';
import {
  applyActions,
  buildOnCall,
  createActionStore,
  createClock,
  createRuleStore,
  DAY,
  historyOf,
  lookup,
  nextManualPageId,
  type History,
  type Lookup,
  type Monitor,
  type OnCallModel,
  type Urgency,
  type User,
  type UserAction,
} from '@oncall';

const store = createActionStore('rti.oncall.actions');
const ruleStore = createRuleStore('rti.oncall.rules');

type Distribute<T> = T extends UserAction ? Omit<T, 'at' | 'by'> : never;
export type ActionInput = Exclude<Distribute<UserAction>, { kind: 'manual' }>;

export interface NewPageInput {
  teamId: string;
  title: string;
  description: string;
  urgency: Urgency;
}

export interface OnCall {
  /** The engine model with the viewer's actions replayed on top. */
  model: OnCallModel;
  lk: Lookup;
  /** The demo instant: the telemetry bundle generation time. */
  now: number;
  me: User;
  actions: UserAction[];
  act: (action: ActionInput) => void;
  createPage: (input: NewPageInput) => number;
  reset: () => void;
  clock: () => number;
  byViewer: (pageId: number, kind: UserAction['kind'], at: number) => boolean;
  /** Persisted Fabric alerts and legacy browser-only demo rules. */
  rules: Monitor[];
  saveRule: (rule: Monitor) => Promise<Monitor>;
  deleteRule: (id: number) => Promise<void>;
  resetRules: () => void;
  liveAlerts: ReturnType<typeof useLiveAlerts>;
  localRuleCount: number;
  /** The telemetry the rules are evaluated over, for the rule builder preview. */
  history: History;
  /** How far back that telemetry goes, such as "the last 7 days". */
  span: string;
}

function spanOf(history: History, now: number): string {
  const first = history.points[0] ? Date.parse(history.points[0].t) : now;
  const days = Math.round((now - first) / DAY);
  return days <= 1 ? 'the last 24 hours' : `the last ${days} days`;
}

export interface DataState {
  mode: TelemetryMode | null;
  loading: boolean;
  error: string | null;
  fellBack: boolean;
  refresh: () => void;
  onCall: OnCall | null;
}

const DataContext = createContext<DataState | null>(null);

export function OnCallProvider({ children }: { children: ReactNode }) {
  const telemetry = useTelemetry({ minutes: 60, refreshMs: 30_000 });
  const actions = useSyncExternalStore(store.subscribe, store.get, store.get);
  const localRules = useSyncExternalStore(ruleStore.subscribe, ruleStore.get, ruleStore.get);
  const liveAlerts = useLiveAlerts();
  const rules = useMemo(() => [...localRules.filter((local) => !liveAlerts.rules.some((rule) => rule.id === local.id)), ...liveAlerts.rules], [localRules, liveAlerts.rules]);
  const saveRule = useCallback(async (rule: Monitor) => {
    const saved = await liveAlerts.save(rule);
    ruleStore.remove(rule.id);
    return saved;
  }, [liveAlerts.save]);
  const deleteRule = useCallback(async (id: number) => {
    const rule = rules.find((rule) => rule.id === id);
    if (rule?.authored?.fabric) await liveAlerts.remove(rule);
    else ruleStore.remove(id);
  }, [rules, liveAlerts.remove]);
  const history = useMemo(() => (telemetry.bundle ? historyOf(telemetry.bundle) : null), [telemetry.bundle]);
  const base = useMemo(() => (telemetry.bundle ? buildOnCall(telemetry.bundle, { rules }) : null), [telemetry.bundle, rules]);
  // Keyed on the instant, not the model, so saving a rule does not restart the demo clock.
  const baseNow = base?.now ?? null;
  const clock = useMemo(() => (baseNow !== null ? createClock(baseNow) : () => Date.now()), [baseNow]);
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    setTick(clock());
    const timer = window.setInterval(() => setTick(clock()), 15_000);
    return () => window.clearInterval(timer);
  }, [clock]);

  const now = base ? Math.max(base.now, tick ?? base.now) : 0;
  const model = useMemo(() => (base ? applyActions(base, actions, now) : null), [base, actions, now]);
  const lk = useMemo(() => (model ? lookup(model) : null), [model]);

  const act = useCallback(
    (action: ActionInput) => {
      if (!base) return;
      store.add({ ...action, at: clock(), by: base.currentUserId } as UserAction);
    },
    [base, clock],
  );

  const createPage = useCallback(
    (input: NewPageInput) => {
      if (!base) return 0;
      const at = clock();
      const pageId = nextManualPageId(base, store.get(), at);
      store.add({ kind: 'manual', pageId, at, by: base.currentUserId, ...input });
      return pageId;
    },
    [base, clock],
  );

  const byViewer = useCallback(
    (pageId: number, kind: UserAction['kind'], at: number) => actions.some((action) => action.pageId === pageId && action.kind === kind && action.at === at),
    [actions],
  );

  const onCall = useMemo<OnCall | null>(() => {
    if (!model || !lk || !history) return null;
    const me = lk.users.get(model.currentUserId) ?? model.users[0];
    return { model, lk, now, me, actions, act, createPage, reset: store.clear, clock, byViewer, rules, saveRule, deleteRule, resetRules: ruleStore.clear, liveAlerts, localRuleCount: localRules.length, history, span: spanOf(history, now) };
  }, [model, lk, now, actions, act, createPage, clock, byViewer, rules, history, saveRule, deleteRule, liveAlerts, localRules.length]);

  const value = useMemo<DataState>(
    () => ({ mode: telemetry.mode, loading: telemetry.loading, error: telemetry.error, fellBack: telemetry.fellBack, refresh: telemetry.refresh, onCall }),
    [telemetry.mode, telemetry.loading, telemetry.error, telemetry.fellBack, telemetry.refresh, onCall],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside OnCallProvider');
  return value;
}

/** Views render only after the model exists, so they can rely on it. */
export function useOnCall(): OnCall {
  const value = useData().onCall;
  if (!value) throw new Error('useOnCall used before the on-call model loaded');
  return value;
}
