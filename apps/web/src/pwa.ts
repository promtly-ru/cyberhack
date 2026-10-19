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
    .then(({ registerSW }) => {
      const hadController = !!navigator.serviceWorker.controller;
      registerSW({ immediate: true });
      // Новая версия взяла управление, перезагружаем страницу, чтобы сразу показать свежую игру
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    })
    .catch(() => undefined);
}
