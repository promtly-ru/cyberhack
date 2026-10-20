import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import type { CardInstance, CombatState, EnemyState, RunState } from '../game/engine';
import { canCool, cardStats, describeCard, getEnemyDef, getLegalActions, HEAT_COOL_AMOUNT, HEAT_COOL_HP, HEAT_MAX, HEAT_THRESHOLDS, heatLevel } from '../game/engine';
import { useGame } from '../game/store';
import { Card, CardTerms } from '../components/Card';
import { HpBar, IntentBadge, StatusRow, SynergyBar } from '../components/Bits';
import { EnemyArt, PlayerArt, CLASS_COLOR } from '../components/UnitArt';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { TopBar } from '../components/TopBar';
import { CardGridModal } from '../components/CardGridModal';
import { fx, parseColor } from '../fx/fx';
import { sfx } from '../audio/sfx';
import { hash } from '../ui/rand';
import { useTutorial } from '../tutorial/tutorialStore';

const TYPE_COLOR: Record<string, string> = { attack: '#ff2bd6', skill: '#00f0ff', power: '#e8ff3a', status: '#8d97b5', curse: '#ff3b5c' };
const ENEMY_COLORS = ['#ff3b5c', '#ff6a3d', '#ff2bd6'];

function enemyColor(e: EnemyState, tier: string): string {
  if (tier === 'boss') return '#ff2bd6';
  if (tier === 'elite') return '#ff9f1c';
  return ENEMY_COLORS[hash(e.defId) % ENEMY_COLORS.length] ?? '#ff3b5c';
}

function enemyInfo(e: EnemyState) {
  try {
    const d = getEnemyDef(e.defId);
    // Скрытое намерение (мутатор «Туман войны») — название хода тоже не раскрываем
    const moveName = e.intent.kind === 'unknown' ? undefined : d.moves.find((m) => m.id === e.intent.moveId)?.name;
    return { name: d.name, tier: d.tier, moveName };
  } catch {
    return { name: e.defId, tier: 'normal' as const, moveName: undefined };
  }
}

/** Подпись карты для скринридера: имя, стоимость, текст. */
function cardLabel(c: CardInstance, playable: boolean): string {
  try {
    const st = cardStats(c.defId, c.upgraded);
    const cost = st.cost === -1 ? 'X' : st.cost <= -2 ? 'нет' : String(st.cost);
    return `${st.name}${c.upgraded ? '+' : ''}, стоимость ${cost}. ${describeCard(c.defId, c.upgraded)}${playable ? '' : ' (недоступна)'}`;
  } catch {
    return c.defId;
  }
}

const LONG_PRESS_MS = 450;

/** Сенсорный экран без мыши: подсказки «удерживай», а не «правый клик». */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(hover: none)');
    if (!mq) return;
    const on = () => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

function center(el: Element | null): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

interface DragState {
  uid: string;
  pointerId: number;
  x0: number;
  y0: number;
  moved: boolean;
  targeted: boolean;
  el: HTMLElement;
}

