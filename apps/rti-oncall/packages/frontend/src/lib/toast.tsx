import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Info, X } from 'lucide-react';

type Tone = 'success' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  detail?: string;
}

type Notify = (title: string, detail?: string, tone?: Tone) => void;

const ToastContext = createContext<Notify>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback<Notify>(
    (title, detail, tone = 'success') => {
      counter.current += 1;
      const id = counter.current;
      setToasts((list) => [...list.slice(-2), { id, tone, title, detail }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), 5000));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            {toast.tone === 'success' ? <CircleCheck size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            <div className="toast__body">
              <strong>{toast.title}</strong>
              {toast.detail && <span>{toast.detail}</span>}
            </div>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
