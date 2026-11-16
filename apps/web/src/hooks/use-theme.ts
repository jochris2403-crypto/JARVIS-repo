import { useEffect, useSyncExternalStore } from 'react';
import { useUiStore } from '@/stores/ui-store';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(callback: () => void) {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function systemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

/** The theme actually rendered, after resolving the `system` preference. */
export function useResolvedTheme(): 'dark' | 'light' {
  const preference = useUiStore((s) => s.theme);
  const prefersDark = useSyncExternalStore(subscribe, systemPrefersDark, () => true);
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Applies theme and motion preferences to the document root. Mount once. */
export function useApplyAppearance(): void {
  const theme = useResolvedTheme();
  const reducedMotion = useUiStore((s) => s.reducedMotion);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  const uiScale = useUiStore((s) => s.uiScale);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
}
