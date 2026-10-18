import { memo, useEffect, useRef, type ReactNode } from 'react';
import { tryRelicDef, tryStatusDef, type Intent } from '../game/engine';
import { hash, r2, rng } from '../ui/rand';
import { Icon, hasIcon } from './Icon';
import { tip } from './Tooltip';

// ---------- Реликвии ----------

const RELIC_RARITY_LABEL: Record<string, string> = {
  starter: 'Стартовая',
  common: 'Обычная',
  uncommon: 'Необычная',
  rare: 'Редкая',
  boss: 'Босс',
  shop: 'Магазин',
};

/** Процедурный глиф реликвии по id. */
export const RelicGlyph = memo(function RelicGlyph({ id }: { id: string }) {
  const r = rng(id);
  const h = hash(id);
  const sides = [0, 3, 4, 6, 8][h % 5] ?? 6;
  const shape =
    sides === 0 ? (
      <circle cx="16" cy="16" r="11" className="fill-deep" />
    ) : (
      <path
        className="fill-deep"
        d={
          Array.from({ length: sides }, (_, k) => {
            const a = (k / sides) * Math.PI * 2 - Math.PI / 2;
            return `${k ? 'L' : 'M'}${r2(16 + Math.cos(a) * 12)} ${r2(16 + Math.sin(a) * 12)}`;
          }).join('') + 'Z'
        }
      />
    );
  const inner: ReactNode[] = [];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const len = 3 + r() * 5;
    inner.push(<path key={i} d={`M16 16L${r2(16 + Math.cos(a) * len)} ${r2(16 + Math.sin(a) * len)}`} />);
  }
  return (
    <svg viewBox="0 0 32 32" className="relic-glyph" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {shape}
      <circle cx="16" cy="16" r={r2(3 + r() * 3)} />
      {inner}
      <circle cx="16" cy="16" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
});

export function RelicIcon({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' | 'lg' }) {
  const def = tryRelicDef(id);
  const title = def?.name ?? id;
  const text = def ? `${def.description}${def.rarity ? ` · ${RELIC_RARITY_LABEL[def.rarity] ?? ''}` : ''}` : '';
  return (
    <span className={`relic relic--${size} relic-r--${def?.rarity ?? 'common'}`} tabIndex={0} data-fx-target={`relic-${id}`} aria-label={`${title}: ${text}`} {...tip(title, text)}>
      <RelicGlyph id={id} />
    </span>
  );
}

// ---------- Статусы ----------

export function StatusRow({ statuses }: { statuses: Record<string, number> }) {
  const entries = Object.entries(statuses).filter(([, v]) => v !== 0);
  if (!entries.length) return <div className="status-row is-empty" />;
  return (
    <div className="status-row">
      {entries.map(([id, v]) => {
        const def = tryStatusDef(id);
        const kind = def?.kind ?? (v < 0 ? 'debuff' : 'buff');
        const name = def?.name ?? id;
        const desc = def ? `${def.description}${def.stacking === 'duration' ? ` Осталось ходов: ${v}.` : ''}` : '';
        return (
          <span key={id} className={`status status--${kind}`} tabIndex={0} aria-label={`${name} ${v}`} {...tip(`${name} ${v}`, desc)}>
            <Icon name={hasIcon(id) ? id : 'status'} size={16} />
            <span className="status__n">{v}</span>
          </span>
        );
      })}
    </div>
  );
}

// ---------- HP и блок ----------

export function HpBar({ hp, maxHp, block }: { hp: number; maxHp: number; block: number }) {
  const pct = Math.max(0, Math.min(1, maxHp ? hp / maxHp : 0));
  const prevPct = useRef(pct);
  const lagRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // «Догоняющая» полоска урона без ре-рендеров React
    const el = lagRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `scaleX(${prevPct.current})`;
      void el.offsetWidth;
      el.style.transition = '';
      el.style.transform = `scaleX(${pct})`;
    }
    prevPct.current = pct;
  }, [pct]);
  return (
    <div className={`hpbar${block > 0 ? ' has-block' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp} aria-label={`HP ${hp} из ${maxHp}${block ? `, блок ${block}` : ''}`}>
      <div className="hpbar__lag" ref={lagRef} />
      <div className="hpbar__fill" style={{ transform: `scaleX(${pct})` }} />
      <div className="hpbar__ticks" />
      <span className="hpbar__text">
        {hp}/{maxHp}
      </span>
      {block > 0 ? (
        <span className="hpbar__block" {...tip(`Блок ${block}`, 'Поглощает урон до начала следующего хода.')}>
          <Icon name="block" size={18} />
          <span>{block}</span>
        </span>
      ) : null}
    </div>
  );
}

// ---------- Намерение врага ----------

const INTENT_LABEL: Record<string, string> = {
  attack: 'Атака',
  defend: 'Защита',
  buff: 'Усиление',
  debuff: 'Ослабление',
  attack_defend: 'Атака и защита',
  attack_debuff: 'Атака и ослабление',
  unknown: 'Неизвестно',
};

export function IntentBadge({ intent, moveName }: { intent: Intent; moveName?: string }) {
  const parts: string[] = intent.kind === 'attack_defend' ? ['attack', 'defend'] : intent.kind === 'attack_debuff' ? ['attack', 'debuff'] : [intent.kind];
  const hasDmg = intent.damage !== undefined;
  const times = intent.times ?? 1;
  const dmgText = hasDmg ? (times > 1 ? `${intent.damage}×${times}` : String(intent.damage)) : '';
  const label = INTENT_LABEL[intent.kind] ?? 'Неизвестно';
  const desc = hasDmg ? `Нанесёт ${intent.damage} урона${times > 1 ? ` ${times} раза (всего ${(intent.damage ?? 0) * times})` : ''}.` : 'Враг готовит действие.';
  return (
    <div className={`intent intent--${parts[0]}`} data-tut="intent" tabIndex={0} aria-label={`Намерение: ${label}. ${desc}`} {...tip(`${label}${moveName ? ` · ${moveName}` : ''}`, desc)}>
      {parts.map((p) => (
        <Icon key={p} name={p} size={22} className={`intent__icon intent__icon--${p}`} />
      ))}
      {dmgText ? <span className="intent__dmg">{dmgText}</span> : null}
    </div>
  );
}

// ---------- Модалка ----------

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
