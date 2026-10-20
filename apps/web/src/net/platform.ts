/** Определение «запущено в нативном приложении» (Tauri / Capacitor). */
export const SITE_URL = 'https://promtly-ru.github.io/cyberhack/';

export function isNativeApp(g: unknown = globalThis): boolean {
  const w = g as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (w.__TAURI__ || w.__TAURI_INTERNALS__) return true;
  try {
    return w.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** URL возврата из письма/OAuth: в браузере — текущая страница, в приложении — публичный сайт. */
export function resolveRedirect(loc: { origin: string; pathname: string } | undefined, native: boolean): string {
  if (native || !loc || !/^https?:\/\//.test(loc.origin)) return SITE_URL;
  return `${loc.origin}${loc.pathname}`;
}
