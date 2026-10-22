/**
 * Прошивки: редкие модули, которые выпадают с элит, боссов и иногда с обычных боёв.
 *
 * В забеге: 3/3 карт из needs в колоде — полный бонус; 2/3 — ослабленный (половина чисел,
 * без энергии/добора/создания карт; если ничего не осталось — немного блока); меньше — не работает.
 *
 * Мета-прогресс (как у карт в коллекционках): у прошивки есть тип, редкость и уровень 1..MAX.
 * Дубликаты дают копии, копии тратятся на улучшение. Чем выше редкость, тем сильнее рост эффекта
 * и тем больше копий нужно. Все пороги и множители — в FIRMWARE_RARITY_CONFIG.
 */
import { getContent } from './content';
import type { Effect, RunState } from './types';

export type FirmwareTrigger = 'combat_start' | 'turn_start' | 'turn_end';

/** 0 — не активна, 1 — частично (2/3), 2 — полностью (3/3) */
export type FirmwareLevel = 0 | 1 | 2;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type FirmwareType = 'attack' | 'defense' | 'economy' | 'utility' | 'combo';

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Уровень мета-прогресса: copiesNeeded — сколько копий потратить, чтобы получить этот уровень (у 1-го — 0). */
export interface FirmwareLevelDef {
  copiesNeeded: number;
  /** Эффекты прошивки на этом уровне (полный бонус 3/3) */
  effect: readonly Effect[];
}

export interface FirmwareDef {
  id: string;
  name: string;
  /** Что даёт, когда активна (= description; поле по контракту данных) */
  desc: string;
  /** Что даёт, когда активна */
  description: string;
  type: FirmwareType;
  rarity: Rarity;
  /** Имя иконки (components/Icon.tsx) */
  icon: string;
  /** id ачивки, которая открывает прошивку; нет — открыта с начала */
  unlock?: string;
  /** Уровни 1..MAX_FIRMWARE_LEVEL (индекс 0 — уровень 1) */
  levels: readonly FirmwareLevelDef[];
  /** Класс, для которого прошивка полезна ('neutral' — всем) */
  classId: string;
  /** Карты (defId), которые все должны лежать в колоде */
  needs: string[];
  trigger: FirmwareTrigger;
  /** Базовые эффекты (уровень 1) */
  effects: Effect[];
}

// ---------------- Конфиг редкостей (единственное место с порогами и множителями) ----------------

export const MAX_FIRMWARE_LEVEL = 4;

export interface RarityConfig {
  /** Вес в наградах «1 из 3» и в дропе забега */
  weight: number;
  /** Копий на переход к уровню 1..MAX (первый — 0: получение) */
  copies: readonly number[];
  /** Множитель эффектов на уровне 1..MAX */
  mult: readonly number[];
}

export const FIRMWARE_RARITY_CONFIG: Readonly<Record<Rarity, RarityConfig>> = {
  common: { weight: 50, copies: [0, 2, 3, 5], mult: [1, 1.15, 1.3, 1.5] },
  uncommon: { weight: 28, copies: [0, 3, 4, 6], mult: [1, 1.2, 1.4, 1.7] },
  rare: { weight: 14, copies: [0, 4, 5, 8], mult: [1, 1.25, 1.5, 1.9] },
  epic: { weight: 6, copies: [0, 5, 7, 10], mult: [1, 1.3, 1.65, 2.1] },
  legendary: { weight: 2, copies: [0, 6, 9, 12], mult: [1, 1.35, 1.8, 2.5] },
};

const TYPE_ICON: Record<FirmwareType, string> = {
  attack: 'strength',
  defense: 'block',
  economy: 'draw',
  utility: 'chip',
  combo: 'firmware',
};

/** Эффекты, умноженные на mult: числа — округление, энергия/добор/карты — вниз (не меньше 1). */
export function scaleEffects(effects: readonly Effect[], mult: number): Effect[] {
  if (mult === 1) return effects.map((e) => ({ ...e }));
  return effects.map((e): Effect => {
    switch (e.type) {
      case 'apply_status':
      case 'block':
      case 'heal':
        return { ...e, amount: Math.max(1, Math.round(e.amount * mult)) };
      case 'draw':
      case 'gain_energy':
        return { ...e, amount: Math.max(1, Math.floor(e.amount * mult)) };
      case 'add_card':
        return { ...e, count: Math.max(1, Math.floor((e.count ?? 1) * mult)) };
      default:
        return { ...e };
    }
  });
}

