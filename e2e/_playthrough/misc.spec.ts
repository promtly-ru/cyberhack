import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Bot, profileInit, RESULTS, type Cfg } from './bot';

const cfg: Cfg = { name: 'misc', tutorial: false, cls: 'netrunner', diff: 'normal', asc: 0, daily: false, seed: 'PTMISC1', rot: 0 };

test('misc', async ({ page }, info) => {
  const fmt = info.project.name;
  const bot = new Bot(page, cfg, info);
  const facts: string[] = [];
  const F = (s: string) => {
    facts.push(s);
    bot.note(s);
  };
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const noProfile = process.env.PT_FRESH === '1';
  await page.addInitScript(
    ({ prof, fresh }) => {
      try {
        if (!fresh && !localStorage.getItem('cyberhack:guest:profile')) localStorage.setItem('cyberhack:guest:profile', prof);
        if (!localStorage.getItem('cyberhack:tutorial')) localStorage.setItem('cyberhack:tutorial', 'skipped');
      } catch {
        /* */
      }
    },
    { prof: profileInit(), fresh: noProfile },
  );
  const T = (id: string) => page.getByTestId(id);
  const sc = async (n: string) => bot.shot(`${fmt}-misc-${n}`, true);
  const hscroll = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  // ---- меню, настройки, howto, профиль ----
  await page.goto('./?seed=PTMISC1');
  await T('menu').waitFor();
  await page.waitForTimeout(800);
  await sc('menu');
  await bot.checkLayout('menu');
  F(`menu-continue disabled on fresh: ${await T('menu-continue').isDisabled()}`);

  await bot.tap(T('menu-settings'), 'settings');
  await page.waitForTimeout(400);
  await sc('settings');
  await bot.checkLayout('settings');
  const settingsText = (await page.locator('.settings').innerText().catch(() => '')).replace(/\s+/g, ' ');
  F(`settings text: ${settingsText}`);
  // переключаем контролы
  const chk = page.locator('.settings input[type=checkbox]');
  for (let i = 0; i < (await chk.count()); i++) await chk.nth(i).click({ force: true }).catch(() => {});
  const seg = page.locator('.settings [role=radio], .settings .seg button');
  F(`settings segment buttons: ${await seg.count()}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  F(`settings closes on Esc: ${(await page.locator('.settings').count()) === 0}`);
  if (await page.locator('.settings').count()) {
    const close = page.locator('.modal [aria-label*="акр"], .modal .icon-btn, [aria-label="Закрыть"]').first();
    await bot.tap(close, 'settings-close');
  }
  const stored = await page.evaluate(() => localStorage.getItem('cyberhack.settings.v1'));
  await page.reload();
  await T('menu').waitFor();
  F(`settings persisted after reload: ${stored === (await page.evaluate(() => localStorage.getItem('cyberhack.settings.v1')))} -> ${stored}`);

  await bot.tap(T('menu-howto'), 'howto');
  await T('howto').waitFor();
  await page.waitForTimeout(500);
  await sc('howto');
  F(`howto hscroll: ${await hscroll()}`);
  await bot.checkLayout('howto');
  await page.evaluate(() => (document.querySelector('[data-testid=howto]') as HTMLElement)?.scrollTo?.(0, 99999));
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(300);
  await sc('howto-bottom');
  await bot.tap(T('howto-back'), 'howto-back');
  await T('menu').waitFor();

  await bot.tap(T('menu-profile'), 'profile');
  await T('profile').waitFor();
  await page.waitForTimeout(500);
  await sc('profile');
  await bot.checkLayout('profile');
  F(`profile hscroll: ${await hscroll()}`);
  await page.goBack().catch(() => {});
  await page.waitForTimeout(400);
  F(`after browser Back from profile -> menu visible: ${await T('menu').isVisible().catch(() => false)} url=${page.url()}`);
  if (!(await T('menu').isVisible().catch(() => false))) {
    await page.goto('./?seed=PTMISC1');
    await T('menu').waitFor();
  }

  // ---- класс-селект ----
  await bot.tap(T('menu-new'), 'menu-new');
  await T('class-select').waitFor();
  await page.waitForTimeout(500);
  await sc('class-select');
  await bot.checkLayout('class-select');
  F(`class-select hscroll: ${await hscroll()}`);
  await bot.tap(T('class-netrunner'), 'class');
  await bot.tap(T('start-run'), 'start-run');
  await T('map').waitFor();
  await page.waitForTimeout(500);
  await sc('map');
  F(`map hscroll: ${await hscroll()}`);
  await bot.checkLayout('map');

  // Назад в браузере посреди забега
  await page.goBack().catch(() => {});
  await page.waitForTimeout(500);
  F(`Back button during run: url=${page.url()} map visible=${await T('map').isVisible().catch(() => false)} menu visible=${await T('menu').isVisible().catch(() => false)}`);
  if (!(await T('map').isVisible().catch(() => false))) {
    // восстановим
    await page.goto('./?seed=PTMISC1');
    await T('menu').waitFor();
    await bot.tap(T('menu-continue'), 'continue');
    await T('map').waitFor();
  }

  // Перезагрузка на карте
  await page.reload();
  await T('menu').waitFor();
  F(`menu-continue after reload on map: enabled=${await T('menu-continue').isEnabled()}`);
  await sc('menu-with-continue');
  await bot.tap(T('menu-continue'), 'continue');
  await T('map').waitFor();

  // ---- бой ----
  const node = page.locator('[data-testid="map-node"][data-state="available"][data-kind="combat"]').first();
  await bot.tap((await node.locator('[data-testid="map-node-hit"]').count()) ? node.locator('[data-testid="map-node-hit"]') : node, 'node');
  await T('combat').waitFor();
  await page.waitForTimeout(1200);
  await sc('combat-start');
  await bot.checkLayout('combat');
  F(`combat hscroll: ${await hscroll()}`);
  const snap = () =>
    page.evaluate(() => ({
      hand: Array.from(document.querySelectorAll('[data-testid="hand-card"]')).map((e) => e.getAttribute('data-def')).sort().join(','),
      enemy: Array.from(document.querySelectorAll('[data-testid="enemy"]')).map((e) => e.getAttribute('data-hp')).join(','),
      energy: (document.querySelector('[data-testid="energy"]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') ?? '',
      hp: (document.querySelector('[data-testid="stat-hp"]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') ?? '',
      intent: (document.querySelector('[data-testid="intent"]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') ?? '',
    }));
  // сыграть пару карт
  for (let i = 0; i < 2; i++) {
    const pl = page.locator('[data-testid="hand-card"][data-playable="1"]');
    if (await pl.count()) await bot.playCard(pl.first());
  }
  await page.waitForTimeout(500);
  const before = await snap();
  await sc('combat-after-cards');

  // смена размера окна посреди боя
  const orig = page.viewportSize()!;
  const alt = orig.width > 600 ? { width: 360, height: 780 } : { width: 1440, height: 900 };
  await page.setViewportSize(alt);
  await page.waitForTimeout(700);
  await sc(`combat-resized-${alt.width}`);
  await bot.checkLayout('combat-resized');
  const mid = await snap();
  F(`resize ${orig.width}->${alt.width}: state kept=${JSON.stringify(before) === JSON.stringify(mid)} hscroll=${await hscroll()}`);
  const pl2 = page.locator('[data-testid="hand-card"][data-playable="1"]');
  if (await pl2.count()) F(`playable after resize: card play ok=${await bot.playCard(pl2.first())}`);
  await page.setViewportSize({ width: 700, height: 500 });
  await page.waitForTimeout(600);
  await sc('combat-resized-700x500');
  await bot.checkLayout('combat-700x500');
  F(`landscape small 700x500: hscroll=${await hscroll()} end-turn visible=${await T('end-turn').isVisible()} hand visible=${await T('hand').isVisible()}`);
  await page.setViewportSize(orig);
  await page.waitForTimeout(600);
  const after = await snap();
  F(`resize back: state kept=${JSON.stringify(after.enemy) === JSON.stringify(mid.enemy)}`);

  // перезагрузка в бою
  const preReload = await snap();
  await page.reload();
  await T('menu').waitFor();
  const contEnabled = await T('menu-continue').isEnabled();
  F(`reload mid-combat: continue enabled=${contEnabled}`);
  await bot.tap(T('menu-continue'), 'continue');
  const back = await Promise.race([
    T('combat').waitFor({ timeout: 8000 }).then(() => 'combat'),
    T('map').waitFor({ timeout: 8000 }).then(() => 'map'),
  ]).catch(() => 'none');
  F(`after continue: screen=${back}`);
  await page.waitForTimeout(1000);
  const postReload = await snap();
  await sc('combat-after-reload');
  F(`state before reload ${JSON.stringify(preReload)}`);
  F(`state after reload  ${JSON.stringify(postReload)}`);
  F(`combat state identical after reload: ${JSON.stringify(preReload) === JSON.stringify(postReload)}`);

  // горячие клавиши: E = конец хода
  if (back === 'combat') {
    const ph0 = await T('combat').getAttribute('data-phase');
    await page.keyboard.press('e');
    await page.waitForTimeout(500);
    F(`hotkey E: phase ${ph0} -> ${await T('combat').getAttribute('data-phase').catch(() => 'gone')}`);
    // зелья/колода/сброс
    for (const k of ['pile-draw', 'pile-discard']) {
      const el = T(k);
      if (await el.count()) {
        await bot.tap(el, k);
        await page.waitForTimeout(400);
        await sc(k);
        await bot.checkLayout(k);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        F(`${k} modal closes on Esc: ${(await page.locator('.modal, [role=dialog]').count()) === 0}`);
      }
    }
  }

  // настройки в забеге
  await page.waitForTimeout(1500);
  const gear = page.getByRole('button', { name: 'Настройки' });
  if (await gear.count()) {
    await bot.tap(gear.first(), 'gear');
    await page.waitForTimeout(400);
    await sc('settings-in-run');
    await bot.checkLayout('settings-in-run');
    F(`in-run settings: ${(await page.locator('.settings').innerText().catch(() => '')).replace(/\s+/g, ' ')}`);
    const surrender = page.getByRole('button', { name: 'Сдаться' });
    F(`surrender button present: ${await surrender.count()}`);
    await page.keyboard.press('Escape');
  } else F('gear (settings) button not found in run');

  // Сдаться
  await page.waitForTimeout(500);
  if (await gear.count()) {
    await bot.tap(gear.first(), 'gear');
    await bot.tap(page.getByRole('button', { name: 'Сдаться' }), 'surrender');
    await bot.tap(page.getByRole('button', { name: 'Точно сдаться?' }), 'surrender-confirm');
    await page.waitForTimeout(1200);
    const scr = await bot.screenOf();
    F(`after surrender: screen=${scr}`);
    await sc('after-surrender');
    F(`continue after surrender: ${await T('menu-continue').isEnabled().catch(() => 'n/a')}`);
  }

  fs.writeFileSync(path.join(RESULTS, `misc-${fmt}.json`), JSON.stringify({ facts, issues: bot.issues, consoleErrors: bot.consoleErrors }, null, 1));
});
