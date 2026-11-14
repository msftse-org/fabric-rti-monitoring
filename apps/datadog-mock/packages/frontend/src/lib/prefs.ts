import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persistence is best effort.
  }
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (read('ddmock.theme') === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      write('ddmock.theme', next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

export function useDismissible(key: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => read(key) === '1');
  const dismiss = useCallback(() => {
    write(key, '1');
    setDismissed(true);
  }, [key]);
  return [dismissed, dismiss];
}
