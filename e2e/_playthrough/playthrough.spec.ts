import { test } from '@playwright/test';
import { Bot, profileInit, type Cfg } from './bot';

const D: Cfg['diff'][] = ['easy', 'normal', 'hard'];
let rot = 0;
const mk = (name: string, cls: string, diff: Cfg['diff'], o: Partial<Cfg> = {}): Cfg => ({
  name, cls, diff, tutorial: false, asc: 0, daily: false, seed: `PT${name.replace(/\W/g, '').slice(0, 10)}`, rot: rot++, ...o,
});

const MATRIX: { fmt: 'desktop' | 'mobile'; cfg: Cfg }[] = [];
for (const fmt of ['desktop', 'mobile'] as const) {
  MATRIX.push({ fmt, cfg: mk('tut-netrunner-easy', 'netrunner', 'easy', { tutorial: true }) });
  for (const [cls, ds] of [
    ['netrunner', D],
    ['phreaker', ['easy', 'hard'] as Cfg['diff'][]],
    ['ghost', ['easy', 'normal'] as Cfg['diff'][]],
    ['samurai', ['easy'] as Cfg['diff'][]],
    ['engineer', ['easy'] as Cfg['diff'][]],
    ['biohacker', ['easy'] as Cfg['diff'][]],
  ] as [string, Cfg['diff'][]][]) {
    for (const d of ds) MATRIX.push({ fmt, cfg: mk(`${cls}-${d}`, cls, d) });
  }
  MATRIX.push({ fmt, cfg: mk('daily', 'netrunner', 'normal', { daily: true }) });
  MATRIX.push({ fmt, cfg: mk('asc3-netrunner', 'netrunner', 'easy', { asc: 3 }) });
}

for (const { fmt, cfg } of MATRIX) {
  test(`${fmt} ${cfg.name}`, async ({ page }, info) => {
    test.skip(info.project.name !== fmt, 'другой формат');
    if (process.env.PT_ONLY && !`${fmt} ${cfg.name}`.includes(process.env.PT_ONLY)) test.skip(true, 'filter');
    const bot = new Bot(page, cfg, info);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.addInitScript((prof) => {
      try {
        if (!localStorage.getItem('cyberhack:guest:profile')) localStorage.setItem('cyberhack:guest:profile', prof);
        if (!localStorage.getItem('cyberhack.settings.v1')) localStorage.setItem('cyberhack.settings.v1', JSON.stringify({ volume: 0.6, muted: true, animSpeed: 2.5, motion: 'reduced', scanlines: true }));
      } catch {
        /* */
      }
    }, profileInit());
    try {
      await page.goto(`./?seed=${cfg.seed}`);
      await page.getByTestId('menu').waitFor();
      await bot.onNewScreen('menu');
      if (cfg.tutorial) {
        await page.getByTestId('invite-accept').waitFor({ timeout: 10000 }); await bot.tap(page.getByTestId('invite-accept'), 'invite-accept'); await page.getByTestId('tutorial-setup-start').waitFor({ timeout: 8000 }).catch(() => bot.note('setup-start not shown'));
        await page.waitForTimeout(300);
        await bot.shot(`${fmt}-tutorial-setup`);
        await bot.tap(page.getByTestId('tutorial-setup-start'), 'tutorial-setup-start');
      } else {
        const dec = page.getByTestId('invite-decline');
        await dec.waitFor({ timeout: 3000 }).then(() => bot.tap(dec, 'invite-decline')).catch(() => bot.note('no invite shown'));
        await bot.tap(page.getByTestId(cfg.daily ? 'menu-weekly' : 'menu-new'), 'menu-new');
        await page.getByTestId('class-select').waitFor();
        await bot.onNewScreen('class-select');
        if (!cfg.daily) {
          await bot.tap(page.getByTestId(`class-${cfg.cls}`), 'class');
          await bot.tap(page.getByRole('radiogroup', { name: 'Режим', exact: true }).getByRole('radio').nth(D.indexOf(cfg.diff)), 'diff');
          if (cfg.asc) await bot.tap(page.getByRole('radio', { name: `Сложность ${cfg.asc}`, exact: true }), 'asc');
          await bot.shot(`${fmt}-class-select-configured`);
          await bot.tap(page.getByTestId('start-run'), 'start-run');
        } else {
          await bot.shot(`${fmt}-weekly-select`);
          await bot.tap(page.getByTestId('start-weekly'), 'start-weekly');
        }
      }
      await page.waitForTimeout(500);
      await bot.playRun();
    } catch (e) {
      bot.issue('баг', `исключение драйвера: ${String((e as Error).message).split('\n')[0]}`);
      bot.outcome = `driver-exception act${bot.maxAct} floor${bot.maxFloor}`;
      await bot.shot(`${fmt}-${cfg.name}-driver-exc`, true);
    } finally {
      bot.save();
    }
  });
}
