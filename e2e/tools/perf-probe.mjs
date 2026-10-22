// Замер лагов: FPS, длинные кадры, long tasks, layout/style на типичных сценариях.
// Запуск: node e2e/tools/perf-probe.mjs [throttle=4] [desktop|mobile] [lite]
// Нужен preview: npx vite preview --port 4173 (из apps/web).
import { chromium } from '@playwright/test';

const throttle = Number(process.argv[2] ?? 4);
const mobile = process.argv[3] === 'mobile';
const lite = process.argv[4] === 'lite';
const base = process.env.BASE_URL ?? 'http://localhost:4173/';

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' });
const ctx = await browser.newContext({
  viewport: mobile ? { width: 360, height: 780 } : { width: 1440, height: 900 },
  isMobile: mobile,
  hasTouch: mobile,
  deviceScaleFactor: mobile ? 2 : 1,
  serviceWorkers: 'block',
  reducedMotion: 'no-preference',
});
await ctx.addInitScript((lite) => {
  try {
    localStorage.setItem('cyberhack:tutorial', 'done');
    localStorage.setItem('cyberhack:hints', '["*"]');
    if (lite) localStorage.setItem('cyberhack.perf.v1', '"lite"');
  } catch {
    /* хранилище недоступно */
  }
  // Счётчики кадров и long tasks живут всю сессию, сценарии читают дельты
  const w = window;
  w.__perf = { frames: [], long: [] };
  let last = performance.now();
  const tick = (t) => {
    w.__perf.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__perf.long.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* нет поддержки */
  }
}, lite);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

const tap = async (loc) => (mobile ? loc.tap() : loc.click());
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const results = [];

async function measure(name, fn) {
  await page.evaluate(() => {
    window.__perf.frames = [];
    window.__perf.long = [];
  });
  const m0 = await metrics();
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  const m1 = await metrics();
  const { frames, long } = await page.evaluate(() => window.__perf);
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((s, f) => s + f, 0);
  results.push({
    scene: name,
    fps: frames.length ? Math.round((frames.length / total) * 1000) : 0,
    p95ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    jank50: frames.filter((f) => f > 50).length,
    longTasks: long.length,
    longMax: Math.round(Math.max(0, ...long)),
    layouts: m1.LayoutCount - m0.LayoutCount,
    styles: m1.RecalcStyleCount - m0.RecalcStyleCount,
    scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
    layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
    styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
    wallMs: ms,
  });
}
const idle = (ms) => page.waitForTimeout(ms);

await page.goto(`${base}?seed=E2ESEED1`);
await page.getByTestId('menu').waitFor();
await measure('menu idle 3s', () => idle(3000));
await tap(page.getByTestId('menu-new'));
await page.getByTestId('class-select').waitFor();
await measure('class idle 3s', () => idle(3000));
await tap(page.getByTestId('class-netrunner'));
await tap(page.getByTestId('start-run'));
await page.getByTestId('map').waitFor();
await measure('map idle 3s', () => idle(3000));
await measure('map scroll', async () => {
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, i % 2 ? -400 : 400);
    await idle(120);
  }
});
await measure('map → combat', async () => {
  await tap(page.locator('[data-testid="map-node"][data-state="available"][data-kind="combat"]').first());
  await page.getByTestId('combat').waitFor();
  await page.locator('[data-testid="combat"][data-phase="player"]').waitFor();
});
await measure('combat idle 3s', () => idle(3000));
if (!mobile) {
  await measure('hand hover', async () => {
    const cards = page.locator('[data-testid="hand-card"]');
    const n = await cards.count();
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < n; i++) {
        await cards.nth(i).hover();
        await idle(80);
      }
  });
}
await measure('combat 2 turns', async () => {
  const combat = page.getByTestId('combat');
  for (let turn = 0; turn < 2; turn++) {
    await page.locator('[data-testid="combat"][data-phase="player"], [data-testid="reward-screen"]').first().waitFor();
    if (await page.getByTestId('reward-screen').isVisible()) return;
    for (let i = 0; i < 6; i++) {
      if ((await combat.getAttribute('data-phase')) !== 'player') break;
      const playable = page.locator('[data-testid="hand-card"][data-playable="1"]');
      if (!(await playable.count())) break;
      const card = playable.first();
      const uid = await card.getAttribute('data-uid');
      const targeted = (await card.getAttribute('data-targeted')) === '1';
      await tap(card);
      if (!(await page.locator(`[data-testid="hand-card"][data-uid="${uid}"]`).count())) continue;
      if (targeted) await tap(page.locator('[data-testid="enemy-hit"]:not([disabled])').first());
      else await tap(card);
      await page.locator(`[data-testid="hand-card"][data-uid="${uid}"]`).waitFor({ state: 'detached' });
    }
    if ((await combat.getAttribute('data-phase')) === 'player') {
      await tap(page.getByTestId('end-turn'));
      const yes = page.getByTestId('end-turn-yes');
      if (await yes.isVisible({ timeout: 800 }).catch(() => false)) await tap(yes);
    }
  }
  await idle(1500);
});
const settings = page.getByRole('button', { name: /настройк/i }).first();
if (await settings.count()) {
  await measure('settings modal', async () => {
    await tap(settings);
    await idle(1200);
    await page.keyboard.press('Escape');
    await idle(600);
  });
}

console.log(`throttle ${throttle}x, ${mobile ? 'mobile 360' : 'desktop 1440'}${lite ? ', lite' : ''}`);
console.table(results);
await browser.close();
