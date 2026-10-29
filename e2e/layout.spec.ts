import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

async function cardBoxes(page: Page): Promise<Box[]> {
  return page.locator('[data-testid="hand-card"] .card').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

test('рука: карты не уходят под HUD и за край экрана', async ({ page }, testInfo) => {
  const sizes = testInfo.project.use.hasTouch ? [{ width: 360, height: 780 }] : [{ width: 768, height: 1024 }, { width: 1440, height: 900 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('./?dev=combat');
    await expect(page.getByTestId('combat')).toBeVisible();
    await expect(page.locator('[data-testid="hand-card"]')).not.toHaveCount(0);
    await page.waitForTimeout(300);
    const boxes = await cardBoxes(page);
    const vh = size.height;
    const hand = (await page.getByTestId('hand').boundingBox())!;
    for (const b of boxes) {
      // по вертикали — целиком на экране (у ленты по горизонтали карты могут прокручиваться)
      expect(b.y + b.height, `карта ниже экрана на ${size.width}`).toBeLessThanOrEqual(vh + 1);
    }
    if (size.width >= 768) {
      const end = (await page.getByTestId('end-turn').boundingBox())!;
      const last = boxes[boxes.length - 1]!;
      expect(last.x + last.width, `последняя карта под «Конец хода» на ${size.width}`).toBeLessThanOrEqual(end.x);
      expect(boxes[0]!.x).toBeGreaterThanOrEqual(hand.x - 2);
    } else {
      // Телефон: лента без перекрытия, карты читаемого размера
      for (const b of boxes) expect(b.width).toBeGreaterThanOrEqual(100);
      for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 0.5);
    }
  }
});

test('телефон: долгий тап — превью карты, тап карта → тап цель', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'только для touch');
  await page.goto('./?dev=combat');
  const card = page.locator('[data-testid="hand-card"][data-targeted="1"][data-playable="1"]').first();
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Долгий тап: touchstart → пауза → touchend
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await expect(page.getByTestId('card-preview')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('card-preview')).toHaveCount(0);
  // Превью не выбирает карту
  await expect(card).toHaveAttribute('aria-pressed', 'false');

  // Тап по карте → тап по врагу
  const uid = await card.getAttribute('data-uid');
  await card.tap();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-testid="enemy-hit"]:not([disabled])').first().tap();
  await expect(page.locator(`[data-testid="hand-card"][data-uid="${uid}"]`)).toHaveCount(0);
});

test('телефон: зона тапа узлов карты не меньше 44 px', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'только для touch');
  await page.goto('./?dev=map');
  await expect(page.getByTestId('map')).toBeVisible();
  const hits = page.getByTestId('map-node-hit');
  await expect(hits.first()).toBeVisible();
  const sizes = await hits.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(44);
});