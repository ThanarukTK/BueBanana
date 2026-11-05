'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Resolved = 'light' | 'dark';

const KEY = 'theme';
const MEDIA = '(prefers-color-scheme: dark)';

function systemTheme(): Resolved {
  return typeof window !== 'undefined' && window.matchMedia(MEDIA).matches ? 'dark' : 'light';
}
/** Apply the resolved theme to <html> as a class + color-scheme. Safe to call anywhere client-side. */
export function applyTheme(resolved: Resolved) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* storage unavailable */ }
  return 'system';
}

type ThemeCtx = {
  theme: Theme;
  resolvedTheme: Resolved;
  systemTheme: Resolved;
  setTheme: (t: Theme) => void;
};
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [system, setSystem] = useState<Resolved>('light');

  // On mount: read the stored preference, subscribe to OS changes, apply immediately.
  useEffect(() => {
    const t = storedTheme();
    setThemeState(t);
    const sys = systemTheme();
    setSystem(sys);
    applyTheme(t === 'system' ? sys : t);
    const mq = window.matchMedia(MEDIA);
    const onChange = () => setSystem(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Re-apply whenever the chosen or system theme changes (e.g. after a toggle, or OS switch while on "system").
  useEffect(() => {
    applyTheme(theme === 'system' ? system : theme);
  }, [theme, system]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* ignore quota / private mode */ }
  }, []);

  const resolvedTheme: Resolved = theme === 'system' ? system : theme;
  const value = useMemo<ThemeCtx>(() => ({ theme, resolvedTheme, systemTheme: system, setTheme }), [theme, resolvedTheme, system, setTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
