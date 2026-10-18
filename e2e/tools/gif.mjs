// Кадры для демо-GIF в README: меню → класс → карта → бой → награда.
// Запуск: node e2e/tools/gif.mjs [outDir], потом python e2e/tools/make_gif.py [outDir] docs/demo.gif
// Нужен запущенный preview: npm run preview -w @cyberhack/web -- --port 4173
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'tmp/gif';
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));

// Съёмка через CDP screencast: браузер сам присылает кадры, в имени файла — метка времени в мс
let frame = 0;
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const ms = Math.round(metadata.timestamp * 1000);
  writeFileSync(join(out, `${ms}.jpg`), Buffer.from(data, 'base64'));
  frame++;
  void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90 });

const pause = (ms) => page.waitForTimeout(ms);
const tid = (id) => page.getByTestId(id);

await page.goto(`${base}?seed=DEMOGIF1`);
await tid('menu').waitFor();
await pause(1200);
await tid('menu-new').click();
await tid('class-select').waitFor();
await pause(700);
await tid('class-phreaker').hover();
await pause(500);
await tid('class-netrunner').click();
await pause(900);
await tid('start-run').click();
await tid('map').waitFor();
await pause(1300);
await page.locator('[data-testid="map-node"][data-state="available"][data-kind="combat"]').first().click();
await tid('combat').waitFor();
await pause(1200);

// Бой: атаки в цель, остальное повторным кликом; до наград или 6 ходов
const combat = tid('combat');
const reward = tid('reward-screen');
for (let turn = 0; turn < 6 && !(await reward.isVisible()); turn++) {
  await page.locator('[data-phase="player"]').or(reward).first().waitFor();
  for (let i = 0; i < 8; i++) {
    if (!(await combat.isVisible()) || (await combat.getAttribute('data-phase')) !== 'player') break;
    const playable = page.locator('[data-testid="hand-card"][data-playable="1"]');
    if ((await playable.count()) === 0) break;
    const targeted = playable.and(page.locator('[data-targeted="1"]'));
    const card = (await targeted.count()) > 0 ? targeted.first() : playable.first();
    const isTargeted = (await card.getAttribute('data-targeted')) === '1';
    await card.hover();
    await pause(250);
    await card.click();
    await pause(300);
    if (isTargeted) await page.locator('[data-testid="enemy-hit"]:not([disabled])').first().click();
    else await card.click();
    await pause(650);
  }
  if (await reward.isVisible()) break;
  if ((await combat.getAttribute('data-phase')) === 'player') await tid('end-turn').click();
  await pause(1200);
}
if (await reward.isVisible()) await pause(1800);

await cdp.send('Page.stopScreencast');
await browser.close();
console.log('frames', frame, out);
