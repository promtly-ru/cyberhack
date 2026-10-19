import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 900_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: 0,
  workers: Number(process.env.PT_WORKERS ?? 3),
  reporter: [['list']],
  outputDir: './.out',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    locale: 'ru-RU',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
  // сервер запускаем вручную (preview собранного dist)
});
