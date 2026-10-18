import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Карта в руке, у которой есть термины (не «Пинг»: «Нанеси N урона» терминов не содержит). */
function cardWithTerms(page: Page) {
  return page.locator('[data-testid="hand-card"]:not([data-def$="_ping"])').first();
}

test('бой: подписи энергии, стопок и намерений врагов видны', async ({ page }) => {
  await page.goto('./?dev=combat');
  await expect(page.getByTestId('combat')).toHaveAttribute('data-phase', 'player');

  await expect(page.getByTestId('energy')).toBeVisible();
  await expect(page.getByTestId('energy').getByText('Энергия', { exact: true })).toBeVisible();
  await expect(page.getByTestId('energy')).toHaveAttribute('aria-label', /^Энергия \d+ из \d+$/);

  for (const [kind, label] of [
    ['draw', 'Колода'],
    ['discard', 'Сброс'],
    ['exhaust', 'Сожжено'],
  ] as const) {
    const pile = page.getByTestId(`pile-${kind}`);
    await expect(pile.getByText(label, { exact: true })).toBeVisible();
    await expect(pile).toHaveAttribute('aria-label', new RegExp(`^${label}: \\d+ карт$`));
  }

  const intents = page.getByTestId('intent');
  await expect(intents.first()).toBeVisible();
  const n = await intents.count();
  for (let i = 0; i < n; i++) {
    await expect(intents.nth(i).locator('.intent__label')).toBeVisible();
    await expect(intents.nth(i).locator('.intent__label')).toHaveText(/^(Атака|Защита|Усиление|Ослабит тебя|Атака \+ защита|Атака \+ ослабит|Неизвестно)$/);
    await expect(intents.nth(i)).toHaveAttribute('aria-label', /^Намерение врага: /);
  }
});

test('бой: подсказка над рукой ведёт игрока по шагам', async ({ page, act }) => {
  await page.goto('./?dev=combat');
  await expect(page.getByTestId('combat')).toHaveAttribute('data-phase', 'player');
  const hint = page.getByTestId('hand-hint');
  await expect(hint).toHaveAttribute('data-hint', 'idle');
  await expect(hint).toContainText('Выбери карту');

  // Атака: выбрать карту → «Теперь нажми на врага» → нажать на врага
  const attack = page.locator('[data-testid="hand-card"][data-targeted="1"][data-playable="1"]').first();
  const uid = await attack.getAttribute('data-uid');
  await act(attack);
  await expect(attack).toHaveAttribute('aria-pressed', 'true');
  await expect(hint).toHaveAttribute('data-hint', 'target');
  await expect(hint).toHaveText('Теперь нажми на врага');
  await act(page.locator('[data-testid="enemy-hit"]:not([disabled])').first());
  await expect(page.locator(`[data-testid="hand-card"][data-uid="${uid}"]`)).toHaveCount(0);
  await expect(hint).toHaveAttribute('data-hint', /idle|end/);

  // Карта без цели: «Нажми ещё раз, чтобы сыграть»
  const skill = page.locator('[data-testid="hand-card"][data-targeted="0"][data-playable="1"]').first();
  if ((await skill.count()) > 0) {
    await act(skill);
    await expect(hint).toHaveAttribute('data-hint', 'confirm');
    await expect(hint).toContainText('ещё раз');
  }
});

test('бой: превью карты показывает термины', async ({ page }, testInfo) => {
  await page.goto('./?dev=combat');
  await expect(page.getByTestId('combat')).toHaveAttribute('data-phase', 'player');
  const card = cardWithTerms(page);
  await expect(card).toBeVisible();
  const preview = page.getByTestId('card-preview');

  if (testInfo.project.use.hasTouch) {
    const box = (await card.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId('card-terms')).toBeVisible();
    await expect(preview.getByTestId('card-terms')).toContainText('Термины');
    await expect(preview.locator('.card-terms__item dd').first()).not.toBeEmpty();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(preview).toHaveCount(0);
  } else {
    // Мышь: правый клик открывает превью, любой клик закрывает и не выбирает карту
    await card.click({ button: 'right' });
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId('card-terms')).toContainText('Термины');
    await expect(preview.locator('.card-terms__item dd').first()).not.toBeEmpty();
    await page.mouse.click(5, 300);
    await expect(preview).toHaveCount(0);
  }
  await expect(card).toHaveAttribute('aria-pressed', 'false');
});

test('верхняя панель: подписи на широком экране, подсказки по тапу на телефоне', async ({ page, act }, testInfo) => {
  await page.goto('./?dev=combat');
  const hp = page.getByTestId('stat-hp');
  await expect(hp).toBeVisible();
  if (testInfo.project.use.hasTouch) {
    await act(hp);
    await expect(page.getByRole('tooltip')).toContainText('Здоровье');
  } else {
    await expect(hp.getByText('Здоровье', { exact: true })).toBeVisible();
    await expect(page.getByTestId('stat-gold').getByText('Кредиты', { exact: true })).toBeVisible();
    await expect(page.getByTestId('stat-floor').getByText('Этаж', { exact: true })).toBeVisible();
  }
});

test('экраны забега: строка «что здесь сделать» и термины при выборе карты', async ({ page }) => {
  for (const dev of ['map', 'reward', 'card_pick', 'shop', 'rest', 'event']) {
    await page.goto(`./?dev=${dev}`);
    await expect(page.getByTestId('screen-hint'), dev).toBeVisible();
  }
  await page.goto('./?dev=card_pick');
  await expect(page.getByText('Возьми одну карту в колоду или пропусти', { exact: false })).toBeVisible();
  // Ключевые слова в тексте карт — с подсказкой; их описания — под картами
  await expect(page.locator('[data-testid="pick-card"] .kw[data-tip-title]').first()).toBeVisible();
  await expect(page.getByTestId('card-terms').first()).toBeVisible();
});