function buildLevels(rarity: Rarity, effects: readonly Effect[]): FirmwareLevelDef[] {
  const cfg = FIRMWARE_RARITY_CONFIG[rarity];
  return cfg.copies.map((copiesNeeded, i) => ({ copiesNeeded, effect: i === 0 ? effects : scaleEffects(effects, cfg.mult[i] ?? 1) }));
}

// ---------------- Данные ----------------

type RawFirmware = Pick<FirmwareDef, 'id' | 'name' | 'description' | 'classId' | 'needs' | 'trigger' | 'effects'> & {
  type: FirmwareType;
  rarity: Rarity;
  icon?: string;
  unlock?: string;
};

const self = (status: string, amount: number): Effect => ({ type: 'apply_status', status, amount, target: 'self' });
const all = (status: string, amount: number): Effect => ({ type: 'apply_status', status, amount, target: 'all_enemies' });
const block = (amount: number): Effect => ({ type: 'block', amount });
const energy = (amount: number): Effect => ({ type: 'gain_energy', amount });
const draw = (amount: number): Effect => ({ type: 'draw', amount });

const RAW: readonly RawFirmware[] = [
  { id: 'fw_overdrive', name: 'Оверклок-прошивка', description: '+1 энергия каждый ход', classId: 'netrunner', needs: ['nr_overclock', 'nr_redline', 'nr_afterburn'], trigger: 'turn_start', effects: [energy(1)], type: 'economy', rarity: 'epic' },
  { id: 'fw_meltdown', name: 'Тепловой взрыв', description: 'В начале боя все враги получают 2 Бреши и 2 Лага', classId: 'netrunner', needs: ['nr_meltdown', 'nr_overheat', 'nr_coolant'], trigger: 'combat_start', effects: [all('vulnerable', 2), all('weak', 2)], type: 'attack', rarity: 'uncommon' },
  { id: 'fw_plague', name: 'Чумной вектор', description: 'В начале боя все враги получают 8 Вируса', classId: 'phreaker', needs: ['ph_epidemic', 'ph_patient_zero', 'ph_zombie_net'], trigger: 'combat_start', effects: [all('virus', 8)], type: 'attack', rarity: 'rare' },
  { id: 'fw_spore', name: 'Споровый рой', description: 'Каждый ход все враги получают 2 Вируса', classId: 'phreaker', needs: ['ph_net_worm', 'ph_spread', 'ph_mass_mailer'], trigger: 'turn_start', effects: [all('virus', 2)], type: 'attack', rarity: 'uncommon' },
  { id: 'fw_ghostly', name: 'Призрачный протокол', description: 'Каждый ход +1 карта и 4 блока', classId: 'ghost', needs: ['gh_zero_click', 'gh_phase_shift', 'gh_slipstream'], trigger: 'turn_start', effects: [draw(1), block(4)], type: 'combo', rarity: 'epic' },
  { id: 'fw_nullfield', name: 'Нулевое поле', description: 'В начале боя +3 Шифрования и +2 Броня-патча', classId: 'ghost', needs: ['gh_quantum', 'gh_zero_trace', 'gh_encrypt'], trigger: 'combat_start', effects: [self('dexterity', 3), self('plating', 2)], type: 'defense', rarity: 'common' },
  { id: 'fw_bushido', name: 'Кодекс бусидо', description: 'Каждый ход +1 Разгон', classId: 'samurai', needs: ['sm_bushido', 'sm_bloodlust', 'sm_execute'], trigger: 'turn_start', effects: [self('strength', 1)], type: 'attack', rarity: 'rare' },
  { id: 'fw_hundred', name: 'Сто клинков', description: 'В начале боя +3 Разгона и 4 Контрудара', classId: 'samurai', needs: ['sm_hundred_cuts', 'sm_twin_cut', 'sm_whirlwind'], trigger: 'combat_start', effects: [self('strength', 3), self('thorns', 4)], type: 'combo', rarity: 'uncommon' },
  { id: 'fw_citadel', name: 'Цитадель', description: 'Каждый ход +6 блока и +1 Броня-патч', classId: 'engineer', needs: ['en_fortress', 'en_reinforce', 'en_hardlight'], trigger: 'turn_start', effects: [block(6), self('plating', 1)], type: 'defense', rarity: 'rare' },
  { id: 'fw_forge', name: 'Горн', description: 'В начале боя +2 энергии на первый ход и +2 Разгона', classId: 'engineer', needs: ['en_reactor', 'en_railgun', 'en_overcharge'], trigger: 'combat_start', effects: [energy(2), self('strength', 2)], type: 'combo', rarity: 'uncommon' },
  { id: 'fw_biosync', name: 'Биосинхронизатор', description: 'В конце каждого хода восстанавливает 2 HP', classId: 'biohacker', needs: ['bh_symbiote', 'bh_regen_matrix', 'bh_blood_pact'], trigger: 'turn_end', effects: [{ type: 'heal', amount: 2 }], type: 'defense', rarity: 'common' },
  { id: 'fw_overgrowth', name: 'Перерождение', description: 'В начале боя +4 Самовосстановления и +2 Разгона', classId: 'biohacker', needs: ['bh_overgrowth', 'bh_adrenaline', 'bh_mutation'], trigger: 'combat_start', effects: [self('regen', 4), self('strength', 2)], type: 'combo', rarity: 'common' },
  { id: 'fw_miner', name: 'Майнинг-ферма', description: 'Каждый ход +1 карта', classId: 'neutral', needs: ['n_miner', 'n_ram_upgrade', 'n_debugger'], trigger: 'turn_start', effects: [draw(1)], type: 'economy', rarity: 'rare' },
  { id: 'fw_siege', name: 'Осадный набор', description: 'В начале боя все враги получают 3 Лага и 3 Бреши', classId: 'neutral', needs: ['n_mass_scan', 'n_ddos_kit', 'n_buffer_overflow'], trigger: 'combat_start', effects: [all('weak', 3), all('vulnerable', 3)], type: 'attack', rarity: 'uncommon' },
  // ---- Контент v3 ----
  { id: 'fw_supernova', name: 'Сверхновая-прошивка', description: 'В начале боя +2 Разгона, все враги получают 2 Бреши', classId: 'netrunner', needs: ['nr_supernova', 'nr_ram_overflow', 'nr_arc_lance'], trigger: 'combat_start', effects: [self('strength', 2), all('vulnerable', 2)], type: 'attack', rarity: 'common' },
  { id: 'fw_contagion', name: 'Заразный код', description: 'В начале боя все враги получают 6 Вируса и 2 Лага', classId: 'phreaker', needs: ['ph_pandemic', 'ph_viral_load', 'ph_sleeper'], trigger: 'combat_start', effects: [all('virus', 6), all('weak', 2)], type: 'attack', rarity: 'uncommon' },
  { id: 'fw_eclipse', name: 'Режим затмения', description: 'Каждый ход +5 блока и все враги получают 1 Лаг', classId: 'ghost', needs: ['gh_blackout', 'gh_cloak_charge', 'gh_hunter_mark'], trigger: 'turn_start', effects: [block(5), all('weak', 1)], type: 'combo', rarity: 'rare' },
  { id: 'fw_ronin', name: 'Дух ронина', description: 'В начале боя 5 Контрудара и 10 блока', classId: 'samurai', needs: ['sm_last_stand', 'sm_counter_stance', 'sm_tsuba'], trigger: 'combat_start', effects: [self('thorns', 5), block(10)], type: 'defense', rarity: 'common' },
  { id: 'fw_war_drums', name: 'Боевые барабаны', description: 'В начале боя +2 Разгона, все враги получают 2 Лага', classId: 'samurai', needs: ['sm_war_cry', 'sm_thousand_steps', 'sm_blade_dance'], trigger: 'combat_start', effects: [self('strength', 2), all('weak', 2)], type: 'combo', rarity: 'common' },
  { id: 'fw_siege_doctrine', name: 'Осадная доктрина', description: 'В начале боя +2 Разгона, все враги получают 2 Бреши', classId: 'engineer', needs: ['en_siege_cannon', 'en_turret', 'en_pneumatic'], trigger: 'combat_start', effects: [self('strength', 2), all('vulnerable', 2)], type: 'attack', rarity: 'common' },
  { id: 'fw_overhaul', name: 'Генеральный ремонт', description: 'Каждый ход +1 Броня-патч', classId: 'engineer', needs: ['en_overhaul', 'en_scaffold', 'en_servo_arm'], trigger: 'turn_start', effects: [self('plating', 1)], type: 'defense', rarity: 'uncommon' },
  { id: 'fw_chimera_dna', name: 'Геном химеры', description: 'В начале боя +2 Разгона и 3 Самовосстановления', classId: 'biohacker', needs: ['bh_chimera_blood', 'bh_leech_swarm', 'bh_panacea'], trigger: 'combat_start', effects: [self('strength', 2), self('regen', 3)], type: 'combo', rarity: 'common' },
  // ---- Новые классы ----
  { id: 'fw_hive', name: 'Рой-ядро', description: 'Каждый ход Дрон-стрелок в руке', classId: 'droneop', needs: ['dr_swarm_launch', 'dr_mothership', 'dr_control_net'], trigger: 'turn_start', effects: [{ type: 'add_card', cardId: 'dr_t_gun', to: 'hand', count: 1 }], type: 'utility', rarity: 'rare' },
  { id: 'fw_autofab', name: 'Автофабрика', description: 'В начале боя +2 Разгона и 8 блока', classId: 'droneop', needs: ['dr_hijack', 'dr_repair_swarm', 'dr_bomber_run'], trigger: 'combat_start', effects: [self('strength', 2), block(8)], type: 'combo', rarity: 'common' },
  { id: 'fw_chrono_loop', name: 'Хроно-петля', description: 'Каждый ход +1 карта', classId: 'chrono', needs: ['ch_dilation', 'ch_quantum_leap', 'ch_accelerate'], trigger: 'turn_start', effects: [draw(1)], type: 'economy', rarity: 'rare' },
  { id: 'fw_second_hand', name: 'Секундная стрелка', description: 'В начале боя все враги получают 3 Лага и 2 Бреши, +1 энергия в первый ход', classId: 'chrono', needs: ['ch_final_second', 'ch_chronostasis', 'ch_loan'], trigger: 'combat_start', effects: [all('weak', 3), all('vulnerable', 2), energy(1)], type: 'utility', rarity: 'uncommon' },
  // ---- Коллекция прошивок (v4): редкости, уровни, закрытые до ачивки ----
  { id: 'fw_vent_cycle', name: 'Цикл охлаждения', description: 'Каждый ход 4 блока', classId: 'netrunner', needs: ['nr_f_heat_vent', 'nr_heat_sink', 'nr_coolant'], trigger: 'turn_start', effects: [block(4)], type: 'defense', rarity: 'common' },
  { id: 'fw_core_breach', name: 'Пробой ядра', description: 'В начале боя все враги получают 3 Бреши, +1 Разгон', classId: 'netrunner', needs: ['nr_f_core_dump', 'nr_kernel_panic', 'nr_zero_day'], trigger: 'combat_start', effects: [all('vulnerable', 3), self('strength', 1)], type: 'attack', rarity: 'rare', unlock: 'ach_elite_hunter_2' },
  { id: 'fw_singularity', name: 'Сингулярность', description: 'Каждый ход +1 Разгон и +1 энергия', classId: 'netrunner', needs: ['nr_f_singularity', 'nr_unlimit', 'nr_flood_loop'], trigger: 'turn_start', effects: [self('strength', 1), energy(1)], type: 'combo', rarity: 'legendary', unlock: 'ach_wins_3' },
  { id: 'fw_botnet_grid', name: 'Сеть ботнета', description: 'Каждый ход все враги получают 3 Вируса', classId: 'phreaker', needs: ['ph_f_botnet_relay', 'ph_spam', 'ph_x_botmaster'], trigger: 'turn_start', effects: [all('virus', 3)], type: 'attack', rarity: 'uncommon' },
  { id: 'fw_backdoor_suite', name: 'Набор бэкдоров', description: 'В начале боя все враги получают 3 Лага и 2 Бреши', classId: 'phreaker', needs: ['ph_f_backdoor', 'ph_mitm', 'ph_lag_attack'], trigger: 'combat_start', effects: [all('weak', 3), all('vulnerable', 2)], type: 'utility', rarity: 'common' },
  { id: 'fw_zero_hour', name: 'Нулевой час', description: 'В начале боя все враги получают 10 Вируса', classId: 'phreaker', needs: ['ph_f_zero_hour', 'ph_polymorph', 'ph_x_logic_bomb'], trigger: 'combat_start', effects: [all('virus', 10)], type: 'attack', rarity: 'epic', unlock: 'ach_virus_2' },
  { id: 'fw_shadow_net', name: 'Теневая сеть', description: 'Каждый ход 5 блока', classId: 'ghost', needs: ['gh_f_shade_step', 'gh_smoke', 'gh_evasion'], trigger: 'turn_start', effects: [block(5)], type: 'defense', rarity: 'common' },
  { id: 'fw_needle_storm', name: 'Игольный шторм', description: 'В начале боя +2 Разгона', classId: 'ghost', needs: ['gh_f_needle', 'gh_x_jab', 'gh_null_ptr'], trigger: 'combat_start', effects: [self('strength', 2)], type: 'attack', rarity: 'uncommon' },
  { id: 'fw_vanishing_act', name: 'Номер с исчезновением', description: 'Каждый ход +1 карта и 4 блока', classId: 'ghost', needs: ['gh_f_vanish', 'gh_x_doppel', 'gh_layers'], trigger: 'turn_start', effects: [draw(1), block(4)], type: 'combo', rarity: 'epic', unlock: 'ach_win_ghost' },
  { id: 'fw_ki_flow', name: 'Поток ки', description: 'В начале боя +2 Разгона и 6 блока', classId: 'samurai', needs: ['sm_f_ki_focus', 'sm_meditate', 'sm_kata'], trigger: 'combat_start', effects: [self('strength', 2), block(6)], type: 'combo', rarity: 'common' },
  { id: 'fw_mirror_dojo', name: 'Зеркальное додзё', description: 'В начале боя 6 Контрудара', classId: 'samurai', needs: ['sm_f_mirror_edge', 'sm_x_thorn_armor', 'sm_riposte'], trigger: 'combat_start', effects: [self('thorns', 6)], type: 'defense', rarity: 'uncommon' },
  { id: 'fw_final_judgment', name: 'Последний приговор', description: 'В начале боя +4 Разгона, все враги получают 2 Бреши', classId: 'samurai', needs: ['sm_f_final_cut', 'sm_iaijutsu', 'sm_x_iai_core'], trigger: 'combat_start', effects: [self('strength', 4), all('vulnerable', 2)], type: 'attack', rarity: 'legendary', unlock: 'ach_big_hit_3' },
  { id: 'fw_bastion', name: 'Бастион', description: 'Каждый ход +1 Броня-патч и 3 блока', classId: 'engineer', needs: ['en_f_bastion_core', 'en_exosuit', 'en_shield_generator'], trigger: 'turn_start', effects: [self('plating', 1), block(3)], type: 'defense', rarity: 'rare', unlock: 'ach_win_engineer' },
  { id: 'fw_tesla_grid', name: 'Сеть Теслы', description: 'В начале боя все враги получают 2 Бреши и 1 Лаг', classId: 'engineer', needs: ['en_f_tesla_coil', 'en_x_sapper', 'en_flamethrower'], trigger: 'combat_start', effects: [all('vulnerable', 2), all('weak', 1)], type: 'attack', rarity: 'common' },
  { id: 'fw_bloom', name: 'Цветение', description: 'В начале боя +5 Самовосстановления', classId: 'biohacker', needs: ['bh_f_blood_bloom', 'bh_suture', 'bh_antibody'], trigger: 'combat_start', effects: [self('regen', 5)], type: 'defense', rarity: 'common' },
  { id: 'fw_venom_lab', name: 'Ядовитая лаборатория', description: 'В начале боя все враги получают 6 Вируса, +2 Самовосстановления', classId: 'biohacker', needs: ['bh_f_venom_gland', 'bh_toxin', 'bh_x_incubator'], trigger: 'combat_start', effects: [all('virus', 6), self('regen', 2)], type: 'combo', rarity: 'rare', unlock: 'ach_win_biohacker' },
  { id: 'fw_carrier_group', name: 'Авианосная группа', description: 'Каждый ход Дрон-стрелок в руке и 3 блока', classId: 'droneop', needs: ['dr_f_carrier', 'dr_f_relay_node', 'dr_x_hive'], trigger: 'turn_start', effects: [{ type: 'add_card', cardId: 'dr_t_gun', to: 'hand', count: 1 }, block(3)], type: 'utility', rarity: 'epic', unlock: 'ach_win_droneop' },
  { id: 'fw_rewind', name: 'Откат', description: 'В начале боя 8 блока, все враги получают 2 Лага', classId: 'chrono', needs: ['ch_f_rewind', 'ch_x_drag', 'ch_hourglass'], trigger: 'combat_start', effects: [block(8), all('weak', 2)], type: 'defense', rarity: 'uncommon' },
  { id: 'fw_stolen_time', name: 'Украденное время', description: 'Каждый ход +1 карта и +1 энергия', classId: 'chrono', needs: ['ch_f_stolen_second', 'ch_haste', 'ch_x_metronome'], trigger: 'turn_start', effects: [draw(1), energy(1)], type: 'economy', rarity: 'legendary', unlock: 'ach_ascension_3' },
  { id: 'fw_lucky_streak', name: 'Полоса удачи', description: 'В начале боя +2 Разгона и +1 энергия', classId: 'vabanker', needs: ['vb_f_coin_flip', 'vb_bluff', 'vb_snake_eyes'], trigger: 'combat_start', effects: [self('strength', 2), energy(1)], type: 'combo', rarity: 'uncommon' },
  { id: 'fw_high_stakes', name: 'Высокие ставки', description: 'В начале боя +3 Разгона, все враги получают 2 Бреши', classId: 'vabanker', needs: ['vb_f_full_house', 'vb_f_house_money', 'vb_all_in'], trigger: 'combat_start', effects: [self('strength', 3), all('vulnerable', 2)], type: 'attack', rarity: 'epic', unlock: 'ach_win_vabanker' },
  { id: 'fw_patchwork', name: 'Лоскутный патч', description: 'Каждый ход 3 блока', classId: 'neutral', needs: ['n_f_firmware_patch', 'n_f_bit_flip', 'n_proxy_chain'], trigger: 'turn_start', effects: [block(3)], type: 'utility', rarity: 'common' },
];

