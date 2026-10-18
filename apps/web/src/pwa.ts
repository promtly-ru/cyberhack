/**
 * Service worker (офлайн-кэш PWA) — только в обычном браузере.
 * В нативных оболочках бандл и так лежит локально, а SW там мешает обновлениям
 * (кэширует старую версию поверх свежего APK/инсталлятора).
 */
type NativeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
  __TAURI_INTERNALS__?: unknown;
};

export function isNativeShell(w: Window = window): boolean {
  const nw = w as NativeWindow;
  if ('__TAURI_INTERNALS__' in nw) return true;
  try {
    return nw.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator) || isNativeShell()) return;
  void import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => undefined);
}
