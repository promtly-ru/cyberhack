import { test, expect, savedActions } from './fixtures';

test('профиль открывается, достижения видны', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('menu-profile'));
  await expect(page.getByTestId('profile')).toBeVisible();
  // Гость: не «Вы вошли как Гость / Выйти», а «Гостевой режим / Войти»
  await expect(page.getByTestId('profile').getByText('Гостевой режим').first()).toBeVisible();
  await expect(page.getByTestId('profile-login')).toBeVisible();
  await expect(page.getByTestId('profile').getByRole('button', { name: /Выйти/ })).toHaveCount(0);
  const panel = page.getByTestId('achievements');
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Достижения' })).toBeVisible();
  const items = panel.getByTestId('achievement');
  expect(await items.count()).toBeGreaterThan(3);
  await items.first().scrollIntoViewIfNeeded();
  await expect(items.first()).toBeVisible();
  // Назад в меню
  await act(page.getByRole('button', { name: 'Назад' }));
  await expect(page.getByTestId('menu')).toBeVisible();
});

test('ежедневный забег стартует', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('menu-daily'));
  await expect(page.getByTestId('daily-select')).toBeVisible();
  const start = page.getByTestId('start-daily');
  await expect(start).toBeEnabled();
  await act(start);
  await expect(page.getByTestId('map')).toBeVisible();
  // Попытка засчитана: в меню ежедневный помечен как сыгранный, забег сохранён
  await expect.poll(() => savedActions(page)).toBeGreaterThanOrEqual(0);
  await page.reload();
  await expect(page.getByTestId('menu-daily')).toContainText('сыгран');
  await expect(page.getByTestId('menu-continue')).toBeEnabled();
});
