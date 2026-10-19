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
  { id: 'syn_warrior', name: 'Путь воина', description: '+1 Разгон и 3 Контрудара в начале боя', cards: ['sm_bloodlust', 'sm_bushido'], effects: [self('strength', 1), self('thorns', 3)] },
  { id: 'syn_wall', name: 'Железная стена', description: '+10 блока и 2 Контрудара в начале боя', cards: ['sm_riposte', 'sm_ronin_stance'], effects: [{ type: 'block', amount: 10 }, self('thorns', 2)] },
  { id: 'syn_bastion', name: 'Несокрушимый бастион', description: '+4 Броня-патча в начале боя', cards: ['en_reinforce', 'en_fortress'], effects: [self('plating', 4)] },
  { id: 'syn_ram', name: 'Разгон ОЗУ', description: '+1 энергия в первый ход боя', cards: ['n_miner', 'n_ram_upgrade'], effects: [{ type: 'gain_energy', amount: 1 }] },
  // ---- Контент v3: старые классы ----
  { id: 'syn_surge', name: 'Скачок напряжения', description: '+1 энергия в первый ход и 1 Разгон в начале боя', cards: ['nr_ram_overflow', 'nr_supernova'], effects: [{ type: 'gain_energy', amount: 1 }, self('strength', 1)] },
  { id: 'syn_plague_doctor', name: 'Чумная посылка', description: 'Все враги получают 3 Вируса в начале боя', cards: ['ph_viral_load', 'ph_sleeper'], effects: [all('virus', 3)] },
  { id: 'syn_smoke_screen', name: 'Дымовая шахматка', description: 'Все враги получают 2 Лага, ты получаешь 6 блока в начале боя', cards: ['gh_smoke', 'gh_blackout'], effects: [all('weak', 2), { type: 'block', amount: 6 }] },
  { id: 'syn_marked_ghost', name: 'Меченый призрак', description: 'Все враги получают 1 Брешь, +1 карта в начале боя', cards: ['gh_hunter_mark', 'gh_shadow'], effects: [all('vulnerable', 1), { type: 'draw', amount: 1 }] },
  { id: 'syn_samurai_code', name: 'Кодекс самурая', description: '3 Контрудара в начале боя', cards: ['sm_tsuba', 'sm_counter_stance'], effects: [self('thorns', 3)] },
  { id: 'syn_iron_will', name: 'Железная воля', description: '+1 Разгон и +1 карта в начале боя', cards: ['sm_war_cry', 'sm_thousand_steps'], effects: [self('strength', 1), { type: 'draw', amount: 1 }] },
  { id: 'syn_workshop', name: 'Мастерская', description: '3 Контрудара и 1 Броня-патч в начале боя', cards: ['en_turret', 'en_slag_shield'], effects: [self('thorns', 3), self('plating', 1)] },
  { id: 'syn_foundry', name: 'Литейный цех', description: '+2 Разгона и 8 блока в начале боя', cards: ['en_siege_cannon', 'en_overhaul'], effects: [self('strength', 2), { type: 'block', amount: 8 }] },
  { id: 'syn_transfusion', name: 'Полное переливание', description: '3 Самовосстановления в начале боя', cards: ['bh_panacea', 'bh_suture'], effects: [self('regen', 3)] },
  { id: 'syn_mutagen', name: 'Мутаген', description: '+2 Разгона в начале боя', cards: ['bh_hormones', 'bh_chimera_blood'], effects: [self('strength', 2)] },
  // ---- Новые классы ----
  { id: 'syn_hangar', name: 'Ангар', description: '+1 Разгон и 2 Дрона-щита в руке в начале боя', cards: ['dr_swarm_launch', 'dr_aegis_drone'], effects: [self('strength', 1), { type: 'add_card', cardId: 'dr_t_shield', to: 'hand', count: 2 }] },
  { id: 'syn_hive_mind', name: 'Рой-интеллект', description: '+2 Разгона в начале боя', cards: ['dr_control_net', 'dr_overclock_drones'], effects: [self('strength', 2)] },
  { id: 'syn_time_debt', name: 'Долг времени', description: '+1 энергия в первый ход и +1 карта в начале боя', cards: ['ch_loan', 'ch_debt_shot'], effects: [{ type: 'gain_energy', amount: 1 }, { type: 'draw', amount: 1 }] },
  { id: 'syn_time_pocket', name: 'Временной карман', description: 'Все враги получают 2 Лага в начале боя', cards: ['ch_pause', 'ch_freeze_frame'], effects: [all('weak', 2)] },
];

/** Активные синергии для набора defId карт колоды. */
export function getActiveSynergies(deckDefIds: readonly string[]): SynergyDef[] {
  const have = new Set(deckDefIds);
  return SYNERGIES.filter((s) => s.cards.every((id) => have.has(id)));
}