function build(r: RawFirmware): FirmwareDef {
  return {
    ...r,
    desc: r.description,
    icon: r.icon ?? TYPE_ICON[r.type],
    levels: buildLevels(r.rarity, r.effects),
  };
}

export const FIRMWARES: readonly FirmwareDef[] = RAW.map(build);

const BY_ID = new Map(FIRMWARES.map((f) => [f.id, f]));

export function getFirmware(id: string): FirmwareDef | undefined {
  return BY_ID.get(id);
}

/** Какие карты из требований прошивки есть в колоде. */
export function firmwareProgress(fw: FirmwareDef, deckDefIds: readonly string[]): { have: string[]; missing: string[] } {
  const set = new Set(deckDefIds);
  return { have: fw.needs.filter((id) => set.has(id)), missing: fw.needs.filter((id) => !set.has(id)) };
}

export function isFirmwareActive(fw: FirmwareDef, deckDefIds: readonly string[]): boolean {
  return firmwareProgress(fw, deckDefIds).missing.length === 0;
}

/** Уровень прошивки по составу колоды. */
export function firmwareLevel(fw: FirmwareDef, deckDefIds: readonly string[]): FirmwareLevel {
  const { missing } = firmwareProgress(fw, deckDefIds);
  if (missing.length === 0) return 2;
  return missing.length === 1 && fw.needs.length >= 3 ? 1 : 0;
}

