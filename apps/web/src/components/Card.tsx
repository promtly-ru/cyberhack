import { memo, type CSSProperties, type ReactNode } from 'react';
import { cardStats, describeCard, type CardType, type Rarity } from '../game/engine';
import { CardArt } from './CardArt';

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

const KEYWORDS = /(Сгорает|ВСЕМ|Неиграбельна|Эфемерна|Вируса?|Уязвимост[ьи]|Слабост[ьи]|Разгона?|Отклика?|Хрупкост[ьи]|Обратного трейса|Самовосстановления)/;

/** Подсветка чисел и ключевых слов в тексте карты. */
export function formatCardText(text: string, upgraded: boolean): ReactNode[] {
  const parts = text.split(/(\d+|Сгорает|ВСЕМ|Неиграбельна|Эфемерна|Вируса?|Уязвимост[ьи]|Слабост[ьи]|Разгона?|Отклика?|Хрупкост[ьи]|Обратного трейса|Самовосстановления)/);
  return parts.map((p, i) => {
    if (/^\d+$/.test(p)) return <b key={i} className={upgraded ? 'num num--up' : 'num'}>{p}</b>;
    if (KEYWORDS.test(p) && p.length > 0) return <b key={i} className="kw">{p}</b>;
    return p;
  });
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
  let text = '';
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
