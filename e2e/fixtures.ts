import { test as base, expect, type Locator, type Page } from '@playwright/test';

export const SEED = 'E2ESEED1';

type Fixtures = {
  /** Ошибки консоли и необработанные исключения — тест падает, если они были */
  consoleErrors: string[];
  /** Клик на десктопе, тап на мобильном проекте */
  act: (target: Locator) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      // Шрифты Google — внешняя зависимость; подменяем пустым CSS, чтобы тесты не зависели от сети
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await use(errors);
      expect(errors, 'ошибки в консоли браузера').toEqual([]);
    },
    { auto: true },
  ],
  act: async ({ page }, use, testInfo) => {
    const touch = !!testInfo.project.use.hasTouch;
    await use(async (target: Locator) => {
      if (touch) await target.tap();
      else await target.click();
      void page;
    });
  },
});

export { expect };

/** Меню → «Новый взлом» → класс → «Начать взлом» → карта. */
export async function startRun(page: Page, act: Fixtures['act'], seed = SEED): Promise<void> {
  await page.goto(`./?seed=${seed}`);
  await expect(page.getByTestId('menu')).toBeVisible();
  await act(page.getByTestId('menu-new'));
  await expect(page.getByTestId('class-select')).toBeVisible();
  await act(page.getByTestId('class-netrunner'));
  await act(page.getByTestId('start-run'));
  await expect(page.getByTestId('map')).toBeVisible();
}

/** Перейти в первый доступный боевой узел карты. */
export async function enterCombat(page: Page, act: Fixtures['act']): Promise<void> {
  const node = page.locator('[data-testid="map-node"][data-state="available"][data-kind="combat"]').first();
  await expect(node).toBeVisible();
  await act(node);
  await expect(page.getByTestId('combat')).toBeVisible();
  await expect(page.getByTestId('combat')).toHaveAttribute('data-phase', 'player');
}

/** Разыграть одну играбельную карту (атаки — в цель). false — играть нечем. */
export async function playOneCard(page: Page, act: Fixtures['act']): Promise<boolean> {
  const combat = page.getByTestId('combat');
  if ((await combat.getAttribute('data-phase')) !== 'player') return false;
  const playable = page.locator('[data-testid="hand-card"][data-playable="1"]');
  if ((await playable.count()) === 0) return false;
  // Сначала атаки в цель, потом остальное
  const targeted = playable.and(page.locator('[data-targeted="1"]'));
  const card = (await targeted.count()) > 0 ? targeted.first() : playable.first();
  const uid = await card.getAttribute('data-uid');
  const isTargeted = (await card.getAttribute('data-targeted')) === '1';
  await act(card);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  if (isTargeted) {
    const hit = page.locator('[data-testid="enemy-hit"]:not([disabled])').first();
    await act(hit);
  } else {
    await act(card); // повторный тап по выбранной карте запускает её
  }
  await expect(page.locator(`[data-testid="hand-card"][data-uid="${uid}"]`)).toHaveCount(0);
  return true;
}

/** Играть до победы в бою: карты → «Конец хода», пока не появится экран наград. */
export async function winCombat(page: Page, act: Fixtures['act'], maxTurns = 25): Promise<number> {
  const reward = page.getByTestId('reward-screen');
  const combat = page.getByTestId('combat');
  for (let turn = 1; turn <= maxTurns; turn++) {
    await expect(reward.or(combat.and(page.locator('[data-phase="player"]')))).toBeVisible();
    if (await reward.isVisible()) return turn - 1;
    for (let i = 0; i < 12; i++) {
      if (!(await combat.isVisible()) || (await combat.getAttribute('data-phase')) !== 'player') break;
      if (!(await playOneCard(page, act))) break;
    }
    await expect(reward.or(combat)).toBeVisible();
    if (await reward.isVisible()) return turn;
    if ((await combat.getAttribute('data-phase')) === 'player') await act(page.getByTestId('end-turn'));
    else await expect(reward).toBeVisible();
  }
  throw new Error(`бой не выигран за ${maxTurns} ходов`);
}

/** Сохранённый забег в localStorage (гостевой режим): число действий в журнале. */
export async function savedActions(page: Page): Promise<number> {
  return page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (!k.endsWith(':run')) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? 'null') as { actions?: unknown[] } | null;
        if (v && Array.isArray(v.actions)) return v.actions.length;
      } catch {
        /* ignore */
      }
    }
    return -1;
  });
}
