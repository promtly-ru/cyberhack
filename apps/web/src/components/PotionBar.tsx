import { useEffect, useRef, useState } from 'react';
import { canUsePotionNow, getEnemyDef, getPotion, POTION_SLOTS, type PotionDef, type RunState } from '../game/engine';
import { useGame } from '../game/store';
import { sfx } from '../audio/sfx';
import { Icon } from './Icon';
import { tip } from './Tooltip';

const KIND_LABEL: Record<PotionDef['kind'], string> = {
  heal: 'Лечение',
  defense: 'Защита',
  offense: 'Атака',
  utility: 'Утилита',
};

function enemyName(defId: string): string {
  try {
    return getEnemyDef(defId).name;
  } catch {
    return defId;
  }
}

/** Иконка расходника (общая для наград, магазина и панели). */
export function PotionGlyph({ id, size = 18 }: { id: string; size?: number }) {
  const p = getPotion(id);
  return (
    <span className={`potion-glyph potion--${p?.kind ?? 'utility'}`} aria-hidden="true">
      <Icon name="potion" size={size} />
    </span>
  );
}

/**
 * Слоты расходников («Модули-инъекции»). Нажатие на слот открывает меню: выпить (в бою — с выбором цели
 * для расходников на врага; вне боя — только лечебные) или выбросить.
 */
export function PotionBar({ run }: { run: RunState }) {
  const dispatch = useGame((s) => s.dispatch);
  const [open, setOpen] = useState<{ slot: number; x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const potions = run.potions ?? [];
  const combat = run.screen.kind === 'combat' ? run.combat : null;

  // Слот опустел или сменился экран — закрыть меню
  const openId = open ? potions[open.slot] : undefined;
  useEffect(() => {
    if (open && !openId) setOpen(null);
  }, [open, openId]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !rootRef.current?.contains(e.target)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(null);
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const use = (slot: number, p: PotionDef, targetUid?: string) => {
    const ok = dispatch({ type: 'use_potion', slot, ...(targetUid ? { targetUid } : {}) });
    sfx(ok ? (p.kind === 'heal' ? 'heal' : p.kind === 'offense' ? 'debuff' : 'buff') : 'error');
    setOpen(null);
  };
  const discard = (slot: number) => {
    sfx('click');
    dispatch({ type: 'discard_potion', slot });
    setOpen(null);
  };

  const menuPotion = open && openId ? getPotion(openId) : undefined;
  const usable = open && openId ? canUsePotionNow(run, openId) : false;
  const targets = combat ? combat.enemies.filter((e) => e.hp > 0) : [];

  return (
    <div className="potion-bar" ref={rootRef} aria-label="Расходники" data-testid="potion-bar">
      <span className="topbar__relics-label" aria-hidden="true">
        Расходники
      </span>
      {Array.from({ length: POTION_SLOTS }, (_, slot) => {
        const id = potions[slot];
        const p = id ? getPotion(id) : undefined;
        if (!id || !p) {
          return (
            <span key={slot} className="potion-slot is-empty" tabIndex={0} aria-label="Пустой слот расходника" {...tip('Пустой слот', `Расходники выпадают после боёв и продаются на чёрном рынке. Слотов: ${POTION_SLOTS}.`)}>
              <Icon name="slot" size={16} />
            </span>
          );
        }
        const can = canUsePotionNow(run, id);
        return (
          <button
            key={slot}
            className={`potion-slot potion--${p.kind}${can ? ' is-usable' : ''}${open?.slot === slot ? ' is-open' : ''}`}
            data-testid="potion-slot"
            data-potion={id}
            aria-haspopup="menu"
            aria-expanded={open?.slot === slot}
            aria-label={`${p.name}: ${p.description}`}
            {...tip(`${p.name} · ${KIND_LABEL[p.kind]}`, `${p.description}${can ? ' Нажми, чтобы выпить или выбросить.' : ' Сейчас выпить нельзя — только в бою.'}`)}
            onClick={(e) => {
              sfx('click');
              if (open?.slot === slot) return setOpen(null);
              const r = e.currentTarget.getBoundingClientRect();
              // Меню шириной min(280, vw−32) по центру слота, но не за краем экрана
              const vw = window.innerWidth;
              const half = Math.min(280, vw - 32) / 2;
              const x = Math.max(half + 8, Math.min(vw - half - 8, r.left + r.width / 2));
              setOpen({ slot, x, y: r.bottom + 6 });
            }}
          >
            <Icon name="potion" size={18} />
          </button>
        );
      })}
      {open && menuPotion ? (
        <div className="potion-menu" role="menu" aria-label={menuPotion.name} data-testid="potion-menu" style={{ left: open.x, top: open.y }}>
          <div className="potion-menu__head">
            <b>{menuPotion.name}</b>
            <small>{menuPotion.description}</small>
          </div>
          {usable && combat && menuPotion.target === 'enemy' ? (
            targets.map((e, i) => {
              // Одинаковые враги различаются номером слева направо
              const dup = targets.filter((t) => t.defId === e.defId).length > 1;
              return (
                <button key={e.uid} role="menuitem" className="potion-menu__item is-use" data-testid="potion-use" onClick={() => use(open.slot, menuPotion, e.uid)}>
                  <Icon name="attack" size={14} /> Выпить → {enemyName(e.defId)}
                  {dup ? ` №${i + 1}` : ''} <span className="mono dim">{e.hp} HP</span>
                </button>
              );
            })
          ) : usable ? (
            <button role="menuitem" className="potion-menu__item is-use" data-testid="potion-use" onClick={() => use(open.slot, menuPotion)}>
              <Icon name="check" size={14} /> Выпить
            </button>
          ) : (
            <p className="potion-menu__note">Этот расходник работает только в бою.</p>
          )}
          <button role="menuitem" className="potion-menu__item is-discard" data-testid="potion-discard" onClick={() => discard(open.slot)}>
            <Icon name="trash" size={14} /> Выбросить
          </button>
        </div>
      ) : null}
    </div>
  );
}
