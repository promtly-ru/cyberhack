import { memo, useEffect, useRef, type ReactNode } from 'react';
import { cardStats, firmwareProgress, getActiveSynergies, getFirmware, tryRelicDef, tryStatusDef, type Intent } from '../game/engine';
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

export function StatusRow({ statuses, labeled = false }: { statuses: Record<string, number>; labeled?: boolean }) {
  const entries = Object.entries(statuses).filter(([, v]) => v !== 0);
  if (!entries.length) return <div className="status-row is-empty" />;
  return (
    <div className={`status-row${labeled ? " status-row--labeled" : ""}`}>
      {entries.map(([id, v]) => {
        const def = tryStatusDef(id);
        const kind = def?.kind ?? (v < 0 ? 'debuff' : 'buff');
        const name = def?.name ?? id;
        const desc = def ? `${def.description}${def.stacking === 'duration' ? ` Осталось ходов: ${v}.` : ''}` : '';
        return (
          <span key={id} className={`status status--${kind}`} tabIndex={0} aria-label={`${name} ${v}`} {...tip(`${name} ${v}`, desc)}>
            <Icon name={hasIcon(id) ? id : 'status'} size={16} />
            {labeled ? <span className="status__name">{name}</span> : null}
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
    <div className={`hpbar${block > 0 ? ' has-block' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp} aria-label={`Здоровье ${hp} из ${maxHp}${block ? `, блок ${block}` : ''}`}>
      <div className="hpbar__lag" ref={lagRef} />
      <div className="hpbar__fill" style={{ transform: `scaleX(${pct})` }} />
      <div className="hpbar__ticks" />
      <span className="hpbar__text">
        {hp}/{maxHp}
      </span>
      {block > 0 ? (
        <span className="hpbar__block" data-testid="block-badge" aria-hidden="true" {...tip(`Блок ${block}`, `Поглотит ${block} урона вместо здоровья. Пропадает в начале следующего хода.`)}>
          <Icon name="block" size={14} />
          <span>{block}</span>
        </span>
      ) : null}
    </div>
  );
}

// ---------- Намерение врага ----------

/** Короткая подпись намерения под значком (видимая). */
const INTENT_LABEL: Record<string, string> = {
  attack: 'Атака',
  defend: 'Защита',
  buff: 'Усиление',
  debuff: 'Ослабит тебя',
  attack_defend: 'Атака + защита',
  attack_debuff: 'Атака + ослабит',
  unknown: 'Неизвестно',
};

/** Что значит намерение — для подсказки и скринридера. */
const INTENT_DESC: Record<string, string> = {
  attack: '',
  defend: 'Враг поставит себе блок.',
  buff: 'Враг усилит себя.',
  debuff: 'Враг наложит на тебя ослабление.',
  attack_defend: 'Ещё поставит себе блок.',
  attack_debuff: 'Ещё наложит на тебя ослабление.',
  unknown: 'Неясно, что сделает враг.',
};

/** Текст намерения из данных движка: «Атака 6», «Атака 3×2», «Защита»… */
export function intentText(intent: Intent): { label: string; value: string; desc: string } {
  const times = intent.times ?? 1;
  const hasDmg = intent.damage !== undefined;
  const value = hasDmg ? (times > 1 ? `${intent.damage}×${times}` : String(intent.damage)) : '';
  const label = INTENT_LABEL[intent.kind] ?? 'Неизвестно';
  const dmg = hasDmg ? `Нанесёт тебе ${intent.damage} урона${times > 1 ? ` ${times} раза (всего ${(intent.damage ?? 0) * times})` : ''}.` : '';
  const desc = [dmg, INTENT_DESC[intent.kind] ?? ''].filter(Boolean).join(' ') || 'Враг готовит действие.';
  return { label, value, desc };
}

export function IntentBadge({ intent, moveName }: { intent: Intent; moveName?: string }) {
  const parts: string[] = intent.kind === 'attack_defend' ? ['attack', 'defend'] : intent.kind === 'attack_debuff' ? ['attack', 'debuff'] : [intent.kind];
  const { label, value, desc } = intentText(intent);
  const full = `${label}${value ? ` ${value}` : ''}`;
  return (
    <div className={`intent intent--${parts[0]}`} data-tut="intent" data-testid="intent" tabIndex={0} aria-label={`Намерение врага: ${full}. ${desc}`} {...tip(`${full}${moveName ? ` · ${moveName}` : ''}`, `${desc} Это ход врага после твоего.`)}>
      <span className="intent__main">
        {parts.map((p) => (
          <Icon key={p} name={p} size={20} className={`intent__icon intent__icon--${p}`} />
        ))}
        {value ? <span className="intent__dmg">{value}</span> : null}
      </span>
      <span className="intent__label">{label}</span>
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

// ---------- Синергии колоды ----------

export function SynergyBar({ deck }: { deck: readonly { defId: string }[] }) {
  const active = getActiveSynergies(deck.map((c) => c.defId));
  if (!active.length) return null;
  return (
    <div className="synergy-bar" aria-label="Активные синергии">
      {active.map((s) => (
        <span key={s.id} className="synergy" tabIndex={0} {...tip(`★ ${s.name}`, `${s.description}. Нужны карты: ${s.cards.map((id) => cardName(id)).join(' + ')}.`)}>
          ★ {s.name}
        </span>
      ))}
    </div>
  );
}

function cardName(id: string): string {
  try {
    return cardStats(id, false).name;
  } catch {
    return id;
  }
}

// ---------- Прошивки ----------

/** Подпись «что нужно собрать» для прошивки: ✓ есть в колоде, ✗ нет. */
export function firmwareNeeds(firmwareId: string, deck: readonly { defId: string }[]): string {
  const fw = getFirmware(firmwareId);
  if (!fw) return '';
  const have = new Set(deck.map((c) => c.defId));
  return fw.needs.map((id) => `${have.has(id) ? '✓' : '✗'} ${cardName(id)}`).join(' · ');
}

export function FirmwareBar({ firmwares, deck }: { firmwares: readonly string[]; deck: readonly { defId: string }[] }) {
  if (!firmwares.length) return null;
  const ids = deck.map((c) => c.defId);
  return (
    <div className="firmware-bar" aria-label="Прошивки">
      <span className="topbar__relics-label" aria-hidden="true">
        Прошивки
      </span>
      {firmwares.map((id) => {
        const fw = getFirmware(id);
        if (!fw) return null;
        const { missing } = firmwareProgress(fw, ids);
        const active = missing.length === 0;
        return (
          <span
            key={id}
            className={`firmware${active ? ' is-active' : ' is-idle'}`}
            tabIndex={0}
            aria-label={`${fw.name}: ${active ? 'активна' : `не хватает карт: ${missing.length}`}`}
            {...tip(`${active ? '⚡' : '○'} ${fw.name}`, `${fw.description}. ${active ? 'Активна!' : 'Не активна: собери все карты.'} ${firmwareNeeds(id, deck)}`)}
          >
            {active ? '⚡' : '○'} {fw.name}
            {!active ? <small>{fw.needs.length - missing.length}/{fw.needs.length}</small> : null}
          </span>
        );
      })}
    </div>
  );
}
