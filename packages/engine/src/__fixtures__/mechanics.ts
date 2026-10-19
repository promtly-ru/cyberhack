/**
 * Фикстуры новых механик: обычный тестовый контент + новые статусы и тестовые карты с новыми эффектами.
 * Карты редкости 'special' — не попадают в награды и магазин (не сдвигают ГСЧ существующих тестов).
 */
import type { ContentData } from '../content';
import type { CardDef, Effect, StatusDef } from '../types';
import { fixtureContent } from './content';

const NEW_STATUSES: StatusDef[] = [
  { id: 'echo', name: 'Эхо', description: '', kind: 'buff', stacking: 'intensity' },
  { id: 'barrier', name: 'Барьер', description: '', kind: 'buff', stacking: 'intensity' },
  { id: 'bleed', name: 'Утечка', description: '', kind: 'debuff', stacking: 'intensity' },
  { id: 'mark', name: 'Метка', description: '', kind: 'debuff', stacking: 'duration' },
];

function card(id: string, effects: Effect[], extra: Partial<CardDef> = {}): CardDef {
  return { id, name: id, classId: 'netrunner', type: 'skill', rarity: 'special', cost: 0, target: 'none', effects, description: id, ...extra };
}

export function mechanicsContent(): ContentData {
  const c = fixtureContent();
  c.statuses.push(...structuredClone(NEW_STATUSES));
  c.cards.push(
    card('keep_shield', [{ type: 'block', amount: 5 }], { cost: 1, retain: true }),
    card('opener', [{ type: 'damage', amount: 1 }], { type: 'attack', target: 'enemy', innate: true }),
    card('late_opener', [{ type: 'damage', amount: 1 }], { type: 'attack', target: 'enemy', upgrade: { innate: true } }),
    card('scry3', [{ type: 'scry', amount: 3 }]),
    card('reboot', [{ type: 'discard_hand_draw', amount: 1 }]),
    card('hotfix', [{ type: 'upgrade_random_hand', amount: 2 }]),
    card('gene', [{ type: 'gain_max_hp', amount: 4 }]),
    card('medkit', [{ type: 'heal_pct', amount: 50 }]),
    card('double', [{ type: 'double_next', amount: 1 }]),
    card('purify', [{ type: 'cleanse', amount: 99 }]),
    card('brew', [{ type: 'gain_potion', amount: 1, potionId: 'pot_block' }]),
    card('leak', [{ type: 'apply_status', status: 'bleed', amount: 4 }], { target: 'enemy' }),
  );
  return c;
}
