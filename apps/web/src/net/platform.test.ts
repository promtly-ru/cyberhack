import { describe, expect, it } from 'vitest';
import { SITE_URL, isNativeApp, resolveRedirect } from './platform';

describe('isNativeApp', () => {
  it('браузер', () => expect(isNativeApp({})).toBe(false));
  it('Tauri', () => {
    expect(isNativeApp({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(isNativeApp({ __TAURI__: {} })).toBe(true);
  });
  it('Capacitor', () => {
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
  });
});

describe('resolveRedirect', () => {
  it('браузер: текущая страница', () =>
    expect(resolveRedirect({ origin: 'https://a.b', pathname: '/x/' }, false)).toBe('https://a.b/x/'));
  it('приложение: сайт', () =>
    expect(resolveRedirect({ origin: 'tauri://localhost', pathname: '/' }, true)).toBe(SITE_URL));
  it('нестандартная схема без флага: сайт', () =>
    expect(resolveRedirect({ origin: 'capacitor://localhost', pathname: '/' }, false)).toBe(SITE_URL));
  it('нет location: сайт', () => expect(resolveRedirect(undefined, false)).toBe(SITE_URL));
});
