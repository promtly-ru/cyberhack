/**
 * Карты: разрешение улучшений и текст описания.
 */
import { getContent } from './content';
import type { CardDef, CardType, Effect, TargetKind } from './types';

export const COST_X = -1;
export const COST_UNPLAYABLE = -2;

export interface ResolvedCard {
  def: CardDef;
  name: string;
  type: CardType;
  cost: number;
  target: TargetKind;
  effects: Effect[];
  exhaust: boolean;
  ethereal: boolean;
  /** Удержание: остаётся в руке в конце хода */
  retain: boolean;
  /** Врождённая: всегда в стартовой руке боя */
  innate: boolean;
  description: string;
}

export function cardDef(id: string): CardDef {
  const def = getContent().cards.get(id);
  if (!def) throw new Error(`Unknown card id: ${id}`);
  return def;
}

export function resolveCard(defId: string, upgraded: boolean): ResolvedCard {
  const def = cardDef(defId);
  const up = upgraded ? def.upgrade : undefined;
  return {
    def,
    name: up?.name ?? (upgraded ? `${def.name}+` : def.name),
    type: def.type,
    cost: up?.cost ?? def.cost,
    target: def.target,
    effects: up?.effects ?? def.effects,
    exhaust: up?.exhaust ?? def.exhaust ?? false,
    ethereal: def.ethereal ?? false,
    retain: up?.retain ?? def.retain ?? false,
    innate: up?.innate ?? def.innate ?? false,
    description: up?.description ?? def.description,
  };
}

export function canUpgrade(defId: string, upgraded: boolean): boolean {
  if (upgraded) return false;
  const def = getContent().cards.get(defId);
  return !!def?.upgrade;
}

/** Карта требует выбрать врага-цель. */
export function needsEnemyTarget(card: ResolvedCard): boolean {
  if (card.target === 'enemy') return true;
  return card.effects.some((e) => 'target' in e && e.target === 'enemy');
}

/** Числа для плейсхолдеров {damage}, {block}, {vulnerable} и т.п. */
function placeholderValues(effects: Effect[]): Record<string, string> {
  const vals: Record<string, string> = {};
  const setOnce = (k: string, v: number | string): void => {
    if (!(k in vals)) vals[k] = String(v);
  };
  for (const e of effects) {
    switch (e.type) {
      case 'damage':
        setOnce('damage', e.amount);
        setOnce('times', e.times ?? 1);
        break;
      case 'block':
        setOnce('block', e.amount);
        break;
      case 'apply_status':
        setOnce(e.status, e.amount);
        setOnce('status', e.amount);
        setOnce('amount', e.amount);
        break;
      case 'draw':
        setOnce('draw', e.amount);
        break;
      case 'gain_energy':
        setOnce('energy', e.amount);
        break;
      case 'heal':
        setOnce('heal', e.amount);
        break;
      case 'lose_hp':
        setOnce('hp', e.amount);
        setOnce('lose_hp', e.amount);
        break;
      case 'add_card':
        setOnce('cards', e.count ?? 1);
        setOnce('count', e.count ?? 1);
        break;
      case 'exhaust_random_hand':
        setOnce('exhaust', e.amount);
        break;
      case 'gain_gold':
        setOnce('gold', e.amount);
        break;
      case 'scry':
        setOnce('scry', e.amount);
        break;
      case 'discard_hand_draw':
        setOnce('extra', e.amount);
        break;
      case 'upgrade_random_hand':
        setOnce('upgrade', e.amount);
        break;
      case 'gain_max_hp':
        setOnce('max_hp', e.amount);
        break;
      case 'heal_pct':
        setOnce('heal_pct', e.amount);
        break;
      case 'double_next':
        setOnce('echo', e.amount);
        break;
      case 'cleanse':
        setOnce('cleanse', e.amount);
        break;
      case 'gain_potion':
        setOnce('potions', e.amount);
        break;
    }
  }
  return vals;
}

/** description (или upgrade.description для улучшенной) с подставленными числами. */
export function describeCard(defId: string, upgraded: boolean): string {
  const card = resolveCard(defId, upgraded);
  const vals = placeholderValues(card.effects);
  return card.description.replace(/\{(\w+)\}/g, (m, key: string) => vals[key] ?? m);
}
