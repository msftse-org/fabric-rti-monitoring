import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

export function useElementWidth<T extends HTMLElement | SVGElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(Math.round(element.getBoundingClientRect().width));
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Calls `onDismiss` on an outside pointer press or Escape while `active`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, active: boolean): void {
  const callback = useRef(onDismiss);
  callback.current = onDismiss;
  useEffect(() => {
    if (!active) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) callback.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') callback.current();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active]);
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export function useEscape(handler: () => void, active: boolean): void {
  const callback = useRef(handler);
  callback.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') callback.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** A boolean persisted in localStorage; failures (private mode) degrade to in-memory state. */
export function usePersistedFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : stored === '1';
    } catch {
      return initial;
    }
  });
  const update = (next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next ? '1' : '0');
    } catch {
      // Persisting is best-effort.
    }
  };
  return [value, update];
}
