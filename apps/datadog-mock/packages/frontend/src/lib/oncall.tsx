import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  applyActions,
  buildOnCall,
  counterpartUrl,
  createActionStore,
  createClock,
  lookup,
  nextManualPageId,
  toRtiPath,
  type Lookup,
  type OnCallModel,
  type Page,
  type Team,
  type Urgency,
  type User,
  type UserAction,
} from '@oncall';
import type { TelemetryBundle } from '@telemetry';
import { useShell } from './app';

const store = createActionStore('ddmock.oncall.actions');

type WithoutActor<T> = T extends unknown ? Omit<T, 'at' | 'by'> : never;
export type ActionInput = Exclude<WithoutActor<UserAction>, { kind: 'manual' }>;

export interface ManualPageInput {
  teamId: string;
  title: string;
  description: string;
  urgency: Urgency;
}

export interface OnCallContextValue {
  model: OnCallModel;
  lk: Lookup;
  /** Demo clock: the bundle instant plus real time elapsed since load, refreshed every 15 s. */
  now: number;
  clock: () => number;
  me: User;
  actions: UserAction[];
  act: (action: ActionInput) => void;
  createPage: (input: ManualPageInput) => number;
  reset: () => void;
  user: (id: string | null | undefined) => User | undefined;
  /** Platform actions carry no user; Datadog labels them as itself. */
  name: (id: string | null | undefined) => string;
  team: (id: string | null | undefined) => Team | undefined;
  page: (id: number) => Page | undefined;
}

const OnCallContext = createContext<OnCallContextValue | null>(null);

let cache: { key: string; model: OnCallModel } | null = null;

function baseModel(bundle: TelemetryBundle): OnCallModel {
  if (cache?.key !== bundle.generatedAt) cache = { key: bundle.generatedAt, model: buildOnCall(bundle) };
  return cache.model;
}

export function OnCallProvider({ children }: { children: ReactNode }) {
  const { data } = useShell();
  if (!data) throw new Error('OnCallProvider requires a telemetry bundle');
  const base = baseModel(data.bundle);
  const actions = useSyncExternalStore(store.subscribe, store.get, store.get);
  const clock = useMemo(() => createClock(base.now), [base.now]);
  const [now, setNow] = useState(() => clock());

  useEffect(() => {
    setNow(clock());
    const timer = window.setInterval(() => setNow(clock()), 15_000);
    return () => window.clearInterval(timer);
  }, [clock]);

  const model = useMemo(() => applyActions(base, actions, now), [base, actions, now]);
  const lk = useMemo(() => lookup(base), [base]);

  const act = useCallback(
    (action: ActionInput) => {
      const at = clock();
      store.add({ ...action, at, by: base.currentUserId } as UserAction);
      setNow(at);
    },
    [clock, base.currentUserId],
  );

  const createPage = useCallback(
    (input: ManualPageInput) => {
      const at = clock();
      const pageId = nextManualPageId(base, store.get(), at);
      store.add({ kind: 'manual', pageId, at, by: base.currentUserId, ...input });
      setNow(at);
      return pageId;
    },
    [clock, base],
  );

  const value = useMemo<OnCallContextValue>(() => {
    const pages = new Map(model.pages.map((item) => [item.id, item]));
    return {
      model,
      lk,
      now: Math.max(now, model.now),
      clock,
      me: lk.users.get(model.currentUserId)!,
      actions,
      act,
      createPage,
      reset: store.clear,
      user: (id) => (id ? lk.users.get(id) : undefined),
      name: (id) => (id ? lk.users.get(id)?.name ?? id : 'Datadog'),
      team: (id) => (id ? lk.teams.get(id) : undefined),
      page: (id) => pages.get(id),
    };
  }, [model, lk, now, clock, actions, act, createPage]);

  return <OnCallContext.Provider value={value}>{children}</OnCallContext.Provider>;
}

export function useOnCall(): OnCallContextValue {
  const value = useContext(OnCallContext);
  if (!value) throw new Error('OnCallProvider is missing');
  return value;
}

/** Display name of an on-call entity for breadcrumbs; falls back to the id. */
export function entityName(bundle: TelemetryBundle | undefined, kind: 'team' | 'schedule' | 'policy', id: string): string {
  if (!bundle) return id;
  const model = baseModel(bundle);
  const list: { id: string; name: string }[] = kind === 'team' ? model.teams : kind === 'schedule' ? model.schedules : model.policies;
  return list.find((item) => item.id === id)?.name ?? id;
}

/** The equivalent Fabric RTI on-call route, or null while the hosted URL is unknown. */
export function compareUrl(path: string): string | null {
  return counterpartUrl('rti', toRtiPath(path.split('?')[0]), import.meta.env.DEV);
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
