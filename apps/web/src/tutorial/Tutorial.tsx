/**
 * Интерактивное обучение: подсказки-«коучмарки» поверх обычного забега,
 * приглашение при первом запуске и одноразовые подсказки на экранах.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../game/store';
import { DIFFICULTY_INFO, listClasses, type ClassDef, type ClassId, type Difficulty } from '../game/engine';
import { CLASS_STYLE } from '../screens/MenuScreens';
import { isReducedMotion } from '../ui/settings';
import { sfx } from '../audio/sfx';
import { COUNTED, STEPS, type Step } from './steps';
import { beginTutorial, canGoBack, ctxOf, declineInvite, finishToNewRun, finishTutorial, hasActiveRun, nextStep, prevStep, retryTutorial, skipTutorial, stopToMenu, useTutorial } from './tutorialStore';
import { ScreenHint, TopPlaque } from './hints';

/** Запустить обучение (из меню или из приглашения при первом запуске). */
export function startTutorial(): void {
  if (hasActiveRun()) useTutorial.setState({ confirm: true });
  else useTutorial.setState({ setup: true });
}

/** Слой обучения: смонтирован в App поверх всех экранов. */
export function TutorialLayer() {
  return (
    <>
      <Invite />
      <ConfirmRestart />
      <Setup />
      <Coach />
      <ScreenHint />
    </>
  );
}

// ---------------- Геометрия ----------------

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PAD = 8; // отступ спотлайта вокруг цели
const GAP = 12; // зазор между спотлайтом и пузырём
const EDGE = 10; // поля от края экрана

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/** Куда поставить пузырь: рядом с целью, не перекрывая её и не вылезая за экран. */
function placeBubble(r: Rect | null, bw: number, bh: number, vw: number, vh: number): { x: number; y: number } {
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - bw - EDGE));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - bh - EDGE));
  if (!r) return { x: clampX((vw - bw) / 2), y: clampY((vh - bh) / 2) };
  const bottom = r.top + r.height;
  const right = r.left + r.width;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const below = { x: clampX(cx - bw / 2), y: bottom + GAP, fits: bottom + GAP + bh <= vh - EDGE };
  const above = { x: clampX(cx - bw / 2), y: r.top - GAP - bh, fits: r.top - GAP - bh >= EDGE };
  const toRight = { x: right + GAP, y: clampY(cy - bh / 2), fits: right + GAP + bw <= vw - EDGE };
  const toLeft = { x: r.left - GAP - bw, y: clampY(cy - bh / 2), fits: r.left - GAP - bw >= EDGE };
  const order = cy > vh / 2 ? [above, below, toRight, toLeft] : [below, above, toRight, toLeft];
  const ok = order.find((o) => o.fits);
  if (ok) return { x: ok.x, y: ok.y };
  // Цель на весь экран — перекрытия не избежать: туда, где больше места
  return vh - bottom >= r.top ? { x: clampX(cx - bw / 2), y: clampY(bottom + GAP) } : { x: clampX(cx - bw / 2), y: clampY(r.top - GAP - bh) };
}

function visibleRect(el: Element): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/**
 * Следим за целью шага каждый кадр: она двигается (веер карт, прокрутка карты, resize),
 * появляется позже или меняется (выбрал карту → цель — враг).
 */
function useTarget(step: Step | undefined, enabled: boolean, getCtx: () => ReturnType<typeof ctxOf>) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [sig, setSig] = useState('');
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const scrolledFor = useRef<Element | null>(null);

  useEffect(() => {
    if (!enabled || !step) return;
    let raf = 0;
    let last: Rect | null | undefined; // undefined — ещё не мерили: первый кадр всегда обновляет (сброс цели прошлого шага)
    let lastSig = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ctx = getCtx();
      const sels = ctx && step.target ? step.target(ctx) : null;
      let el: Element | null = null;
      let chosen = '';
      for (const s of sels ?? []) {
        const found = document.querySelector(s);
        if (found && found.getBoundingClientRect().width > 0) {
          el = found;
          chosen = s;
          break;
        }
      }
      // Цель за краем экрана (лента руки на телефоне, длинная карта сети) — докручиваем один раз
      if (el && scrolledFor.current !== el) {
        scrolledFor.current = el;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) {
          el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: isReducedMotion() ? 'auto' : 'smooth' });
        }
      }
      const next = el ? visibleRect(el) : null;
      if (last === undefined || !sameRect(next, last)) {
        last = next;
        setRect(next);
      }
      const nextSig = `${chosen}|${step.canAct ? String(step.canAct()) : ''}`;
      if (nextSig !== lastSig) {
        lastSig = nextSig;
        setSig(nextSig);
      }
      setVp((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step, enabled, getCtx]);

  return { rect: enabled ? rect : null, sig, vp };
}