function clampMetaLevel(level: number | undefined): number {
  const n = Math.floor(Number(level) || 1);
  return Math.max(1, Math.min(MAX_FIRMWARE_LEVEL, n));
}

/** Эффекты прошивки на мета-уровне (1..MAX). Контракт: firmwareEffect(def, level). */
export function firmwareEffect(def: FirmwareDef, level: number): readonly Effect[] {
  const lv = clampMetaLevel(level);
  return lv === 1 ? def.effects : (def.levels[lv - 1]?.effect ?? def.effects);
}

function partialOf(effects: readonly Effect[], trigger: FirmwareTrigger): Effect[] {
  const out: Effect[] = [];
  for (const e of effects) {
    if (e.type === 'apply_status' || e.type === 'block' || e.type === 'heal') out.push({ ...e, amount: Math.max(1, Math.ceil(e.amount / 2)) });
  }
  if (out.length === 0) out.push({ type: 'block', amount: trigger === 'combat_start' ? 5 : 3 });
  return out;
}

/** Ослабленные эффекты (уровень 1): числа пополам, без энергии/добора/карт; пусто → немного блока. */
export function partialEffects(fw: FirmwareDef, metaLevel = 1): Effect[] {
  return partialOf(firmwareEffect(fw, metaLevel), fw.trigger);
}

