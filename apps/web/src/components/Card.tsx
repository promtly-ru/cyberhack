import { memo, type CSSProperties, type ReactNode } from 'react';
import { cardStats, describeCard, type CardType, type Rarity } from '../game/engine';
import { CardArt } from './CardArt';
import { cardTerms, getTerm, splitKeywords } from './glossary';
import { tip } from './Tooltip';

export const TYPE_LABEL: Record<CardType, string> = {
  attack: 'Атака',
  skill: 'Навык',
  power: 'Модуль',
  status: 'Статус',
  curse: 'Проклятие',
};

/** Категория карты для цвета и подписи: вычисляется по эффектам, тип движка не меняется */
export type CardCategory = 'attack' | 'defense' | 'debuff' | 'buff' | 'resource' | 'power' | 'status' | 'curse';

export const CATEGORY_LABEL: Record<CardCategory, string> = {
  attack: 'Атака',
  defense: 'Защита',
  debuff: 'Ослабление',
  buff: 'Усиление',
  resource: 'Ресурс',
  power: 'Модуль',
  status: 'Статус',
  curse: 'Проклятие',
};

type AnyEffect = { type: string; target?: string; then?: AnyEffect[]; else?: AnyEffect[] };

function flatEffects(list: readonly AnyEffect[] = []): AnyEffect[] {
  return list.flatMap((e) => [e, ...flatEffects(e.then), ...flatEffects(e.else)]);
}

export function cardCategory(def: { type: CardType; target?: string; effects?: readonly unknown[] }): CardCategory {
  if (def.type === 'power' || def.type === 'status' || def.type === 'curse') return def.type;
  const effs = flatEffects((def.effects ?? []) as AnyEffect[]);
  const has = (...t: string[]) => effs.some((e) => t.includes(e.type));
  if (has('damage', 'consume_status')) return 'attack';
  if (has('block')) return 'defense';
  const onEnemy = effs.some((e) => (e.type === 'apply_status' || e.type === 'multiply_status') && (e.target ?? def.target) !== 'self' && (e.target ?? def.target) !== 'none');
  if (onEnemy) return 'debuff';
  if (has('apply_status', 'multiply_status', 'add_hook', 'double_next')) return 'buff';
  return def.type === 'attack' ? 'attack' : 'resource';
}

export const RARITY_LABEL: Record<Rarity, string> = {
  starter: 'Базовая',
  common: 'Обычная',
  uncommon: 'Необычная',
  rare: 'Редкая',
  special: 'Особая',
};

/** Подсветка чисел и ключевых слов в тексте карты; у ключевых слов — подсказка из словаря. */
export function formatCardText(text: string, upgraded: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  splitKeywords(text).forEach((part, i) => {
    if (typeof part !== 'string') {
      const term = getTerm(part.termId);
      out.push(
        <b key={`k${i}`} className="kw" {...(term ? tip(term.name, term.desc) : {})}>
          {part.word}
        </b>,
      );
      return;
    }
    part.split(/(\d+)/).forEach((p, j) => {
      if (!p) return;
      out.push(/^\d+$/.test(p) ? <b key={`${i}-${j}`} className={upgraded ? 'num num--up' : 'num'}>{p}</b> : p);
    });
  });
  return out;
}

