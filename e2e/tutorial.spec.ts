import type { Locator, Page } from '@playwright/test';
import { test, expect, winCombat, collectRewards, TUTORIAL_KEY } from './fixtures';

// Эти тесты проверяют сам онбординг — профиль «новичка» без флага обучения
test.use({ tutorialDone: false });

const bubble = (page: Page) => page.getByTestId('tutorial-bubble');
const step = (page: Page, id: string) => page.locator(`[data-testid="tutorial"][data-step="${id}"]`);

async function next(page: Page, act: (t: Locator) => Promise<void>, id: string): Promise<void> {
  await expect(step(page, id)).toBeVisible();
  await act(page.getByTestId('tutorial-next'));
}

test('чистый профиль: приглашение в обучение, «Я уже умею играть» запоминается', async ({ page, act }) => {
  await page.goto('./');
  await expect(page.getByTestId('menu')).toBeVisible();
  const invite = page.getByTestId('tutorial-invite');
  await expect(invite).toBeVisible();
  await expect(invite).toContainText('Впервые в CyberHack?');
  await expect(page.getByTestId('invite-accept')).toBeVisible();
  await act(page.getByTestId('invite-decline'));
  await expect(invite).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), TUTORIAL_KEY)).toBe('skipped');
  await page.reload();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.waitForTimeout(600); // приглашение появляется с задержкой — убеждаемся, что его нет
  await expect(invite).toHaveCount(0);
});

test('обучение: от карты до конца первого боя и снова на карту', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('invite-accept'));
  await act(page.getByTestId('tutorial-setup-start'));

  // Карта
  await expect(page.getByTestId('map')).toBeVisible();
  await next(page, act, 'map-intro');
  await expect(step(page, 'map-node')).toBeVisible();
  await act(page.locator('[data-testid="map-node"][data-state="available"][data-kind="combat"]').first());

  // Бой: пояснения
  await expect(page.getByTestId('combat')).toHaveAttribute('data-phase', 'player');
  for (const id of ['player', 'class', 'enemy', 'intent', 'energy', 'hand']) await next(page, act, id);

  // «Пинг» во врага
  await expect(step(page, 'ping')).toBeVisible();
  const hpBefore = Number(await page.getByTestId('enemy').first().getAttribute('data-hp'));
  const ping = page.locator('[data-testid="hand-card"][data-def="nr_ping"][data-playable="1"]').first();
  await act(ping);
  await expect(ping).toHaveAttribute('aria-pressed', 'true');
  await act(page.locator('[data-testid="enemy-hit"]:not([disabled])').first());
  await expect.poll(async () => Number(await page.getByTestId('enemy').first().getAttribute('data-hp'))).toBeLessThan(hpBefore);

  // «Файрвол» — блок
  await expect(step(page, 'block')).toBeVisible();
  const wall = page.locator('[data-testid="hand-card"][data-def="nr_firewall"][data-playable="1"]').first();
  const wallUid = await wall.getAttribute('data-uid');
  await act(wall);
  await act(page.locator(`[data-testid="hand-card"][data-uid="${wallUid}"]`));
  await expect(page.locator(`[data-testid="hand-card"][data-uid="${wallUid}"]`)).toHaveCount(0);

  // Конец хода → разбор хода врага
  await expect(step(page, 'end-turn')).toBeVisible();
  await act(page.getByTestId('end-turn'));
  await expect(step(page, 'after-enemy')).toBeVisible();
  await expect(bubble(page)).toContainText('блок');
  await act(page.getByTestId('tutorial-next'));

  // Дальше сам: напоминание-плашка не мешает доиграть бой
  await expect(page.getByTestId('tutorial-mini')).toBeVisible();
  await winCombat(page, act);

  // Награды
  await expect(page.getByTestId('reward-screen')).toBeVisible();
  await next(page, act, 'reward-gold');
  await next(page, act, 'reward-card');
  // Прошивка выпадает не всегда: если выпала, обучение объясняет и её
  if (await step(page, 'reward-firmware').isVisible().catch(() => false)) await next(page, act, 'reward-firmware');
  await expect(page.getByTestId('tutorial')).toHaveCount(0); // дальше игрок сам, экран подсказывает строкой
  await collectRewards(page, act);
  if (await page.getByTestId('reward-screen').isVisible()) await act(page.getByTestId('reward-leave'));

  // Снова карта: типы узлов и финал
  await expect(page.getByTestId('map')).toBeVisible();
  await next(page, act, 'map-kinds');
  await next(page, act, 'difficulty');
  await expect(step(page, 'done')).toBeVisible();
  await expect(bubble(page)).toContainText('Готово!');
  expect(await page.evaluate((k) => localStorage.getItem(k), TUTORIAL_KEY)).toBe('done');
  await act(page.getByTestId('tutorial-continue'));
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  // Забег продолжается: можно идти дальше по карте
  await expect(page.locator('[data-testid="map-node"][data-state="available"]').first()).toBeVisible();
});

test('«Пропустить обучение» работает, флаг переживает перезагрузку', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('invite-accept'));
  await act(page.getByTestId('tutorial-setup-start'));
  await expect(step(page, 'map-intro')).toBeVisible();
  await act(page.getByTestId('tutorial-skip'));
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  // Забег остаётся, подсказок больше нет
  await expect(page.getByTestId('map')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), TUTORIAL_KEY)).toBe('skipped');

  await page.reload();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('tutorial-invite')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), TUTORIAL_KEY)).toBe('skipped');
});

test('Esc пропускает обучение', async ({ page, act }, testInfo) => {
  test.skip(!!testInfo.project.use.hasTouch, 'клавиатура — только десктоп');
  await page.goto('./');
  await act(page.getByTestId('invite-accept'));
  await act(page.getByTestId('tutorial-setup-start'));
  await expect(step(page, 'map-intro')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(step(page, 'map-node')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
});

test('«Как играть» открывается из меню и ведёт в обучение', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('invite-decline'));
  await act(page.getByTestId('menu-howto'));
  const howto = page.getByTestId('howto');
  await expect(howto).toBeVisible();
  for (const title of ['Цель игры', 'Как устроен бой', 'Типы карт', 'Карта сети', 'Термины', 'Классы', 'Сложность (Ascension)']) {
    await expect(howto.getByRole('heading', { name: title })).toBeAttached();
  }
  // Термины берутся из движка
  await expect(howto.locator('.howto-term dt', { hasText: 'Вирус' })).toBeAttached();
  // Нет горизонтальной прокрутки
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await act(page.getByTestId('howto-back'));
  await expect(page.getByTestId('menu')).toBeVisible();
  await act(page.getByTestId('menu-howto'));
  await act(page.getByTestId('howto-tutorial'));
  await act(page.getByTestId('tutorial-setup-start'));
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(step(page, 'map-intro')).toBeVisible();
});
