import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export const NOT_IN_MOCK = 'Not part of this mock';

interface ToastItem {
  id: number;
  message: string;
}

const ToastContext = createContext<(message?: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string = NOT_IN_MOCK) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2600);
  }, []);

  const items = useMemo(
    () => toasts.map((toast) => (
      <div key={toast.id} className="toast">{toast.message}</div>
    )),
    [toasts],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{items}</div>
    </ToastContext.Provider>
  );
}

export function useToast(): (message?: string) => void {
  return useContext(ToastContext);
}