/** Эффекты прошивки для уровня колоды (0 — пусто) с учётом мета-уровня (1 — базовые). */
export function firmwareEffects(fw: FirmwareDef, level: FirmwareLevel, metaLevel = 1): readonly Effect[] {
  return level === 2 ? firmwareEffect(fw, metaLevel) : level === 1 ? partialEffects(fw, metaLevel) : [];
}

function statusName(id: string): string {
  return getContent().statuses.get(id)?.name ?? id;
}

/** Текст эффектов для UI. */
export function describeFirmwareEffects(fw: FirmwareDef, level: 1 | 2, metaLevel = 1): string {
  const when = fw.trigger === 'combat_start' ? 'В начале боя' : fw.trigger === 'turn_end' ? 'В конце каждого хода' : 'Каждый ход';
  const parts = firmwareEffects(fw, level, metaLevel).map((e) => {
    switch (e.type) {
      case 'block':
        return `${e.amount} блока`;
      case 'heal':
        return `${e.amount} HP`;
      case 'draw':
        return `+${e.amount} карта`;
      case 'gain_energy':
        return `+${e.amount} энергии`;
      case 'add_card':
        return (e.count ?? 1) > 1 ? `${e.count} карты в руку` : 'карта в руку';
      case 'apply_status':
        return e.target === 'all_enemies' ? `враги: ${e.amount} ${statusName(e.status)}` : `+${e.amount} ${statusName(e.status)}`;
      default:
        return '';
    }
  });
  return `${when}: ${parts.filter(Boolean).join(', ')}`;
}

