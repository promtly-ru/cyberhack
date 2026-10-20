import { test, expect, savedActions } from './fixtures';

test('профиль открывается, достижения видны', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('menu-profile'));
  await expect(page.getByTestId('profile')).toBeVisible();
  // Гость: заголовок «Гость» и кнопка «Войти», без «Выйти»
  await expect(page.getByTestId('profile').getByRole('heading', { name: 'Гость' }).first()).toBeVisible();
  await expect(page.getByTestId('account-login')).toBeVisible();
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

test('еженедельный вызов стартует, попытка списывается', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('menu-weekly'));
  await expect(page.getByTestId('weekly-select')).toBeVisible();
  await expect(page.getByTestId('weekly-attempts')).toContainText('3 из 3');
  await expect(page.getByTestId('weekly-board')).toBeVisible();
  await expect(page.getByTestId('weekly-rule')).toBeVisible();
  await expect(page.getByTestId('weekly-timer')).toContainText('до сброса');
  const start = page.getByTestId('start-weekly');
  await expect(start).toBeEnabled();
  await act(start);
  await expect(page.getByTestId('map')).toBeVisible();
  // Попытка засчитана: в меню видно 2 из 3, забег сохранён
  await expect.poll(() => savedActions(page)).toBeGreaterThanOrEqual(0);
  await page.reload();
  await expect(page.getByTestId('menu-weekly')).toContainText('· 2/3');
  await expect(page.getByTestId('menu-continue')).toBeEnabled();
});

test('рейтинг недели: вкладки переключаются', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('menu-weekly'));
  await act(page.getByTestId('wb-tab-prev'));
  await expect(page.getByTestId('weekly-board')).toContainText('неделя завершена');
  await act(page.getByTestId('wb-tab-this'));
  await expect(page.getByTestId('weekly-timer')).toBeVisible();
});
