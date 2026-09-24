import { useEffect, useState } from 'react';

const STORAGE_KEY = 'scipair-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const CHANGE_EVENT = 'scipair-theme-change';

// Charts and the network draw on canvas, so they read the CSS tokens directly.
export function readTokens(element = document.documentElement) {
  const style = getComputedStyle(element);
  const get = (name) => style.getPropertyValue(`--${name}`).trim();
  return {
    a: get('a'),
    b: get('b'),
    both: get('both'),
    aTint: get('a-tint'),
    bTint: get('b-tint'),
    bothTint: get('both-tint'),
    ink: get('ink'),
    ink2: get('ink-2'),
    ink3: get('ink-3'),
    rule: get('rule'),
    ruleStrong: get('rule-strong'),
    surface: get('surface'),
    aSoft: get('a-soft'),
    bSoft: get('b-soft'),
    serif: get('serif'),
    mono: get('mono'),
    sans: get('sans'),
  };
}

// 'system' | 'light' | 'dark'. public/index.html applies the saved choice
// before first paint so the page never flashes the wrong theme.
export function getThemePreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePreference(value) {
  try {
    if (value === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {}
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function resolve() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

function useThemeChange(read) {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read());
    const media = window.matchMedia?.(DARK_QUERY);
    media?.addEventListener?.('change', update);
    window.addEventListener(CHANGE_EVENT, update);
    return () => {
      media?.removeEventListener?.('change', update);
      window.removeEventListener(CHANGE_EVENT, update);
    };
  }, [read]);
  return value;
}

// The scheme actually on screen, after applying the preference.
export function useColorScheme() {
  return useThemeChange(resolve);
}

export function useThemePreference() {
  return [useThemeChange(getThemePreference), setThemePreference];
}
