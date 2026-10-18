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
    `rarity--${def.rarity}`,
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
    <div className={cls} style={style} aria-label={`${name}${upgraded ? '+' : ''}, ${TYPE_LABEL[def.type]}, стоимость ${costLabel ?? 'нет'}. ${text}`}>
      <div className="card__frame">
        <div className="card__glow" aria-hidden="true" />
        <div className="card__art">
          <CardArt id={def.id} />
        </div>
        <div className="card__name">
          <span>{name}</span>
          {upgraded ? <span className="card__plus">+</span> : null}
        </div>
        <div className="card__type">
          <span>{TYPE_LABEL[def.type]}</span>
          <span className="card__rarity">{RARITY_LABEL[def.rarity]}</span>
        </div>
        <div className="card__text">
          <span>{formatCardText(text, upgraded)}</span>
        </div>
        <div className="card__corner" aria-hidden="true" />
      </div>
      {costLabel !== null ? <div className={`card__cost${costChanged ? ' is-changed' : ''}`}>{costLabel}</div> : null}
    </div>
  );
});
