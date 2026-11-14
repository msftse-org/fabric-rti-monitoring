import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
}

interface ToastApi {
  notify: (message: string) => void;
  /** Shared handler for navigation entries that are not backed by data. */
  inert: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const INERT_MESSAGE = 'Not part of this mock';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const notify = useCallback((message: string) => {
    const id = ++counter.current;
    setItems((current) => [...current.slice(-2), { id, message }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 2600);
  }, []);

  const api = useMemo<ToastApi>(() => ({ notify, inert: () => notify(INERT_MESSAGE) }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="toast">
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
