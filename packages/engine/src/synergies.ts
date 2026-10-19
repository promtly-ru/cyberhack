/**
 * Синергии: если в колоде одновременно лежат все перечисленные карты,
 * в начале каждого боя срабатывает бонус.
 */
import type { Effect } from './types';

export interface SynergyDef {
  id: string;
  name: string;
  description: string;
  cards: string[];
  effects: Effect[];
}

const self = (status: string, amount: number): Effect => ({ type: 'apply_status', status, amount, target: 'self' });
const all = (status: string, amount: number): Effect => ({ type: 'apply_status', status, amount, target: 'all_enemies' });

export const SYNERGIES: readonly SynergyDef[] = [
  { id: 'syn_overclock', name: 'Разгонный контур', description: '+2 Разгона в начале боя', cards: ['nr_overclock', 'nr_afterburn'], effects: [self('strength', 2)] },
  { id: 'syn_thermal', name: 'Тепловой контур', description: '+10 блока в начале боя', cards: ['nr_thermo_shield', 'nr_coolant'], effects: [{ type: 'block', amount: 10 }] },
  { id: 'syn_botfarm', name: 'Ботнет-ферма', description: 'Все враги получают 4 Вируса в начале боя', cards: ['ph_zombie_net', 'ph_botswarm'], effects: [all('virus', 4)] },
  { id: 'syn_outbreak', name: 'Вспышка', description: 'Все враги получают 6 Вируса в начале боя', cards: ['ph_epidemic', 'ph_patient_zero'], effects: [all('virus', 6)] },
  { id: 'syn_phantom', name: 'Призрачный слой', description: '+2 Шифрования и +1 карта в начале боя', cards: ['gh_phantom_swarm', 'gh_zero_trace'], effects: [self('dexterity', 2), { type: 'draw', amount: 1 }] },
  { id: 'syn_assassin', name: 'Тихий убийца', description: '+2 Разгона в начале боя', cards: ['gh_ambush', 'gh_backstab'], effects: [self('strength', 2)] },
  { id: 'syn_warrior', name: 'Путь воина', description: '+1 Разгон и 3 Шипа в начале боя', cards: ['sm_bloodlust', 'sm_bushido'], effects: [self('strength', 1), self('thorns', 3)] },
  { id: 'syn_wall', name: 'Железная стена', description: '+10 блока и 2 Шипа в начале боя', cards: ['sm_riposte', 'sm_ronin_stance'], effects: [{ type: 'block', amount: 10 }, self('thorns', 2)] },
  { id: 'syn_bastion', name: 'Несокрушимый бастион', description: '+4 Броня-патча в начале боя', cards: ['en_reinforce', 'en_fortress'], effects: [self('plating', 4)] },
  { id: 'syn_ram', name: 'Разгон ОЗУ', description: '+1 энергия в первый ход боя', cards: ['n_miner', 'n_ram_upgrade'], effects: [{ type: 'gain_energy', amount: 1 }] },
];

/** Активные синергии для набора defId карт колоды. */
export function getActiveSynergies(deckDefIds: readonly string[]): SynergyDef[] {
  const have = new Set(deckDefIds);
  return SYNERGIES.filter((s) => s.cards.every((id) => have.has(id)));
}
