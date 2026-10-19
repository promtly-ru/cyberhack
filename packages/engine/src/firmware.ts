/**
 * Прошивки: редкие модули, которые выпадают с элит, боссов и иногда с обычных боёв.
 * Прошивка работает, только если в колоде собраны все её особые карты.
 */
import { getContent } from './content';
import type { Effect, RunState } from './types';

export interface FirmwareDef {
  id: string;
  name: string;
  /** Что даёт, когда активна */
  description: string;
  /** Класс, для которого прошивка полезна ('neutral' — всем) */
  classId: string;
  /** Карты (defId), которые все должны лежать в колоде */
  needs: string[];
  trigger: 'combat_start' | 'turn_start';
  effects: Effect[];
}

const self = (status: string, amount: number): Effect => ({ type: 'apply_status', status, amount, target: 'self' });
const all = (status: string, amount: number): Effect => ({ type: 'apply_status', status, amount, target: 'all_enemies' });

export const FIRMWARES: readonly FirmwareDef[] = [
  { id: 'fw_overdrive', name: 'Оверклок-прошивка', description: '+1 энергия каждый ход', classId: 'netrunner', needs: ['nr_overclock', 'nr_redline', 'nr_afterburn'], trigger: 'turn_start', effects: [{ type: 'gain_energy', amount: 1 }] },
  { id: 'fw_meltdown', name: 'Тепловой взрыв', description: 'В начале боя все враги получают 2 Бреши и 2 Лага', classId: 'netrunner', needs: ['nr_meltdown', 'nr_overheat', 'nr_coolant'], trigger: 'combat_start', effects: [all('vulnerable', 2), all('weak', 2)] },
  { id: 'fw_plague', name: 'Чумной вектор', description: 'В начале боя все враги получают 8 Вируса', classId: 'phreaker', needs: ['ph_epidemic', 'ph_patient_zero', 'ph_zombie_net'], trigger: 'combat_start', effects: [all('virus', 8)] },
  { id: 'fw_spore', name: 'Споровый рой', description: 'Каждый ход все враги получают 2 Вируса', classId: 'phreaker', needs: ['ph_net_worm', 'ph_spread', 'ph_mass_mailer'], trigger: 'turn_start', effects: [all('virus', 2)] },
  { id: 'fw_ghostly', name: 'Призрачный протокол', description: 'Каждый ход +1 карта и 4 блока', classId: 'ghost', needs: ['gh_zero_click', 'gh_phase_shift', 'gh_slipstream'], trigger: 'turn_start', effects: [{ type: 'draw', amount: 1 }, { type: 'block', amount: 4 }] },
  { id: 'fw_nullfield', name: 'Нулевое поле', description: 'В начале боя +3 Шифрования и +2 Броня-патча', classId: 'ghost', needs: ['gh_quantum', 'gh_zero_trace', 'gh_encrypt'], trigger: 'combat_start', effects: [self('dexterity', 3), self('plating', 2)] },
  { id: 'fw_bushido', name: 'Кодекс бусидо', description: 'Каждый ход +1 Разгон', classId: 'samurai', needs: ['sm_bushido', 'sm_bloodlust', 'sm_execute'], trigger: 'turn_start', effects: [self('strength', 1)] },
  { id: 'fw_hundred', name: 'Сто клинков', description: 'В начале боя +3 Разгона и 4 Контрудара', classId: 'samurai', needs: ['sm_hundred_cuts', 'sm_twin_cut', 'sm_whirlwind'], trigger: 'combat_start', effects: [self('strength', 3), self('thorns', 4)] },
  { id: 'fw_citadel', name: 'Цитадель', description: 'Каждый ход +6 блока и +1 Броня-патч', classId: 'engineer', needs: ['en_fortress', 'en_reinforce', 'en_hardlight'], trigger: 'turn_start', effects: [{ type: 'block', amount: 6 }, self('plating', 1)] },
  { id: 'fw_forge', name: 'Горн', description: 'В начале боя +2 энергии на первый ход и +2 Разгона', classId: 'engineer', needs: ['en_reactor', 'en_railgun', 'en_overcharge'], trigger: 'combat_start', effects: [{ type: 'gain_energy', amount: 2 }, self('strength', 2)] },
  { id: 'fw_biosync', name: 'Биосинхронизатор', description: 'Каждый ход восстанавливает 2 HP', classId: 'biohacker', needs: ['bh_symbiote', 'bh_regen_matrix', 'bh_blood_pact'], trigger: 'turn_start', effects: [{ type: 'heal', amount: 2 }] },
  { id: 'fw_overgrowth', name: 'Перерождение', description: 'В начале боя +4 Самовосстановления и +2 Разгона', classId: 'biohacker', needs: ['bh_overgrowth', 'bh_adrenaline', 'bh_mutation'], trigger: 'combat_start', effects: [self('regen', 4), self('strength', 2)] },
  { id: 'fw_miner', name: 'Майнинг-ферма', description: 'Каждый ход +1 карта', classId: 'neutral', needs: ['n_miner', 'n_ram_upgrade', 'n_debugger'], trigger: 'turn_start', effects: [{ type: 'draw', amount: 1 }] },
  { id: 'fw_siege', name: 'Осадный набор', description: 'В начале боя все враги получают 3 Лага и 3 Бреши', classId: 'neutral', needs: ['n_mass_scan', 'n_ddos_kit', 'n_buffer_overflow'], trigger: 'combat_start', effects: [all('weak', 3), all('vulnerable', 3)] },
];

export function getFirmware(id: string): FirmwareDef | undefined {
  return FIRMWARES.find((f) => f.id === id);
}

/** Какие карты из требований прошивки есть в колоде. */
export function firmwareProgress(fw: FirmwareDef, deckDefIds: readonly string[]): { have: string[]; missing: string[] } {
  const set = new Set(deckDefIds);
  return { have: fw.needs.filter((id) => set.has(id)), missing: fw.needs.filter((id) => !set.has(id)) };
}

export function isFirmwareActive(fw: FirmwareDef, deckDefIds: readonly string[]): boolean {
  return firmwareProgress(fw, deckDefIds).missing.length === 0;
}

/** Прошивки, которые можно выдать: свой класс или нейтральные, ещё не полученные, все карты существуют в контенте. */
export function rollableFirmwares(s: Pick<RunState, 'classId' | 'firmwares'>): FirmwareDef[] {
  const cards = getContent().cards;
  const owned = new Set(s.firmwares ?? []);
  return FIRMWARES.filter(
    (f) => !owned.has(f.id) && (f.classId === s.classId || f.classId === 'neutral') && f.needs.every((id) => cards.has(id)),
  );
}