/** Прошивки, закрытые до ачивки (id). */
export function lockableFirmwares(): string[] {
  return FIRMWARES.filter((f) => f.unlock !== undefined).map((f) => f.id);
}

/** Прошивки, которые можно выдать в забеге: свой класс или нейтральные, ещё не полученные, открытые, все карты существуют. */
export function rollableFirmwares(s: Pick<RunState, 'classId' | 'firmwares'> & Partial<Pick<RunState, 'locked'>>): FirmwareDef[] {
  const cards = getContent().cards;
  const owned = new Set(s.firmwares ?? []);
  const locked = new Set(s.locked?.firmwares ?? []);
  return FIRMWARES.filter(
    (f) =>
      !owned.has(f.id) &&
      !locked.has(f.id) &&
      (f.classId === s.classId || f.classId === 'neutral') &&
      f.needs.every((id) => cards.has(id)),
  );
}

// ---------------- Мета-прогресс: коллекция, копии, улучшения ----------------

export interface FirmwareState {
  id: string;
  /** 1..MAX_FIRMWARE_LEVEL */
  level: number;
  /** Накопленные копии для следующего улучшения */
  copies: number;
}

/** Часть профиля, которую используют функции коллекции (остальные поля сохраняются как есть). */
export interface FirmwareMeta {
  unlockedFirmwares: readonly string[];
  firmwareCollection: Readonly<Record<string, FirmwareState>>;
}