// ---------------- Коучмарки ----------------

function Coach() {
  const active = useTutorial((s) => s.active);
  const index = useTutorial((s) => s.index);
  const snap = useTutorial((s) => s.snap);
  const pre = useTutorial((s) => s.pre);
  const run = useGame((s) => s.run);
  const heldCombat = useGame((s) => s.heldCombat);
  const view = useGame((s) => s.view);
  const step = active ? STEPS[index] : undefined;
  const ctx = ctxOf({ run, heldCombat, view }, { snap, pre });
  const shown = !!(step && ctx && step.screens.includes(ctx.screen));
  const tracked = shown && (step.mode === 'coach' || step.mode === 'action');

  const getCtx = useCallback(() => {
    const g = useGame.getState();
    return ctxOf(g, useTutorial.getState());
  }, []);
  // Хук сам перерисовывает пузырь, когда меняется цель или выбранная карта
  const { rect, vp } = useTarget(step, tracked, getCtx);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const measure = () => setSize((s) => (s && s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown, index, step?.mode]);

  const canAct = step?.canAct ? step.canAct() : true;
  const showNext = !!step && (step.mode === 'coach' || (step.mode === 'action' && !canAct));

  // Фокус на главную кнопку — Enter сразу работает, скринридер читает пузырь
  useEffect(() => {
    if (!shown || !step) return;
    if (step.mode === 'coach' || step.mode === 'final') primaryRef.current?.focus({ preventScroll: true });
  }, [shown, step, showNext]);

  // Клавиатура: Enter — «Далее», Esc — пропустить
  useEffect(() => {
    if (!shown || !step) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal')) return; // открыта модалка (стопка, настройки) — Esc закрывает её
      if (e.key === 'Escape') {
        if (step.id === 'lost') stopToMenu();
        else if (step.mode === 'final') finishTutorial();
        else skipTutorial();
        return;
      }
      if (e.key !== 'Enter') return;
      const t = e.target as Element | null;
      if (t && bubbleRef.current?.contains(t)) return; // кнопка в пузыре нажмётся сама
      if (t && t !== document.body && t.closest('button, a, input, select, textarea, [role="button"], [tabindex]')) return;
      if (step.mode === 'final') {
        e.preventDefault();
        if (step.id === 'lost') retryTutorial();
        else finishTutorial(true);
      } else if (showNext) {
        e.preventDefault();
        nextStep();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, step, showNext]);

  if (!shown || !step || !ctx) return null;

  const counter = COUNTED.indexOf(step.id);
  const text = step.text(ctx);

  if (step.mode === 'mini') {
    return <TopPlaque kind="tutorial" text={text} closeLabel="Пропустить обучение" closeText="Пропустить" onClose={skipTutorial} testId="tutorial-mini" />;
  }

  const pos = size ? placeBubble(step.mode === 'final' ? null : rect, size.w, size.h, vp.w, vp.h) : { x: -9999, y: -9999 };
  const titleId = `tut-title-${step.id}`;

  return (
    <div className={`tut-layer tut-layer--${step.mode}${ctx.screen === 'implant' ? ' tut-layer--top' : ''}`} data-testid="tutorial" data-step={step.id}>
      {rect && step.mode !== 'final' ? (
        <div key={step.id} className="tut-spot" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} aria-hidden="true" />
      ) : (
        <div className="tut-dim" aria-hidden="true" />
      )}
      {step.mode === 'coach' || step.mode === 'final' ? (
        // Пока читаешь подсказку, игра под затемнением не нажимается
        <div className="tut-shield" aria-hidden="true" onPointerDown={(e) => e.preventDefault()} />
      ) : null}
      <div
        ref={bubbleRef}
        className={`tut-bubble${step.mode === 'final' ? ' tut-bubble--final' : ''}`}
        style={{ transform: `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`, visibility: size ? 'visible' : 'hidden' }}
        role="dialog"
        aria-modal={step.mode === 'final'}
        aria-labelledby={titleId}
        data-testid="tutorial-bubble"
      >
        <div className="tut-bubble__top">
          <span className="eyebrow">Обучение{counter >= 0 ? ` · ${counter + 1}/${COUNTED.length}` : ''}</span>
          {step.mode === 'action' && canAct ? <span className="tut-wait">ждём твой ход</span> : null}
        </div>
        <h2 id={titleId} className="tut-bubble__title">
          {step.title}
        </h2>
        <div className="tut-bubble__text" aria-live="polite">
          {text}
        </div>
        {step.mode === 'final' ? (
          <div className="tut-bubble__actions">
            {step.id === 'lost' ? (
              <button className="btn btn--ghost btn--sm" data-testid="tutorial-menu" onClick={() => { sfx('click'); stopToMenu(); }}>
                В меню
              </button>
            ) : (
              <button className="btn btn--ghost btn--sm" data-testid="tutorial-new-run" onClick={finishToNewRun}>
                Новый забег
              </button>
            )}
            <button
              ref={primaryRef}
              className="btn btn--primary btn--sm"
              data-testid={step.id === 'lost' ? 'tutorial-retry' : 'tutorial-menu'}
              onClick={() => {
                sfx('click');
                if (step.id === 'lost') retryTutorial();
                else finishTutorial(true);
              }}
            >
              {step.id === 'lost' ? 'Ещё раз' : 'В меню'}
            </button>
          </div>
        ) : (
          <div className="tut-bubble__actions">
            <button className="btn btn--ghost btn--sm tut-skip" data-testid="tutorial-skip" onClick={skipTutorial}>
              Пропустить
            </button>
            {step.mode === 'coach' && canGoBack(index, ctx) ? (
              <button className="btn btn--ghost btn--sm" data-testid="tutorial-prev" onClick={prevStep}>
                Назад
              </button>
            ) : null}
            {showNext ? (
              <button
                ref={primaryRef}
                className="btn btn--primary btn--sm"
                data-testid="tutorial-next"
                onClick={() => {
                  sfx('click');
                  nextStep();
                }}
              >
                Далее
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Модалки: приглашение и подтверждение ----------------

function TutModal({ title, children, onEsc, testId }: { title: string; children: ReactNode; onEsc: () => void; testId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const escRef = useRef(onEsc);
  escRef.current = onEsc;
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.btn--primary')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-backdrop tut-modal-backdrop">
      <div className="modal tut-modal" role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`} ref={ref} data-testid={testId}>
        <div className="modal__body tut-modal__body">
          <h2 id={`${testId}-title`} className="tut-modal__title">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}

function Invite() {
  const flag = useTutorial((s) => s.flag);
  const active = useTutorial((s) => s.active);
  const closed = useTutorial((s) => s.inviteClosed);
  const confirm = useTutorial((s) => s.confirm);
  const view = useGame((s) => s.view);
  const mode = useGame((s) => s.backendMode);
  const totalRuns = useGame((s) => s.profile.totalRuns);
  const saved = useGame((s) => !!s.savedRun);
  const hasRun = useGame((s) => !!s.run);
  const want = !flag && !active && !closed && !confirm && view === 'menu' && mode !== 'loading' && totalRuns === 0 && !saved && !hasRun;
  // Небольшая пауза: профиль подгружается после выбора бэкенда — не мигаем ветеранам
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!want) {
      setReady(false);
      return;
    }
    const t = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(t);
  }, [want]);
  if (!want || !ready) return null;
  return (
    <TutModal title="Впервые в CyberHack?" onEsc={() => useTutorial.setState({ inviteClosed: true })} testId="tutorial-invite">
      <p className="tut-modal__text">Короткий учебный забег: один акт, где по разу встретится всё — бой, награды, событие, импланты, рынок, элита, привал и босс. Карты и враги каждый раз новые.</p>
      <div className="tut-modal__actions">
        <button className="btn btn--ghost" data-testid="invite-decline" onClick={declineInvite}>
          Я уже умею играть
        </button>
        <button
          className="btn btn--primary"
          data-testid="invite-accept"
          onClick={() => {
            sfx('select');
            startTutorial();
          }}
        >
          Пройти обучение
        </button>
      </div>
    </TutModal>
  );
}

function ConfirmRestart() {
  const confirm = useTutorial((s) => s.confirm);
  if (!confirm) return null;
  const cancel = () => useTutorial.setState({ confirm: false });
  return (
    <TutModal title="Начать обучение?" onEsc={cancel} testId="tutorial-confirm">
      <p className="tut-modal__text">У тебя есть незаконченный забег. Обучение начнёт новый, и старый пропадёт.</p>
      <div className="tut-modal__actions">
        <button className="btn btn--ghost" onClick={cancel}>
          Отмена
        </button>
        <button className="btn btn--primary" data-testid="confirm-tutorial" onClick={() => useTutorial.setState({ confirm: false, setup: true })}>
          Начать обучение
        </button>
      </div>
    </TutModal>
  );
}

function Setup() {
  const open = useTutorial((s) => s.setup);
  const unlockedIds = useGame((s) => s.profile.unlockedClasses);
  const [cls, setCls] = useState<ClassId>('netrunner');
  const [diff, setDiff] = useState<Difficulty>('normal');
  if (!open) return null;
  let classes: ClassDef[];
  try {
    classes = listClasses().filter((c) => unlockedIds.includes(c.id));
  } catch {
    classes = [];
  }
  const current = classes.find((c) => c.id === cls) ?? classes[0];
  const cancel = () => useTutorial.setState({ setup: false });
  return (
    <TutModal title={classes.length > 1 ? 'Выбери класс и режим' : 'Выбери режим'} onEsc={cancel} testId="tutorial-setup">
      {classes.length > 1 ? (
        <>
      <p className="tut-modal__text">
        <b>Класс</b> — твой стиль игры: свои карты, здоровье и ослабленный Классовый имплант (полный можно найти в забеге, шанс 1–5%). Новичкам проще всего с Нетраннером: прямой урон и понятные карты.
      </p>
      <div className="asc-chips" role="radiogroup" aria-label="Класс">
        {classes.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={(current?.id ?? cls) === c.id}
            data-testid={`tut-class-${c.id}`}
            className={`asc-chip${(current?.id ?? cls) === c.id ? ' is-selected' : ''}`}
            style={{ width: 'auto', padding: '0 14px' }}
            onClick={() => {
              sfx('click');
              setCls(c.id);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      {current ? (
        <p className="tut-modal__text muted small">
          {CLASS_STYLE[current.id] ? `Стиль: ${CLASS_STYLE[current.id]} ` : ''}
          {current.maxHp} HP, {current.startingGold} кр.
        </p>
      ) : null}
        </>
      ) : null}
      <p className="tut-modal__text">
        <b>Режим</b> — общая сила врагов. Лёгкий прощает ошибки, обычный — как задумано, сложный для опытных. Выше есть ещё уровни Ascension: они открываются победами и делают врагов сильнее.
      </p>
      <div className="asc-chips" role="radiogroup" aria-label="Режим">
        {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
          <button
            key={d}
            role="radio"
            aria-checked={diff === d}
            data-testid={`tut-diff-${d}`}
            className={`asc-chip${diff === d ? ' is-selected' : ''}`}
            style={{ width: 'auto', padding: '0 16px' }}
            onClick={() => {
              sfx('click');
              setDiff(d);
            }}
          >
            {DIFFICULTY_INFO[d].name}
          </button>
        ))}
      </div>
      <p className="tut-modal__text muted small">{DIFFICULTY_INFO[diff].description}</p>
      <div className="tut-modal__actions">
        <button className="btn btn--ghost" onClick={cancel}>
          Отмена
        </button>
        <button
          className="btn btn--primary"
          data-testid="tutorial-setup-start"
          onClick={() => {
            sfx('select');
            beginTutorial(current?.id ?? cls, diff);
          }}
        >
          Начать обучение
        </button>
      </div>
    </TutModal>
  );
}
