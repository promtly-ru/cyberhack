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

test('обучение: короткий акт, первый бой с подсказками и награды', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('invite-accept'));
  await act(page.getByTestId('tutorial-setup-start'));

  // Карта: путь без развилок — доступен один узел
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(page.locator('[data-testid="map-node"][data-state="available"]')).toHaveCount(1);
  await next(page, act, 'map-intro');
  await next(page, act, 'map-kinds');
  await expect(step(page, 'map-node')).toBeVisible();
  await act(page.locator('[data-testid="map-node"][data-state="available"]').first());

  // Бой: пояснения
  await expect(page.getByTestId('combat')).toHaveAttribute('data-phase', 'player');
  for (const id of ['player', 'enemy', 'intent', 'energy', 'hand']) await next(page, act, id);

  // Атака — любой картой с целью (карты зависят от сида)
  await expect(step(page, 'attack')).toBeVisible();
  const attack = page.locator('[data-testid="hand-card"][data-targeted="1"][data-playable="1"]').first();
  if (await attack.count()) {
    await act(attack);
    await act(page.locator('[data-testid="enemy-hit"]:not([disabled])').first());
  } else await act(page.getByTestId('tutorial-next'));

  // Блок
  await expect(step(page, 'block')).toBeVisible();
  const wall = page.locator('[data-testid="hand-card"][data-block="1"][data-playable="1"]').first();
  if (await wall.count()) {
    const uid = await wall.getAttribute('data-uid');
    await act(wall);
    await act(page.locator(`[data-testid="hand-card"][data-uid="${uid}"]`));
  } else await act(page.getByTestId('tutorial-next'));

  // Конец хода → разбор хода врага → статусы
  await expect(step(page, 'end-turn')).toBeVisible();
  await act(page.getByTestId('end-turn'));
  await expect(step(page, 'after-enemy')).toBeVisible();
  await expect(bubble(page)).toContainText('блок');
  await next(page, act, 'after-enemy');
  await next(page, act, 'statuses');

  // Дальше сам: плашка не мешает доиграть бой
  await expect(page.getByTestId('tutorial-mini')).toBeVisible();
  await winCombat(page, act);

  // Награды: кредиты, карта, гарантированный расходник
  await expect(page.getByTestId('reward-screen')).toBeVisible();
  await next(page, act, 'reward-gold');
  await next(page, act, 'reward-card');
  await next(page, act, 'reward-potion');
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await collectRewards(page, act);
  if (await page.getByTestId('reward-screen').isVisible()) await act(page.getByTestId('reward-leave'));

  // Снова карта: как пользоваться расходником, затем событие
  await expect(page.getByTestId('map')).toBeVisible();
  await next(page, act, 'potion-use');
  await expect(step(page, 'map-event')).toBeVisible();
  await act(page.locator('[data-testid="map-node"][data-state="available"]').first());
  await next(page, act, 'event-intro');
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
  await expect(step(page, 'map-kinds')).toBeVisible();
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
