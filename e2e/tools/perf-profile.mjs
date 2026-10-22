// CPU-профиль входа в бой и одного хода: топ функций по self-time.
// Запуск: node e2e/tools/perf-profile.mjs [port=4174] [filter]
// Сборка без минификации для имён: npx vite build --minify false --outDir <dir>, затем vite preview --outDir <dir> --port 4174
import { chromium } from '@playwright/test';

const port = process.argv[2] ?? 4174;
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'no-preference' });
await ctx.addInitScript(() => {
  localStorage.setItem('cyberhack:tutorial', 'done');
  localStorage.setItem('cyberhack:hints', '["*"]');
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

async function prof(label, fn) {
  await cdp.send('Profiler.start');
  await fn();
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = {};
  profile.samples.forEach((id, i) => {
    const cf = byId.get(id).callFrame;
    const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`;
    self[k] = (self[k] ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000;
  });
  const rows = Object.entries(self).filter(([k]) => !/^\((idle|program|garbage)/.test(k) && (!filter || filter.test(k)));
  const js = rows.reduce((s, [, t]) => s + t, 0);
  console.log(`== ${label}: JS ${Math.round(js)} мс`);
  rows.sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, t]) => console.log(String(Math.round(t)).padStart(6), k));
}

await page.goto(`http://localhost:${port}/?seed=E2ESEED1`);
await page.getByTestId('menu-new').click();
await page.getByTestId('class-netrunner').click();
await page.getByTestId('start-run').click();
await page.getByTestId('map').waitFor();
await page.waitForTimeout(1000);
await prof('вход в бой', async () => {
  await page.locator('[data-testid="map-node"][data-state="available"][data-kind="combat"]').first().click();
  await page.locator('[data-testid="combat"][data-phase="player"]').waitFor();
  await page.waitForTimeout(500);
});
await prof('ход (3 карты + конец хода)', async () => {
  for (let i = 0; i < 3; i++) {
    const c = page.locator('[data-testid="hand-card"][data-playable="1"]').first();
    if (!(await c.count())) break;
    const uid = await c.getAttribute('data-uid');
    const tg = (await c.getAttribute('data-targeted')) === '1';
    await c.click();
    if (await page.locator(`[data-testid="hand-card"][data-uid="${uid}"]`).count()) {
      if (tg) await page.locator('[data-testid="enemy-hit"]:not([disabled])').first().click();
      else await c.click();
    }
    await page.waitForTimeout(400);
  }
  await page.getByTestId('end-turn').click();
  const yes = page.getByTestId('end-turn-yes');
  if (await yes.isVisible({ timeout: 800 }).catch(() => false)) await yes.click();
  await page.locator('[data-testid="combat"][data-phase="player"]').waitFor();
  await page.waitForTimeout(500);
});
await browser.close();