/** Блок «Термины» под картой: описания всех ключевых слов этой карты (как в Slay the Spire). */
export function CardTerms({ defId, upgraded = false, compact }: { defId: string; upgraded?: boolean; compact?: boolean }) {
  const list = cardTerms(defId, upgraded, { basics: !compact });
  if (!list.length) return null;
  return (
    <div className={`card-terms${compact ? ' card-terms--compact' : ''}`} data-testid="card-terms">
      <div className="card-terms__title">Термины</div>
      <dl>
        {list.map((t) => (
          <div key={t.id} className={`card-terms__item${t.tone ? ` is-${t.tone}` : ''}`}>
            <dt>{t.name}</dt>
            <dd>{t.desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Флаги-ключевые слова карты в порядке показа. */
const FLAG_KEYWORDS = ['innate', 'retain', 'ethereal', 'exhaust'] as const;

/**
 * Плашки ключевых слов (Врождённая, Удержание, Эфемерная, Сжигается) — только те, что заданы флагами карты,
 * но не упомянуты в её тексте (чтобы не дублировать).
 */
function CardKeywords({ stats, text }: { stats: ReturnType<typeof cardStats>; text: string }) {
  const inText = new Set(splitKeywords(text).flatMap((p) => (typeof p === 'string' ? [] : [p.termId])));
  const ids = FLAG_KEYWORDS.filter((id) => stats[id] && !inText.has(id));
  if (!ids.length) return null;
  return (
    <span className="card__keywords" data-testid="card-keywords">
      {ids.map((id) => {
        const term = getTerm(id);
        return (
          <b key={id} className={`kw card__kw card__kw--${id}`} {...(term ? tip(term.name, term.desc) : {})}>
            {term?.name ?? id}
          </b>
        );
      })}
    </span>
  );
}

export interface CardProps {
  defId: string;
  upgraded?: boolean;
  className?: string;
  style?: CSSProperties;
  /** false — стоимость подсвечивается как недоступная */
  playable?: boolean;
  /** Компактный режим без нижней строки типа (для мелких превью) */
  compact?: boolean;
}

export const Card = memo(function Card({ defId, upgraded = false, className, style, playable = true, compact }: CardProps) {
  let stats;
  let text: string;
  try {
    stats = cardStats(defId, upgraded);
    text = describeCard(defId, upgraded);
  } catch {
    return (
      <div className={`card card--status ${className ?? ''}`} style={style}>
        <div className="card__frame">
          <div className="card__name">???</div>
          <div className="card__text">Неизвестная программа «{defId}»</div>
        </div>
      </div>
    );
  }
  const { def, name, cost } = stats;
  const cls = [
    'card',
    `card--${def.type}`,
    `cat--${cardCategory(def)}`,
    `rarity--${def.rarity}`,
    `card-cls--${def.classId}`,
    upgraded ? 'is-upgraded' : '',
    playable ? '' : 'is-unplayable',
    compact ? 'is-compact' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const costLabel = cost === -1 ? 'X' : cost <= -2 ? null : String(cost);
  const costChanged = upgraded && def.upgrade?.cost !== undefined && def.upgrade.cost !== def.cost;
  return (
    <div className={cls} style={style} aria-label={`${name}${upgraded ? '+' : ''}, ${TYPE_LABEL[def.type]} (${CATEGORY_LABEL[cardCategory(def)].toLowerCase()}), стоимость ${costLabel ?? 'нет'}. ${text}`}>
      <div className="card__frame">
        <div className="card__glow" aria-hidden="true" />
        <div className="card__art">
          <CardArt id={def.id} upgraded={upgraded} />
        </div>
        <div className={`card__name${longestWord(name) >= 16 ? ' is-xlong' : longestWord(name) >= 12 ? ' is-long' : ''}`}>
          <span>{name}</span>
          {upgraded ? <span className="card__plus">+</span> : null}
        </div>
        <div className="card__type">
          <span>{CATEGORY_LABEL[cardCategory(def)]}</span>
          <span className="card__rarity">{RARITY_LABEL[def.rarity]}</span>
        </div>
        <div className="card__text">
          <span>{formatCardText(text, upgraded)}</span>
          <CardKeywords stats={stats} text={text} />
        </div>
        <div className="card__corner" aria-hidden="true" />
      </div>
      {costLabel !== null ? <div className={`card__cost${costChanged ? ' is-changed' : ''}`}>{costLabel}</div> : null}
    </div>
  );
});

function longestWord(s: string): number {
  return s.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
}
