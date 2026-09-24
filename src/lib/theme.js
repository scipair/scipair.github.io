import { useEffect, useState } from 'react';

// Charts and the network draw on canvas, so they read the CSS tokens directly.
export function readTokens() {
  const style = getComputedStyle(document.documentElement);
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
    sans: get('sans'),
  };
}

export function useColorScheme() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(
    () => !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setDark(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return dark ? 'dark' : 'light';
}