export function CombatScreen({ run, combat, frozen }: { run: RunState; combat: CombatState; frozen: boolean }) {
  const dispatch = useGame((s) => s.dispatch);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [pile, setPile] = useState<'draw' | 'discard' | 'exhaust' | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [handW, setHandW] = useState(600);
  /** Телефон: рука — горизонтальная лента со свайпом, карты крупнее */
  const strip = handW < 440;
  const drag = useRef<DragState | null>(null);
  const arrowRef = useRef<SVGPathElement>(null);
  const arrowSvgRef = useRef<SVGSVGElement>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Долгий тап — превью карты на весь экран */
  const [preview, setPreview] = useState<CardInstance | null>(null);
  const previewShown = useRef(false);
  /** Превью открыто правым кликом мыши — закрывается любым нажатием */
  const [mousePreview, setMousePreview] = useState(false);
  const coarse = useCoarsePointer();
  const tutorialActive = useTutorial((s) => s.active);

  const playerPhase = combat.phase === 'player' && !frozen;

  // Легальные ходы — от движка
  const legal = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!playerPhase) return m;
    try {
      for (const a of getLegalActions(run)) {
        if (a.type !== 'play_card') continue;
        const set = m.get(a.cardUid) ?? new Set<string>();
        set.add(a.targetUid ?? '');
        m.set(a.cardUid, set);
      }
    } catch {
      /* движок не дал список — карты считаются неиграбельными */
    }
    return m;
  }, [run, playerPhase]);

  const isBlockCard = useCallback((c: CardInstance) => {
    try {
      const d = cardStats(c.defId, c.upgraded).def;
      return d.target !== 'enemy' && d.effects.some((e) => e.type === 'block');
    } catch {
      return false;
    }
  }, []);
  const isTargeted = useCallback((c: CardInstance) => {
    try {
      return cardStats(c.defId, c.upgraded).def.target === 'enemy';
    } catch {
      return false;
    }
  }, []);

  // Ширина руки
  useLayoutEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setHandW(entry.contentRect.width));
    ro.observe(el);
    setHandW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Баннер хода
  const lastTurn = useRef(combat.turn);
  useEffect(() => {
    if (combat.turn !== lastTurn.current) {
      lastTurn.current = combat.turn;
      setBanner({ key: combat.turn, text: `Ход ${combat.turn}` });
    }
  }, [combat.turn]);
  useEffect(() => {
    if (combat.phase === 'won') setBanner({ key: -1, text: 'Система взломана' });
    if (combat.phase === 'lost') setBanner({ key: -2, text: 'Соединение разорвано' });
  }, [combat.phase]);

  // Выбранная карта ушла из руки
  useEffect(() => {
    if (selected && !combat.hand.some((c) => c.uid === selected)) setSelected(null);
  }, [combat.hand, selected]);

  const flashHint = useCallback((text: string) => {
    setHint(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1600);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(hintTimer.current);
      clearTimeout(pressTimer.current);
    },
    [],
  );
  const hidePreview = useCallback(() => {
    clearTimeout(pressTimer.current);
    setPreview(null);
  }, []);
  useEffect(() => {
    if (!preview || !mousePreview) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setMousePreview(false);
      setPreview(null);
      // Нажатие, закрывшее превью, не должно выбрать карту под ним
      window.addEventListener('pointerup', (ev) => ev.stopPropagation(), { capture: true, once: true });
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('contextmenu', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('contextmenu', close, true);
    };
  }, [preview, mousePreview]);

  const play = useCallback(
    (uid: string, targetUid?: string) => {
      const card = combat.hand.find((c) => c.uid === uid);
      if (!card) return;
      const el = cardEls.current.get(uid);
      const rect = el?.querySelector('.card')?.getBoundingClientRect();
      let type = 'skill';
      let targetKind = 'self';
      try {
        const d = cardStats(card.defId, card.upgraded).def;
        type = d.type;
        targetKind = d.target;
      } catch {
        /* ignore */
      }
      const to =
        targetUid ? center(document.querySelector(`[data-fx-target="${CSS.escape(targetUid)}"] .unit__sprite`))
        : targetKind === 'all_enemies' || targetKind === 'random_enemy' ? center(document.querySelector('.enemy-zone'))
        : center(document.querySelector('[data-fx-target="player"] .unit__sprite'));
      const ok = dispatch({ type: 'play_card', cardUid: uid, ...(targetUid ? { targetUid } : {}) });
      if (ok && rect) fx.cardDissolve(rect, parseColor(TYPE_COLOR[type] ?? '#00f0ff'), to);
      setSelected(null);
      setHoverTarget(null);
    },
    [combat.hand, dispatch],
  );

  const tapCard = useCallback(
    (c: CardInstance) => {
      if (!playerPhase) return;
      const options = legal.get(c.uid);
      if (!options) {
        sfx('error');
        let msg = 'Эту программу нельзя запустить';
        try {
          const st = cardStats(c.defId, c.upgraded);
          if (st.cost > combat.energy) msg = 'Недостаточно энергии';
        } catch {
          /* ignore */
        }
        flashHint(msg);
        const el = cardEls.current.get(c.uid)?.querySelector('.card');
        el?.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 220 });
        return;
      }
      if (selected === c.uid) {
        if (!isTargeted(c)) play(c.uid);
        else setSelected(null);
        return;
      }
      // Единственная возможная цель: сразу играем, без второго клика по врагу
      if (isTargeted(c) && options.size === 1 && !tutorialActive) {
        play(c.uid, [...options][0]);
        return;
      }
      sfx('select');
      setSelected(c.uid);
    },
    [combat.energy, flashHint, isTargeted, legal, play, playerPhase, selected, tutorialActive],
  );

  // ---------- Перетаскивание ----------
  const onCardDown = (e: RPointerEvent<HTMLElement>, c: CardInstance) => {
    if (!playerPhase || e.button > 0) return;
    const el = e.currentTarget;
    if (!strip) el.setPointerCapture(e.pointerId);
    previewShown.current = false;
    clearTimeout(pressTimer.current);
    if (e.pointerType !== 'mouse') {
      pressTimer.current = setTimeout(() => {
        if (drag.current?.uid === c.uid && !drag.current.moved) {
          previewShown.current = true;
          setPreview(c);
        }
      }, LONG_PRESS_MS);
    }
    drag.current = { uid: c.uid, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, targeted: isTargeted(c), el };
  };

  const onCardMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 12) return;
      clearTimeout(pressTimer.current);
      // Лента на телефоне: горизонтальный свайп листает руку, перетаскивания нет — только тап
      if (previewShown.current) return;
      if (strip) {
        drag.current = null; // свайп — не тап
        return;
      }
      if (!legal.has(d.uid)) return;
      d.moved = true;
      setDragUid(d.uid);
      setSelected(d.uid);
    }
    const handTop = handRef.current?.getBoundingClientRect().top ?? window.innerHeight * 0.6;
    if (d.targeted) {
      const cardRect = d.el.querySelector('.card')?.getBoundingClientRect();
      if (cardRect && arrowRef.current) {
        const sx = cardRect.left + cardRect.width / 2;
        const sy = cardRect.top + 6;
        const cx = sx + (e.clientX - sx) * 0.1;
        const cy = Math.min(sy, e.clientY) - 80;
        arrowRef.current.setAttribute('d', `M${sx} ${sy} Q${cx} ${cy} ${e.clientX} ${e.clientY}`);
        arrowSvgRef.current?.classList.add('is-on');
      }
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-target-uid]');
      const uid = hit?.dataset.targetUid ?? null;
      const valid = uid && legal.get(d.uid)?.has(uid) ? uid : null;
      arrowSvgRef.current?.classList.toggle('is-locked', !!valid);
      if (valid !== hoverTarget) setHoverTarget(valid);
    } else {
      const inner = d.el.querySelector<HTMLElement>('.hand-card__inner');
      if (inner) inner.style.translate = `${dx}px ${dy}px`;
      const over = e.clientY < handTop - 20 ? 'play' : null;
      if (over !== hoverTarget) setHoverTarget(over);
    }
  };

  const endDrag = (commit: boolean, e?: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    clearTimeout(pressTimer.current);
    if (previewShown.current) {
      previewShown.current = false;
      setPreview(null);
      return;
    }
    if (!d) return;
    const inner = d.el.querySelector<HTMLElement>('.hand-card__inner');
    if (inner) inner.style.translate = '';
    arrowSvgRef.current?.classList.remove('is-on', 'is-locked');
    setDragUid(null);
    if (!d.moved) {
      if (commit) {
        const c = combat.hand.find((x) => x.uid === d.uid);
        if (c) tapCard(c);
      }
      return;
    }
    if (!commit || !e) {
      setHoverTarget(null);
      return;
    }
    if (d.targeted && hoverTarget && hoverTarget !== 'play') play(d.uid, hoverTarget);
    else if (!d.targeted && hoverTarget === 'play') play(d.uid);
    else setHoverTarget(null);
  };

  // ---------- Клавиатура ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!playerPhase || document.querySelector('.modal')) return;
      if (e.key === 'Escape') setSelected(null);
      if (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'у') {
        sfx('click');
        dispatch({ type: 'end_turn' });
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const c = combat.hand[n - 1];
        if (c) tapCard(c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combat.hand, dispatch, playerPhase, tapCard]);

  const selectedCard = combat.hand.find((c) => c.uid === selected) ?? null;
  const selectedTargeted = selectedCard ? isTargeted(selectedCard) : false;
  const validTargets = selectedCard ? legal.get(selectedCard.uid) : undefined;

  const onFieldClick = (e: RMouseEvent) => {
    if (!selectedCard || dragUid) return;
    if ((e.target as Element).closest('[data-target-uid], .unit__hit, .intent, .status, .hpbar__block')) return;
    if (!selectedTargeted) play(selectedCard.uid);
    else setSelected(null);
  };

  // ---------- Раскладка: веер или лента (телефон) ----------
  const n = combat.hand.length;
  const compact = handW < 520;
  // На низких экранах (телефон горизонтально) карты не должны съедать поле боя
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const maxByH = vh <= 520 ? Math.max(72, (vh - 250) / 1.4) : Math.max(84, (vh - 280) / 1.4);
  const cardW = Math.min(maxByH, strip ? Math.min(136, Math.max(112, (handW - 12) / 2.75)) : compact ? Math.min(112, Math.max(88, handW / 3.25)) : Math.min(164, Math.max(120, handW / 5.6)));
  const cardH = cardW * 1.4;
  const fanAngle = n > 1 && !strip ? Math.min(5, 28 / n) : 0;
  const maxRot = ((fanAngle * (n - 1)) / 2) * (Math.PI / 180);
  // Повёрнутые крайние карты выступают за свою рамку — оставляем поля, чтобы не залезать под кнопки HUD
  const sidePad = Math.ceil(cardH * Math.sin(maxRot) * 0.9);
  const cornerDip = Math.ceil((cardW / 2) * Math.sin(maxRot));
  const usable = Math.max(cardW, handW - 2 * sidePad);
  const step = n > 1 ? Math.min(cardW * (compact ? 0.86 : 0.9), (usable - cardW) / (n - 1)) : 0;
  const total = step * (n - 1);
  const arc = compact ? 1.2 : 2.4;
  const maxOff = (n - 1) / 2;
  const handH = strip ? cardH + 22 : cardH + maxOff * maxOff * arc + cornerDip + 4;

  let hintText = '';
  let hintKind: 'idle' | 'target' | 'confirm' | 'end' | 'error' = 'idle';
  if (hint) {
    hintText = hint;
    hintKind = 'error';
  } else if (playerPhase) {
    if (selectedCard) {
      hintText = selectedTargeted ? 'Теперь нажми на врага' : 'Нажми на карту ещё раз, чтобы сыграть';
      hintKind = selectedTargeted ? 'target' : 'confirm';
    } else if (legal.size === 0) {
      hintText = combat.energy === 0 ? 'Энергия кончилась — нажми «Конец хода»' : 'Играть нечем — нажми «Конец хода»';
      hintKind = 'end';
    } else {
      hintText = coarse ? 'Выбери карту · удерживай — подробнее' : 'Выбери карту · правый клик — подробнее';
    }
  }

  const player = combat.player;
  return (
    <div
      className={`screen combat${frozen ? ' is-frozen' : ''}${selectedTargeted ? ' is-targeting' : ''}`}
      style={{ '--card-w': `${cardW}px` } as CSSProperties}
      data-testid="combat"
      data-act={run.act}
      data-tier={combat.enemies.some((e) => enemyInfo(e).tier === 'boss') ? 'boss' : combat.enemies.some((e) => enemyInfo(e).tier === 'elite') ? 'elite' : 'normal'}
      data-phase={frozen ? 'frozen' : combat.phase}
    >
      <TopBar run={run} />
      <div className="battlefield" onClick={onFieldClick}>
        <div className="battlefield__grid" aria-hidden="true" />
        <div className={`player-zone${hoverTarget === 'play' ? ' is-drop' : ''}`} data-tut="player">
          <div className="unit unit--player" data-fx-target="player" style={{ '--unit-color': CLASS_COLOR[run.classId] } as CSSProperties}>
            <div className="unit__intent-spacer" />
            <div className="unit__sprite">
              <PlayerArt classId={run.classId} />
            </div>
            <div className="unit__info">
              <HpBar hp={player.hp} maxHp={player.maxHp} block={player.block} friendly />
              <StatusRow statuses={player.statuses} labeled />
              <SynergyBar deck={run.deck} />
            </div>
          </div>
        </div>
        <div className={`enemy-zone n-${combat.enemies.length}`}>
          {combat.enemies.map((e) => {
            const info = enemyInfo(e);
            const dead = e.hp <= 0;
            const targetable = !!(selectedTargeted && validTargets?.has(e.uid));
            const hovered = hoverTarget === e.uid;
            return (
              <div
                key={e.uid}
                className={`unit unit--enemy tier-${info.tier}${targetable ? ' is-targetable' : ''}${hovered ? ' is-hovered' : ''}`}
                data-testid="enemy"
                data-hp={e.hp}
                data-fx-target={e.uid}
                data-target-uid={dead ? undefined : e.uid}
                data-dead={dead ? '1' : undefined}
                style={{ '--unit-color': enemyColor(e, info.tier) } as CSSProperties}
              >
                <div className="unit__intent">{!dead ? <IntentBadge intent={e.intent} {...(info.moveName ? { moveName: info.moveName } : {})} /> : null}</div>
                <div className="unit__sprite">
                  <EnemyArt defId={e.defId} tier={info.tier} />
                  <div className="unit__reticle" aria-hidden="true" />
                </div>
                <div className="unit__info">
                  <div className="unit__name">{info.name}</div>
                  <HpBar hp={e.hp} maxHp={e.maxHp} block={e.block} />
                  <StatusRow statuses={e.statuses} labeled />
                </div>
                {!dead ? (
                  <button
                    className="unit__hit"
                    data-testid="enemy-hit"
                    aria-label={`${info.name}, HP ${e.hp} из ${e.maxHp}${targetable ? ' — выбрать целью' : ''}`}
                    disabled={!targetable}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (selectedCard && targetable) play(selectedCard.uid, e.uid);
                    }}
                    onPointerEnter={() => targetable && setHoverTarget(e.uid)}
                    onPointerLeave={() => !dragUid && hovered && setHoverTarget(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {banner ? (
          <div key={banner.key} className={`turn-banner${banner.key < 0 ? ' is-final' : ''}`} onAnimationEnd={() => setBanner(null)} aria-live="polite">
            <span data-text={banner.text}>{banner.text}</span>
          </div>
        ) : null}
      </div>

      {combat.heat !== undefined ? (
        <HeatBar
          heat={combat.heat}
          canCool={playerPhase && canCool(combat)}
          onCool={() => {
            sfx('click');
            dispatch({ type: 'cool' });
          }}
        />
      ) : null}

      <div className={`combat-hud${strip ? ' is-strip' : ''}`}>
        <div className="hud-left">
          <EnergyCore energy={combat.energy} max={combat.maxEnergy} />
          <PileButton kind="draw" count={combat.drawPile.length} onClick={() => setPile('draw')} />
        </div>
        <div className={`hud-hint is-${hintKind}`} aria-live="polite" data-testid="hand-hint" data-hint={hintKind}>
          {hintText ? <span>{hintText}</span> : null}
        </div>
        <div className={`hand${strip ? ' is-strip' : ''}`} ref={handRef} style={{ height: handH }} role="group" aria-label={`Рука: ${n} карт`} data-testid="hand">
          {combat.hand.map((c, i) => {
            const off = i - (n - 1) / 2;
            const x = handW / 2 - total / 2 + i * step - cardW / 2;
            // Веер: крайние карты слегка ниже, но не за краем экрана
            const y = (off * off - maxOff * maxOff) * arc - cornerDip;
            const isSel = selected === c.uid;
            const playable = legal.has(c.uid);
            const style = (
              strip
                ? { zIndex: isSel ? 40 : 10 + i }
                : { '--x': `${x}px`, '--y': `${y}px`, '--r': `${off * fanAngle}deg`, zIndex: isSel || dragUid === c.uid ? 40 : 10 + i }
            ) as CSSProperties;
            return (
              <button
                key={c.uid}
                ref={(el) => {
                  if (el) cardEls.current.set(c.uid, el);
                  else cardEls.current.delete(c.uid);
                }}
                className={`hand-card${isSel ? ' is-selected' : ''}${dragUid === c.uid ? ' is-dragging' : ''}${playable ? ' is-playable' : ''}`}
                style={style}
                onPointerDown={(e) => onCardDown(e, c)}
                onPointerMove={onCardMove}
                onPointerUp={(e) => endDrag(true, e)}
                onPointerCancel={() => {
                  hidePreview();
                  previewShown.current = false;
                  endDrag(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // Мышь: правый клик — рассмотреть карту и её термины
                  if (!previewShown.current && !coarse) {
                    setMousePreview(true);
                    setPreview(c);
                  }
                }}
                data-testid="hand-card"
                data-uid={c.uid}
                data-def={c.defId}
                data-playable={playable ? '1' : '0'}
                data-targeted={isTargeted(c) ? '1' : '0'}
                data-block={isBlockCard(c) ? '1' : '0'}
                aria-label={cardLabel(c, playable)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tapCard(c);
                  }
                }}
                onClick={(e) => e.preventDefault()}
                disabled={!playerPhase}
                aria-pressed={isSel}
              >
                <span className="hand-card__inner">
                  <Card defId={c.defId} upgraded={c.upgraded} playable={playable || !playerPhase} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="hud-right">
          <button
            className="btn btn--end"
            data-testid="end-turn"
            aria-keyshortcuts="E"
            disabled={!playerPhase}
            onClick={() => {
              sfx('click');
              setSelected(null);
              dispatch({ type: 'end_turn' });
            }}
          >
            <span>Конец хода</span>
            <kbd className="hide-sm">E</kbd>
          </button>
          <div className="pile-row">
            <PileButton kind="discard" count={combat.discardPile.length} onClick={() => setPile('discard')} />
            <PileButton kind="exhaust" count={combat.exhaustPile.length} onClick={() => setPile('exhaust')} />
          </div>
        </div>
      </div>

      <svg className="target-arrow" ref={arrowSvgRef} aria-hidden="true">
        <defs>
          <marker id="arrow-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>
        <path ref={arrowRef} d="" markerEnd="url(#arrow-head)" />
      </svg>

      {preview ? (
        <div className={`card-preview${mousePreview ? ' is-mouse' : ''}`} data-testid="card-preview" role="dialog" aria-label={`Карта: ${cardLabel(preview, legal.has(preview.uid))}`}>
          <div className="card-preview__inner">
            <Card defId={preview.defId} upgraded={preview.upgraded} playable={legal.has(preview.uid)} />
            <CardTerms defId={preview.defId} upgraded={preview.upgraded} />
          </div>
          <p className="card-preview__close">{mousePreview ? 'Нажми в любом месте, чтобы закрыть' : 'Отпусти палец, чтобы закрыть'}</p>
        </div>
      ) : null}

      {pile === 'draw' ? <CardGridModal title="Колода (добор)" cards={combat.drawPile} onClose={() => setPile(null)} empty="Стопка пуста — сброс перемешается" /> : null}
      {pile === 'discard' ? <CardGridModal title="Сброс" cards={[...combat.discardPile].reverse()} sorted={false} onClose={() => setPile(null)} /> : null}
      {pile === 'exhaust' ? <CardGridModal title="Сожжено" cards={combat.exhaustPile} onClose={() => setPile(null)} empty="Ничего не сгорело" /> : null}
    </div>
  );
}

function HeatBar({ heat, canCool: can, onCool }: { heat: number; canCool: boolean; onCool: () => void }) {
  const lvl = heatLevel(heat);
  const active = lvl > 0 ? HEAT_THRESHOLDS[lvl - 1]! : null;
  return (
    <div className={`heat heat--${lvl}`} data-testid="heat" data-heat={heat} aria-label={`Перегрев ${heat} из ${HEAT_MAX}`}>
      <div className="heat__track" role="progressbar" aria-valuemin={0} aria-valuemax={HEAT_MAX} aria-valuenow={heat}>
        <div className="heat__fill" style={{ width: `${heat}%` }} />
        {HEAT_THRESHOLDS.map((t, i) => (
          <span key={t.at} className={`heat__mark${lvl > i ? ' is-active' : ''}${lvl === i + 1 ? ' is-current' : ''}`} style={{ left: `${t.at}%` }} {...tip(t.name, t.text)} />
        ))}
      </div>
      <div className="heat__label">
        <b>Heat {heat}</b>
        <span>{active ? `${active.name}: ${active.text}` : 'Остыл — порогов нет'}</span>
      </div>
      <button className="btn heat__cool" data-testid="cool" disabled={!can} onClick={onCool} {...tip('Охладить', `−${HEAT_COOL_AMOUNT} Heat, стоит ${HEAT_COOL_HP} HP, раз в ход`)}>
        Охладить
      </button>
    </div>
  );
}

function EnergyCore({ energy, max }: { energy: number; max: number }) {
  return (
    <div className={`energy${energy === 0 ? ' is-empty' : ''}`} data-tut="energy" data-testid="energy" tabIndex={0} aria-label={`Энергия ${energy} из ${max}`} {...tip(`Энергия ${energy} из ${max}`, 'Тратится на розыгрыш карт: цена — в кружке в углу карты. В начале каждого хода восстанавливается полностью.')}>
      <svg viewBox="0 0 100 100" className="energy__svg" aria-hidden="true">
        <circle cx="50" cy="50" r="44" className="energy__ring1" />
        <circle cx="50" cy="50" r="36" className="energy__ring2" />
        <circle cx="50" cy="50" r="28" className="energy__core" />
        {Array.from({ length: Math.max(max, energy) }, (_, i) => {
          const total = Math.max(max, energy);
          const a = (i / total) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={50 + Math.cos(a) * 44} cy={50 + Math.sin(a) * 44} r={4.2} className={i < energy ? 'pip is-on' : 'pip'} />;
        })}
      </svg>
      <span className="energy__n mono">
        {energy}
        <small>/{max}</small>
      </span>
      <span className="energy__label hud-label" aria-hidden="true">
        Энергия
      </span>
    </div>
  );
}

const PILE_LABEL = { draw: 'Колода', discard: 'Сброс', exhaust: 'Сожжено' } as const;
const PILE_TIP = {
  draw: 'Карты, которые ты возьмёшь в следующие ходы. Нажми, чтобы посмотреть.',
  discard: 'Сыгранные карты. Когда колода кончится, сброс перемешается в новую колоду. Нажми, чтобы посмотреть.',
  exhaust: 'Сожжённые карты — до конца боя не вернутся. Нажми, чтобы посмотреть.',
} as const;

function PileButton({ kind, count, onClick }: { kind: 'draw' | 'discard' | 'exhaust'; count: number; onClick: () => void }) {
  return (
    <button
      className={`pile pile--${kind}`}
      data-tut={`pile-${kind}`}
      onClick={() => {
        sfx('click');
        onClick();
      }}
      data-testid={`pile-${kind}`}
      aria-label={`${PILE_LABEL[kind]}: ${count} карт`}
      {...tip(`${PILE_LABEL[kind]}: ${count}`, PILE_TIP[kind])}
    >
      <span className="pile__box">
        <Icon name={kind} size={22} />
        <span className="pile__n mono">{count}</span>
      </span>
      <span className="pile__label hud-label">{PILE_LABEL[kind]}</span>
    </button>
  );
}
