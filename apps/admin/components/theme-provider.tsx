'use client';

import * as React from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'maevelle-admin-theme';

/**
 * Executed inline in RootLayout before hydration so stored theme preference
 * applies on first paint without flash.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark'||s==='system')?s:'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(_e){}})();`;

interface ThemeContextValue {
  readonly theme: ThemeMode;
  readonly resolvedTheme: 'light' | 'dark';
  readonly setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeToDocument(mode: ThemeMode): 'light' | 'dark' {
  const isDark = resolveIsDark(mode);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }
  return isDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { readonly children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');

  React.useEffect(() => {
    let initial: ThemeMode = 'system';
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        initial = saved;
      }
    } catch {
      initial = 'system';
    }
    setThemeState(initial);
    setResolvedTheme(applyThemeToDocument(initial));

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      setThemeState((current) => {
        if (current === 'system') {
          setResolvedTheme(applyThemeToDocument('system'));
        }
        return current;
      });
    };

    media.addEventListener('change', handleMediaChange);
    return () => media.removeEventListener('change', handleMediaChange);
  }, []);

  const setTheme = React.useCallback((next: ThemeMode) => {
    setThemeState(next);
    setResolvedTheme(applyThemeToDocument(next));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage quota / private mode failures
    }
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Returns the active theme state. Falls back safely when components such as
 * UserMenu are mounted standalone in unit tests without ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    theme: 'system',
    resolvedTheme:
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light',
    setTheme: (next: ThemeMode) => {
      applyThemeToDocument(next);
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(THEME_STORAGE_KEY, next);
        }
      } catch {
        // Safe fallback
      }
    },
  };
}
