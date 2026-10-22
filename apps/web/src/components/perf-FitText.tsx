import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Подобранный размер шрифта по «текст + размер рамки»: повторный рендер той же карты не трогает layout. */
const fitCache = new Map<string, string>();

/**
 * Блок текста карты: уменьшает шрифт, пока текст не влезет в рамку.
 * Бинарный поиск (≤6 замеров вместо шага 0.5px) и пропуск, если текст и рамка не менялись.
 */
export function FitText({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const key = `${el.textContent}|${el.clientWidth}x${el.clientHeight}`;
    if (key === last.current) return;
    last.current = key;
    const cached = fitCache.get(key);
    if (cached !== undefined) {
      el.style.fontSize = cached;
      return;
    }
    el.style.fontSize = '';
    if (el.scrollHeight <= el.clientHeight + 1) {
      fitCache.set(key, '');
      return;
    }
    const max = parseFloat(getComputedStyle(el).fontSize);
    let lo = max * 0.55; // минимум: дальше текст нечитаем, пусть обрежется
    let hi = max;
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (el.scrollHeight > el.clientHeight + 1) hi = mid;
      else lo = mid;
    }
    el.style.fontSize = `${lo}px`;
    if (fitCache.size > 500) fitCache.clear();
    fitCache.set(key, el.style.fontSize);
  }, []);
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    // Рамка меняется с размером окна (cqw): перепроверяем только тогда
    if (!ref.current || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(fit);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fit]);
  return <div className="card__text" ref={ref}>{children}</div>;
}
