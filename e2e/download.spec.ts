import { test, expect } from './fixtures';

test('«Скачать игру»: вкладки платформ, iPhone — инструкция, ссылка на релизы', async ({ page, act }) => {
  await page.goto('./');
  await act(page.getByTestId('menu-download'));
  await expect(page.getByTestId('download')).toBeVisible();
  await act(page.getByTestId('dl-tab-ios'));
  await expect(page.getByTestId('dl-panel')).toContainText('Safari');
  await act(page.getByTestId('dl-tab-windows'));
  // Релиз подтягивается с GitHub; без сети остаётся запасная ссылка на страницу релизов
  await expect(page.getByTestId('dl-file').or(page.getByTestId('dl-releases')).first()).toBeVisible();
  await expect(page.getByTestId('dl-pwa')).toBeVisible();
});