/** Минимальный ГСЧ: подходит и Rng движка, и обёртка над Math.random. */
export interface RngLike {
  next(): number;
}

export function listFirmwares(): readonly FirmwareDef[] {
  return FIRMWARES;
}

/** Открыта ли прошивка: без unlock — всегда; иначе — есть в unlockedFirmwares или уже в коллекции. */
export function isFirmwareUnlocked(def: FirmwareDef, meta?: Partial<FirmwareMeta> | null): boolean {
  if (def.unlock === undefined) return true;
  return (meta?.unlockedFirmwares ?? []).includes(def.id) || meta?.firmwareCollection?.[def.id] !== undefined;
}

/** Прошивки, доступные игроку (закрытые не попадают ни в награды, ни в пул забега). */
export function listAvailableFirmwares(meta?: Partial<FirmwareMeta> | null): FirmwareDef[] {
  return FIRMWARES.filter((f) => isFirmwareUnlocked(f, meta));
}

function isMaxed(meta: Partial<FirmwareMeta> | null | undefined, id: string): boolean {
  return (meta?.firmwareCollection?.[id]?.level ?? 0) >= MAX_FIRMWARE_LEVEL;
}

/**
 * Награда «1 из n»: n разных открытых прошивок, редкость — по весам FIRMWARE_RARITY_CONFIG.
 * Прошивки максимального уровня не предлагаются (копия им бесполезна). Возвращает id.
 */
