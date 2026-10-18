import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Все видимые кнопки имеют доступное имя (текст, aria-label или aria-labelledby). */
async function unnamedButtons(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
      .filter((b) => b.getClientRects().length > 0)
      .filter((b) => !(b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || (b.textContent ?? '').trim()))
      .map((b) => b.outerHTML.slice(0, 120)),
  );
}

/** Контраст текста к ближайшему непрозрачному фону (WCAG 2.x). */
async function lowContrast(page: Page, selector: string, min = 4.5): Promise<string[]> {
  return page.evaluate(
    ({ selector, min }) => {
      const parse = (c: string): [number, number, number, number] => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return [0, 0, 0, 0];
        const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
        return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const bgOf = (el: Element | null): number[] => {
        // Смешиваем полупрозрачные фоны предков поверх фона страницы
        const stack: number[][] = [];
        for (let e = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor);
          if (c[3] > 0) stack.push(c);
          if (c[3] >= 1) break;
        }
        let acc = [5, 6, 15];
        for (const c of stack.reverse()) acc = acc.map((v, i) => v * (1 - c[3]!) + c[i]! * c[3]!);
        return acc;
      };
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (!el.getClientRects().length || !(el.textContent ?? '').trim()) continue;
        if (el.closest('[disabled], .is-locked')) continue; // неактивные элементы не нормируются
        const st = getComputedStyle(el);
        const fg = parse(st.color);
        const bg = bgOf(el);
        const f = fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!));
        const [a, b] = [lum(f), lum(bg)].sort((x, y) => y - x);
        const ratio = (a! + 0.05) / (b! + 0.05);
        if (ratio < min) bad.push(`${selector} «${(el.textContent ?? '').trim().slice(0, 30)}» ${ratio.toFixed(2)}`);
      }
      return bad;
    },
    { selector, min },
  );
}

const TEXT = ['.menu-btn b', '.menu-btn small', '.muted', '.eyebrow', '.section-title', '.stats dt', '.stats dd', '.ach__name', '.ach__desc', '.class-card__desc', 'p', '.reward__text b', '.reward__text small', '.event-option', '.choice small'];

async function checkContrast(page: Page) {
  const all: string[] = [];
  for (const s of TEXT) all.push(...(await lowContrast(page, s)));
  expect(all, 'текст с контрастом < 4.5:1').toEqual([]);
}

test('доступность: имена кнопок, видимый фокус, контраст', async ({ page, act }, testInfo) => {
  await page.goto('./');
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(await unnamedButtons(page)).toEqual([]);
  await checkContrast(page);

  // Фокус с клавиатуры виден (обводка не срезана clip-path)
  if (!testInfo.project.use.hasTouch) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const st = getComputedStyle(el);
      return { tag: el.tagName, style: st.outlineStyle, width: parseFloat(st.outlineWidth), offset: parseFloat(st.outlineOffset), clip: st.clipPath };
    });
    expect(ring).not.toBeNull();
    expect(ring!.style).not.toBe('none');
    expect(ring!.width).toBeGreaterThanOrEqual(2);
    // со срезанными углами обводка должна быть внутри элемента
    if (ring!.clip !== 'none') expect(ring!.offset).toBeLessThan(0);
  }

  await act(page.getByTestId('menu-profile'));
  await expect(page.getByTestId('profile')).toBeVisible();
  expect(await unnamedButtons(page)).toEqual([]);
  await checkContrast(page);

  for (const dev of ['combat', 'shop', 'reward', 'event', 'rest', 'victory']) {
    await page.goto(`./?dev=${dev}`);
    await expect(page.locator('.screen').first()).toBeVisible();
    expect(await unnamedButtons(page), dev).toEqual([]);
    await checkContrast(page);
  }
});
