import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import type { CardInstance, CombatState, EnemyState, RunState } from '../game/engine';
import { cardStats, getEnemyDef, getLegalActions } from '../game/engine';
import { useGame } from '../game/store';
import { Card } from '../components/Card';
import { HpBar, IntentBadge, StatusRow } from '../components/Bits';
import { EnemyArt, PlayerArt, CLASS_COLOR } from '../components/UnitArt';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { TopBar } from '../components/TopBar';
import { CardGridModal } from '../components/CardGridModal';
import { fx, parseColor } from '../fx/fx';
import { sfx } from '../audio/sfx';
import { hash } from '../ui/rand';

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
    return { name: d.name, tier: d.tier, moveName: d.moves.find((m) => m.id === e.intent.moveId)?.name };
  } catch {
    return { name: e.defId, tier: 'normal' as const, moveName: undefined };
  }
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
  const drag = useRef<DragState | null>(null);
  const arrowRef = useRef<SVGPathElement>(null);
  const arrowSvgRef = useRef<SVGSVGElement>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
  useEffect(() => () => clearTimeout(hintTimer.current), []);

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
      sfx('select');
      setSelected(c.uid);
    },
    [combat.energy, flashHint, isTargeted, legal, play, playerPhase, selected],
  );

  // ---------- Перетаскивание ----------
  const onCardDown = (e: RPointerEvent<HTMLElement>, c: CardInstance) => {
    if (!playerPhase || e.button > 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    drag.current = { uid: c.uid, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, targeted: isTargeted(c), el };
  };

  const onCardMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 12) return;
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

  // ---------- Раскладка веером ----------
  const n = combat.hand.length;
  const compact = handW < 520;
  const cardW = compact ? Math.min(112, Math.max(88, handW / 3.25)) : Math.min(164, Math.max(120, handW / 5.6));
  const cardH = cardW * 1.4;
  const step = n > 1 ? Math.min(cardW * (compact ? 0.86 : 0.9), (handW - cardW) / (n - 1)) : 0;
  const total = step * (n - 1);
  const fanAngle = n > 1 ? Math.min(5, 28 / n) : 0;

  const hintText =
    hint ??
    (!playerPhase ? '' : selectedCard ? (selectedTargeted ? 'Выберите цель' : 'Коснитесь поля или карты ещё раз, чтобы запустить') : '');

  const player = combat.player;
  return (
    <div className={`screen combat${frozen ? ' is-frozen' : ''}${selectedTargeted ? ' is-targeting' : ''}`} style={{ '--card-w': `${cardW}px` } as CSSProperties}>
      <TopBar run={run} />
      <div className="battlefield" onClick={onFieldClick}>
        <div className="battlefield__grid" aria-hidden="true" />
        <div className={`player-zone${hoverTarget === 'play' ? ' is-drop' : ''}`}>
          <div className="unit unit--player" data-fx-target="player" style={{ '--unit-color': CLASS_COLOR[run.classId] } as CSSProperties}>
            <div className="unit__intent-spacer" />
            <div className="unit__sprite">
              <PlayerArt classId={run.classId} />
            </div>
            <div className="unit__info">
              <HpBar hp={player.hp} maxHp={player.maxHp} block={player.block} />
              <StatusRow statuses={player.statuses} />
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
                  <StatusRow statuses={e.statuses} />
                </div>
                {!dead ? (
                  <button
                    className="unit__hit"
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

      <div className="combat-hud">
        <div className="hud-left">
          <EnergyCore energy={combat.energy} max={combat.maxEnergy} />
          <PileButton kind="draw" count={combat.drawPile.length} onClick={() => setPile('draw')} />
        </div>
        <div className="hud-hint" aria-live="polite">
          {hintText}
        </div>
        <div className="hand" ref={handRef} style={{ height: cardH + (compact ? 4 : 10) }} aria-label="Рука">
          {combat.hand.map((c, i) => {
            const off = i - (n - 1) / 2;
            const x = handW / 2 - total / 2 + i * step - cardW / 2;
            // Веер: крайние карты слегка ниже, но не за краем экрана
            const y = Math.abs(off) * Math.abs(off) * (compact ? 1.2 : 2.4) - (compact ? 4 : 10);
            const isSel = selected === c.uid;
            const playable = legal.has(c.uid);
            const style = {
              '--x': `${x}px`,
              '--y': `${y}px`,
              '--r': `${off * fanAngle}deg`,
              zIndex: isSel || dragUid === c.uid ? 40 : 10 + i,
            } as CSSProperties;
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
                onPointerCancel={() => endDrag(false)}
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

      {pile === 'draw' ? <CardGridModal title="Стопка добора" cards={combat.drawPile} onClose={() => setPile(null)} empty="Стопка пуста — сброс перемешается" /> : null}
      {pile === 'discard' ? <CardGridModal title="Сброс" cards={[...combat.discardPile].reverse()} sorted={false} onClose={() => setPile(null)} /> : null}
      {pile === 'exhaust' ? <CardGridModal title="Сгоревшие" cards={combat.exhaustPile} onClose={() => setPile(null)} empty="Ничего не сгорело" /> : null}
    </div>
  );
}

function EnergyCore({ energy, max }: { energy: number; max: number }) {
  return (
    <div className={`energy${energy === 0 ? ' is-empty' : ''}`} tabIndex={0} aria-label={`Энергия ${energy} из ${max}`} {...tip('Энергия ядра', `${energy} из ${max}. Тратится на запуск программ, восстанавливается каждый ход.`)}>
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
    </div>
  );
}

const PILE_LABEL = { draw: 'Добор', discard: 'Сброс', exhaust: 'Сгорело' } as const;

function PileButton({ kind, count, onClick }: { kind: 'draw' | 'discard' | 'exhaust'; count: number; onClick: () => void }) {
  return (
    <button
      className={`pile pile--${kind}`}
      onClick={() => {
        sfx('click');
        onClick();
      }}
      aria-label={`${PILE_LABEL[kind]}: ${count}`}
      {...tip(PILE_LABEL[kind], 'Нажмите, чтобы посмотреть')}
    >
      <Icon name={kind} size={22} />
      <span className="pile__n mono">{count}</span>
    </button>
  );
}
