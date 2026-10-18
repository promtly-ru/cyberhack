import { test, expect, startRun, enterCombat, playOneCard, winCombat, savedActions } from './fixtures';

test('новый взлом: класс → карта → бой → победа → награда → карта', async ({ page, act }) => {
  await startRun(page, act);
  await enterCombat(page, act);

  const hand = page.locator('[data-testid="hand-card"]');
  await expect(hand).not.toHaveCount(0);
  const hpBefore = await page.locator('[data-testid="enemy"]').evaluateAll((els) => els.reduce((s, e) => s + Number(e.getAttribute('data-hp')), 0));

  // Первая карта — атака в цель: HP врагов уменьшается
  expect(await playOneCard(page, act)).toBe(true);

  const turns = await winCombat(page, act);
  expect(turns).toBeGreaterThan(0);
  expect(hpBefore).toBeGreaterThan(0);

  // Награды: забрать кредиты и, если есть, карту
  const reward = page.getByTestId('reward-screen');
  await expect(reward).toBeVisible();
  const gold = reward.locator('[data-testid="reward-item"][data-kind="gold"]');
  if (await gold.count()) {
    const n = await page.locator('[data-testid="reward-item"]').count();
    await act(gold.first());
    await expect(page.locator('[data-testid="reward-item"]')).toHaveCount(n - 1);
  }
  const cardReward = reward.locator('[data-testid="reward-item"][data-kind="card"]');
  if (await cardReward.count()) {
    await act(cardReward.first());
    await expect(page.getByTestId('pick-screen')).toBeVisible();
    await act(page.getByTestId('pick-card').first());
    await expect(page.getByTestId('reward-screen').or(page.getByTestId('map'))).toBeVisible();
  }
  if (await page.getByTestId('reward-screen').isVisible()) await act(page.getByTestId('reward-leave'));

  // Снова карта: пройденный узел отмечен, следующие доступны
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(page.locator('[data-testid="map-node"][data-state="current"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="map-node"][data-state="available"]').first()).toBeVisible();
});

test('сохранение: «Продолжить» после перезагрузки страницы', async ({ page, act }) => {
  await startRun(page, act);
  await enterCombat(page, act);
  expect(await playOneCard(page, act)).toBe(true);

  const hpState = () => page.locator('[data-testid="enemy"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-hp')).join(','));
  const handState = () => page.locator('[data-testid="hand-card"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-uid')).join(','));
  const before = { hp: await hpState(), hand: await handState() };

  // Сохранение идёт с задержкой — ждём, пока в журнале будут выбор узла и карта
  await expect.poll(() => savedActions(page)).toBeGreaterThanOrEqual(2);

  await page.reload();
  await expect(page.getByTestId('menu')).toBeVisible();
  const cont = page.getByTestId('menu-continue');
  await expect(cont).toBeEnabled();
  await expect(cont).toContainText('Нетраннер');
  await act(cont);

  await expect(page.getByTestId('combat')).toBeVisible();
  expect(await hpState()).toBe(before.hp);
  expect(await handState()).toBe(before.hand);
  // Бой продолжается
  await expect(page.getByTestId('end-turn')).toBeEnabled();
});
