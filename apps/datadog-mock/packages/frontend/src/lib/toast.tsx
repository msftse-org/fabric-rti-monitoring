import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export const NOT_IN_MOCK = 'Not part of this mock';

interface Toast {
  id: number;
  message: string;
}

const ToastContext = createContext<(message?: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const notify = useCallback((message: string = NOT_IN_MOCK) => {
    const id = ++counter.current;
    setToasts((current) => [...current.slice(-2), { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Handler for UI that exists in the vendor product but is not backed by data here. */
export function useInert(): () => void {
  const notify = useToast();
  return useMemo(() => () => notify(NOT_IN_MOCK), [notify]);
}
