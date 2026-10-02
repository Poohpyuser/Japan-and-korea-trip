// Dark by default (like Wanderlog); can be switched to light or "match my phone" in Settings.
const KEY = 'theme';
export const getTheme = () => { try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; } };
export function applyTheme(t = getTheme()) {
  document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#262b33' : '#ffffff');
}
export function setTheme(t) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } applyTheme(t); }
