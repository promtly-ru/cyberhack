import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Атрибуты для элемента с подсказкой. Подсказки показывает единый TooltipLayer. */
export function tip(title: string, text?: string) {
  return { 'data-tip-title': title, 'data-tip': text ?? '' } as Record<string, string>;
}

interface TipState {
  title: string;
  text: string;
  rect: DOMRect;
}

function findTip(el: EventTarget | null): HTMLElement | null {
  return el instanceof Element ? (el.closest('[data-tip-title]') as HTMLElement | null) : null;
}

export function TooltipLayer() {
  const [tipState, setTip] = useState<TipState | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean }>({ x: 0, y: 0, below: false });
  const current = useRef<HTMLElement | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const show = (el: HTMLElement) => {
      current.current = el;
      setTip({ title: el.dataset.tipTitle ?? '', text: el.dataset.tip ?? '', rect: el.getBoundingClientRect() });
    };
    const hide = () => {
      current.current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = findTip(e.target);
      if (el && el !== current.current) show(el);
      else if (!el && current.current) hide();
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      // Внутри [data-tip-touch="off"] тап — это действие (например, ряд имплантов открывает меню), а не подсказка
      const el = e.target instanceof Element && e.target.closest('[data-tip-touch="off"]') ? null : findTip(e.target);
      clearTimeout(touchTimer.current);
      if (el) {
        show(el);
        touchTimer.current = setTimeout(hide, 2600);
      } else hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = findTip(e.target);
      if (el) show(el);
    };
    const focusOut = () => hide();
    const scroll = () => current.current && hide();
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      window.removeEventListener('scroll', scroll, true);
      clearTimeout(touchTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tipState || !boxRef.current) return;
    const b = boxRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 8;
    let x = tipState.rect.left + tipState.rect.width / 2 - b.width / 2;
    x = Math.max(margin, Math.min(vw - b.width - margin, x));
    let y = tipState.rect.top - b.height - 10;
    let below = false;
    if (y < margin) {
      y = tipState.rect.bottom + 10;
      below = true;
    }
    setPos({ x, y, below });
  }, [tipState]);

  if (!tipState) return null;
  return (
    <div ref={boxRef} className={`tooltip${pos.below ? ' is-below' : ''}`} role="tooltip" style={{ transform: `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)` }}>
      <div className="tooltip__title">{tipState.title}</div>
      {tipState.text ? <div className="tooltip__text">{tipState.text}</div> : null}
    </div>
  );
}
