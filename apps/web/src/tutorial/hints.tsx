/**
 * Одноразовые подсказки «что здесь делать» при первом попадании на экран
 * и общая плашка под верхней панелью (её же использует обучение для мини-напоминаний).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Screen } from '../game/engine';
import { useGame } from '../game/store';
import { Icon } from '../components/Icon';
import { isHintSeen, markHintSeen } from './storage';
import { useTutorial } from './tutorialStore';

type HintKind = 'shop' | 'rest' | 'event' | 'card_pick' | 'select_deck_card';

/**
 * Что здесь делать, экран и так подсказывает строкой под заголовком.
 * Одноразовая плашка добавляет то, чего там нет: совет, как выбирать с умом.
 */
function hintFor(screen: Screen): { title: string; text: string } | null {
  switch (screen.kind) {
    case 'shop':
      return { title: 'Совет', text: 'Удалить слабую карту — одна из лучших покупок: сильные карты станут приходить чаще. У каждого импланта своё условие — смотри меню имплантов.' };
    case 'rest':
      return { title: 'Совет', text: 'Если здоровья больше половины, обычно выгоднее улучшить карту. Если мало — лечись.' };
    case 'event':
      return { title: 'Совет', text: 'У вариантов бывает цена — здоровье или кредиты. Прежде чем платить, посмотри, сколько у тебя осталось.' };
    case 'card_pick':
      return { title: 'Совет', text: 'Не бери всё подряд: каждая лишняя карта отодвигает сильные. Иногда лучший выбор — «Пропустить».' };
    case 'select_deck_card':
      return screen.purpose === 'upgrade'
        ? { title: 'Совет', text: 'Улучшай карты, которые играешь чаще всего: так прибавка сработает больше раз.' }
        : { title: 'Совет', text: 'Первыми обычно убирают базовые атаки и защиты — колода становится плотнее.' };
    default:
      return null;
  }
}

/** Нижний край верхней панели — плашка встаёт сразу под ней. */
function useTopOffset(dep: unknown): number {
  const [top, setTop] = useState(64);
  useLayoutEffect(() => {
    const measure = () => {
      const bar = document.querySelector('.topbar');
      const b = bar ? bar.getBoundingClientRect().bottom : 0;
      setTop(Math.max(8, Math.round(b) + 8));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [dep]);
  return top;
}

/**
 * Плашка-подсказка. Мини-напоминание обучения — сверху, под панелью (в бою снизу рука).
 * Одноразовые советы экранов — снизу, чтобы не закрывать заголовок и строку-инструкцию под ним.
 */
export function TopPlaque({ title, text, onClose, closeLabel, closeText, kind, testId }: { title?: string; text: ReactNode; onClose: () => void; closeLabel: string; closeText?: string; kind: 'hint' | 'tutorial'; testId: string }) {
  const top = useTopOffset(text);
  const style = kind === 'tutorial' ? { top } : undefined;
  const ref = useRef<HTMLDivElement>(null);
  // Плашка резервирует место (--plaque-h снизу / --plaque-top сверху), чтобы не перекрывать кнопки и заголовок экрана
  useLayoutEffect(() => {
    const root = document.documentElement;
    const prop = kind === 'hint' ? '--plaque-h' : '--plaque-top';
    const apply = () => root.style.setProperty(prop, `${(ref.current?.offsetHeight ?? 0) + (kind === 'hint' ? 24 : 4)}px`);
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      root.style.removeProperty(prop);
    };
  }, [kind, text]);
  return (
    <div ref={ref} className={`tut-plaque tut-plaque--${kind}`} style={style} role="status" data-testid={testId}>
      <span className="tut-plaque__icon" aria-hidden="true">
        <Icon name={kind === 'hint' ? 'help' : 'graduation'} size={20} />
      </span>
      <span className="tut-plaque__text">
        {title ? <b>{title}. </b> : null}
        {text}
      </span>
      {kind === 'hint' ? (
        <button className="icon-btn tut-plaque__close" onClick={onClose} aria-label={closeLabel} data-testid={`${testId}-close`}>
          <Icon name="close" size={18} />
        </button>
      ) : (
        <button className="tut-plaque__skip" onClick={onClose} aria-label={closeLabel} data-testid={`${testId}-skip`}>
          {closeText ?? closeLabel}
        </button>
      )}
    </div>
  );
}

export function ScreenHint() {
  const view = useGame((s) => s.view);
  const screen = useGame((s) => (s.view === 'run' && s.run && !s.heldCombat ? s.run.screen : null));
  const tutorialActive = useTutorial((s) => s.active);
  const kind = (screen?.kind ?? null) as HintKind | null;
  const [shown, setShown] = useState<HintKind | null>(null);

  useEffect(() => {
    if (!screen || view !== 'run' || !hintFor(screen)) {
      setShown(null);
      return;
    }
    const k = screen.kind as HintKind;
    // Во время обучения выбор карты объясняет само обучение
    if (tutorialActive) {
      if (k === 'card_pick') markHintSeen(k);
      setShown(null);
      return;
    }
    if (isHintSeen(k)) return;
    markHintSeen(k); // показали — больше не покажем, даже если не закрыл
    setShown(k);
    // screen как объект меняется на каждом действии; важен только вид экрана
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, view, tutorialActive]);

  if (!shown || !screen || screen.kind !== shown) return null;
  const h = hintFor(screen);
  if (!h) return null;
  return <TopPlaque kind="hint" title={h.title} text={h.text} closeLabel="Понятно, закрыть подсказку" onClose={() => setShown(null)} testId="onboarding-hint" />;
}
