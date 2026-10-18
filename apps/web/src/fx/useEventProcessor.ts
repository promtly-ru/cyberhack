import { useEffect } from 'react';
import { useGame } from '../game/store';
import { tryStatusDef, type GameEvent } from '../game/engine';
import { sfx } from '../audio/sfx';
import { animScale, isReducedMotion } from '../ui/settings';
import { fx, parseColor, type Rect } from './fx';

/** Пауза перед событием (мс при скорости 1×). */
function gap(ev: GameEvent): number {
  switch (ev.type) {
    case 'card_played':
      return 0;
    case 'damage':
      return 110;
    case 'block_gained':
      return 70;
    case 'status_applied':
      return 90;
    case 'heal':
      return 80;
    case 'enemy_died':
      return 140;
    case 'enemy_move':
      return 380;
    case 'relic_triggered':
      return 100;
    case 'turn_started':
      return 260;
    case 'combat_won':
    case 'combat_lost':
      return 250;
    default:
      return 0;
  }
}

function target(uid: string): HTMLElement | null {
  if (uid === 'player') {
    return document.querySelector<HTMLElement>('[data-fx-target="player"]') ?? document.querySelector<HTMLElement>('[data-fx-target="player-hp"]');
  }
  return document.querySelector<HTMLElement>(`[data-fx-target="${CSS.escape(uid)}"]`);
}

function spriteRect(el: HTMLElement): Rect {
  const s = el.querySelector<HTMLElement>('.unit__sprite') ?? el;
  return s.getBoundingClientRect();
}

function shake(el: Element | null, power: number): void {
  if (!el || isReducedMotion()) return;
  const p = Math.min(14, 3 + power * 0.6);
  el.animate(
    [
      { translate: '0 0' },
      { translate: `${-p}px ${p * 0.3}px` },
      { translate: `${p * 0.8}px ${-p * 0.2}px` },
      { translate: `${-p * 0.5}px 0` },
      { translate: `${p * 0.3}px 0` },
      { translate: '0 0' },
    ],
    { duration: 320 * animScale(), easing: 'ease-out' },
  );
}

function lunge(el: Element | null): void {
  if (!el || isReducedMotion()) return;
  el.animate([{ translate: '0 0' }, { translate: '-28px 4px', offset: 0.35 }, { translate: '0 0' }], { duration: 340 * animScale(), easing: 'cubic-bezier(.3,1.6,.5,1)' });
}

function pulse(el: Element | null): void {
  if (!el) return;
  el.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: '1.35', filter: 'brightness(2)' }, { scale: '1', filter: 'brightness(1)' }], { duration: 420 * animScale(), easing: 'ease-out' });
}

function handle(ev: GameEvent): void {
  switch (ev.type) {
    case 'card_played':
      sfx('card');
      break;
    case 'damage': {
      const el = target(ev.targetUid);
      const isPlayer = ev.targetUid === 'player';
      if (el) {
        fx.hit(spriteRect(el), ev.amount, ev.blocked, isPlayer);
        shake(el, ev.amount);
        if (isPlayer && ev.amount >= 8) shake(document.querySelector('.battlefield'), ev.amount * 0.5);
      }
      if (ev.amount > 0) sfx('hit', 0.6 + ev.amount / 15);
      else if (ev.blocked > 0) sfx('block');
      break;
    }
    case 'block_gained': {
      const el = target(ev.targetUid);
      if (el) fx.shield(spriteRect(el), ev.amount);
      sfx('block');
      break;
    }
    case 'status_applied': {
      const el = target(ev.targetUid);
      const def = tryStatusDef(ev.status);
      const debuff = def ? def.kind === 'debuff' : ev.amount < 0;
      if (el) fx.statusPop(spriteRect(el), `${def?.name ?? ev.status} ${ev.amount > 0 ? '+' : ''}${ev.amount}`, debuff);
      sfx(debuff ? 'debuff' : 'buff');
      break;
    }
    case 'heal': {
      const el = target(ev.targetUid);
      if (el && ev.amount > 0) fx.heal(spriteRect(el), ev.amount);
      sfx('heal');
      break;
    }
    case 'enemy_died': {
      const el = target(ev.enemyUid);
      if (el) {
        const color = parseColor(getComputedStyle(el).getPropertyValue('--unit-color'), 0xff3b5c);
        fx.disintegrate(spriteRect(el), color);
        el.dataset.gone = '1';
      }
      sfx('death');
      break;
    }
    case 'enemy_move':
      lunge(target(ev.enemyUid));
      break;
    case 'relic_triggered': {
      const el = document.querySelector(`[data-fx-target="relic-${CSS.escape(ev.relicId)}"]`);
      if (el) {
        pulse(el);
        const r = el.getBoundingClientRect();
        fx.spark(r.left + r.width / 2, r.top + r.height / 2, 0xe8ff3a);
      }
      break;
    }
    case 'turn_started':
      sfx('turn');
      break;
    case 'combat_won':
      sfx('victory');
      break;
    case 'combat_lost':
      sfx('defeat');
      break;
    default:
      break;
  }
}

/** Потребляет очередь GameEvent из стора и проигрывает эффекты последовательно. */
export function useEventProcessor(): void {
  useEffect(() => {
    let lastId = 0;
    let busyUntil = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsub = useGame.subscribe((s, prev) => {
      if (s.events === prev.events) return;
      const fresh = s.events.filter((e) => e.id > lastId);
      if (!fresh.length) return;
      lastId = fresh[fresh.length - 1]!.id;
      const now = performance.now();
      // Если игрок жмёт быстрее анимаций — не копим бесконечный хвост
      let t = Math.min(450 * animScale(), Math.max(0, busyUntil - now));
      for (const q of fresh) {
        t += gap(q.ev) * animScale();
        const timer = setTimeout(() => {
          timers.delete(timer);
          try {
            handle(q.ev);
          } catch (e) {
            console.warn('[fx] событие', q.ev.type, e);
          }
        }, t);
        timers.add(timer);
      }
      busyUntil = now + t;
      useGame.getState().consumeEvents(lastId);
    });
    return () => {
      unsub();
      timers.forEach(clearTimeout);
    };
  }, []);
}
