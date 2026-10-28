/**
 * Light / dark theme, as in the demo: light by default, remembered in this browser only.
 * The choice is set as data-theme on <html>, so dialogs and sheets rendered in portals
 * pick up the same design tokens (styles/index.css).
 */
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'fh-matrimony-theme';
const listeners = new Set<() => void>();
let current: Theme = 'light';

function apply(theme: Theme): void {
  current = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  listeners.forEach((notify) => notify());
}

/** Call once before rendering, so the first paint already uses the stored theme. */
export function initTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private windows); fall back to light.
  }
  apply(stored === 'dark' ? 'dark' : 'light');
}

export function setTheme(theme: Theme): void {
  apply(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered, but still applied for this visit.
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => current,
  );
  return { theme, setTheme, toggleTheme: () => setTheme(current === 'dark' ? 'light' : 'dark') };
}
