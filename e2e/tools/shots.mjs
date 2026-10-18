// Скриншоты всех dev-сценариев на 360/768/1440. Запуск: node e2e/tools/shots.mjs [outDir] [scenarios...]
// Нужен запущенный preview: npx vite preview --port 4173 (из apps/web).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'tmp/shots';
const only = process.argv.slice(3);
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const scenarios = only.length ? only : ['menu', 'class', 'profile', 'map', 'combat', 'reward', 'card_pick', 'shop', 'rest', 'event', 'deck', 'defeat', 'victory'];
const sizes = [
  { name: '360', width: 360, height: 780, mobile: true },
  { name: '768', width: 768, height: 1024, mobile: true },
  { name: '1440', width: 1440, height: 900, mobile: false },
];
mkdirSync(out, { recursive: true });
// Профиль «уже умеет играть»: без приглашения в обучение и одноразовых подсказок на скриншотах
const SKIP_TUTORIAL = () => {
  try {
    localStorage.setItem('cyberhack:tutorial', 'done');
    localStorage.setItem('cyberhack:hints', '["*"]');
  } catch {
    /* хранилище недоступно */
  }
};
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' });
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.mobile, isMobile: s.mobile, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.addInitScript(SKIP_TUTORIAL);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log(`[${s.name}] console:`, m.text()));
  page.on('pageerror', (e) => console.log(`[${s.name}] pageerror:`, e.message));
  for (const sc of scenarios) {
    const url = ['menu', 'class', 'profile'].includes(sc) ? base : `${base}?dev=${sc}`;
    await page.goto(url);
    await page.waitForTimeout(600);
    if (sc === 'class') await page.getByRole('button', { name: /Новый взлом/ }).click();
    if (sc === 'profile') await page.getByRole('button', { name: /Профиль/ }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(out, `${sc}-${s.name}.png`), fullPage: false });
  }
  await ctx.close();
}
await browser.close();
console.log('ok', out);