export function rollFirmwareChoices(meta: Partial<FirmwareMeta> | null | undefined, rng: RngLike, n = 3): string[] {
  const pool = listAvailableFirmwares(meta).filter((f) => !isMaxed(meta, f.id));
  const out: string[] = [];
  while (out.length < n) {
    const left = pool.filter((f) => !out.includes(f.id));
    if (left.length === 0) break;
    const rarities = RARITIES.filter((r) => left.some((f) => f.rarity === r));
    const total = rarities.reduce((s, r) => s + FIRMWARE_RARITY_CONFIG[r].weight, 0);
    let roll = rng.next() * total;
    let rarity = rarities[rarities.length - 1]!;
    for (const r of rarities) {
      roll -= FIRMWARE_RARITY_CONFIG[r].weight;
      if (roll < 0) {
        rarity = r;
        break;
      }
    }
    const cands = left.filter((f) => f.rarity === rarity);
    out.push(cands[Math.min(cands.length - 1, Math.floor(rng.next() * cands.length))]!.id);
  }
  return out;
}

/** Сколько копий нужно для следующего уровня (null — максимум или прошивки нет в коллекции). */
export function copiesForNextLevel(state: Partial<FirmwareMeta> | null | undefined, id: string): number | null {
  const def = getFirmware(id);
  const st = state?.firmwareCollection?.[id];
  if (!def || !st || st.level >= MAX_FIRMWARE_LEVEL) return null;
  return def.levels[st.level]?.copiesNeeded ?? null;
}

/**
 * Получить прошивку или её копию: новая → в коллекцию уровнем 1 (и открывается);
 * дубликат → +1 копия (на максимальном уровне копии не копятся). Профиль не мутируется.
 */
export function addFirmwareCopy<T extends FirmwareMeta>(state: T, id: string, amount = 1): T {
  const def = getFirmware(id);
  if (!def || amount <= 0) return state;
  const coll = { ...state.firmwareCollection };
  const cur = coll[id];
  if (!cur) coll[id] = { id, level: 1, copies: Math.max(0, amount - 1) };
  else if (cur.level < MAX_FIRMWARE_LEVEL) coll[id] = { ...cur, copies: cur.copies + amount };
  else return state;
  const unlocked = state.unlockedFirmwares.includes(id) || def.unlock === undefined ? state.unlockedFirmwares : [...state.unlockedFirmwares, id];
  return { ...state, unlockedFirmwares: unlocked, firmwareCollection: coll };
}

export function canUpgrade(state: Partial<FirmwareMeta> | null | undefined, id: string): boolean {
  const need = copiesForNextLevel(state, id);
  return need !== null && (state?.firmwareCollection?.[id]?.copies ?? 0) >= need;
}

/** Улучшить прошивку: тратит копии, уровень +1. Нельзя — профиль возвращается без изменений. */
export function upgradeFirmware<T extends FirmwareMeta>(state: T, id: string): T {
  if (!canUpgrade(state, id)) return state;
  const cur = state.firmwareCollection[id]!;
  const need = copiesForNextLevel(state, id)!;
  return { ...state, firmwareCollection: { ...state.firmwareCollection, [id]: { id, level: cur.level + 1, copies: cur.copies - need } } };
}

/** Уровни коллекции для NewRunOptions.firmwareLevels (только > 1). */
export function firmwareRunLevels(meta: Partial<FirmwareMeta> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, st] of Object.entries(meta?.firmwareCollection ?? {})) if (getFirmware(id) && st.level > 1) out[id] = clampMetaLevel(st.level);
  return out;
}
