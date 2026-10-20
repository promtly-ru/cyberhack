import type { Locator, Page } from '@playwright/test';
import { test, expect, SEED } from './fixtures';

type Act = (target: Locator) => Promise<void>;

/** Обучение и одноразовые подсказки не мешают сценарию аккаунтов. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cyberhack:tutorial', 'skipped');
      localStorage.setItem('cyberhack:hints', '["*"]');
    } catch {
      /* ignore */
    }
  });
});

async function openProfileFromChip(page: Page, act: Act): Promise<void> {
  await act(page.getByTestId('account-chip'));
  await expect(page.getByTestId('profile')).toBeVisible();
}

async function backToMenu(page: Page, act: Act): Promise<void> {
  await act(page.getByRole('button', { name: 'Назад' }));
  await expect(page.getByTestId('menu')).toBeVisible();
}

// Офлайн-профили по нику заменены входом по почте (ProfileScreen: CloudLogin); без сервера сценарий недоступен.
test.skip('офлайн-профиль: создать → выйти → войти обратно, прогресс на месте', async ({ page, act }) => {
  await page.goto(`./?seed=${SEED}`);
  await expect(page.getByTestId('menu')).toBeVisible();
  const chipName = page.getByTestId('account-chip-name');
  await expect(chipName).toHaveText('Гость');
  await expect(page.getByTestId('account-chip')).toContainText('Войти');

  // Создать профиль с PIN
  await openProfileFromChip(page, act);
  await act(page.getByTestId('account-login'));
  await page.getByTestId('create-name').fill('Нео');
  await page.getByTestId('create-pin').fill('1234');
  await act(page.getByTestId('create-submit'));
  await expect(page.getByTestId('account-name')).toHaveText('Нео');
  await backToMenu(page, act);
  await expect(chipName).toHaveText('Нео');

  // Прогресс профиля: начатый забег
  await act(page.getByTestId('menu-new'));
  await act(page.getByTestId('class-netrunner'));
  await act(page.getByTestId('start-run'));
  await expect(page.getByTestId('map')).toBeVisible();
  await page.reload();
  await expect(chipName).toHaveText('Нео');
  await expect(page.getByTestId('menu-continue')).toBeEnabled();

  // Выйти → снова гость, чужой забег не виден
  await openProfileFromChip(page, act);
  await act(page.getByTestId('account-logout'));
  await expect(page.getByTestId('account-name')).toHaveText('Гость');
  await backToMenu(page, act);
  await expect(chipName).toHaveText('Гость');
  await expect(page.getByTestId('menu-continue')).toBeDisabled();

  // Войти обратно: неверный PIN → понятная ошибка, верный → прогресс на месте
  await openProfileFromChip(page, act);
  await act(page.getByTestId('account-login'));
  await act(page.locator('[data-testid="device-profile"][data-name="Нео"]').getByTestId('device-profile-pick'));
  await page.getByTestId('signin-pin').fill('0000');
  await act(page.getByTestId('signin-submit'));
  await expect(page.getByTestId('account-error')).toHaveText('Неверный PIN');
  await page.getByTestId('signin-pin').fill('1234');
  await act(page.getByTestId('signin-submit'));
  await expect(page.getByTestId('account-name')).toHaveText('Нео');
  await backToMenu(page, act);
  await expect(chipName).toHaveText('Нео');
  await expect(page.getByTestId('menu-continue')).toBeEnabled();
  await expect(page.getByTestId('menu-continue')).toContainText('этаж');
});

// Офлайн-профили по нику заменены входом по почте (ProfileScreen: CloudLogin); без сервера сценарий недоступен.
test.skip('занятый ник: подсказка войти в существующий профиль', async ({ page, act }) => {
  await page.goto('./');
  await openProfileFromChip(page, act);
  await act(page.getByTestId('account-login'));
  await page.getByTestId('create-name').fill('Тринити');
  await act(page.getByTestId('create-submit'));
  await expect(page.getByTestId('account-name')).toHaveText('Тринити');
  await act(page.getByTestId('account-switch'));
  await page.getByTestId('create-name').fill(' тринити ');
  await act(page.getByTestId('create-submit'));
  await expect(page.getByTestId('account-error')).toContainText('Такой ник уже есть на этом устройстве — войди в него');
});
