/**
 * UI-адаптер: единственная точка, через которую интерфейс прошивок и достижений берёт данные.
 * Пока feat/data не влит — заглушки по общему контракту. После мерджа заменить тела функций
 * реальными импортами из @cyberhack/engine (firmware.ts) и game/achievements.ts, сигнатуры не менять.
 */
import { useSyncExternalStore } from 'react';

// ---- Типы контракта ----
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type FirmwareType = 'attack' | 'defense' | 'economy' | 'utility' | 'combo';

export interface FirmwareLevelDef {
  copiesNeeded: number;
  /** Описание эффекта уровня (в реальном движке может быть объектом — UI покажет через firmwareEffectText) */
  effect: unknown;
}

export interface FirmwareDef {
  id: string;
  name: string;
  desc: string;
  type: FirmwareType;
  rarity: Rarity;
  icon: string;
  /** id ачивки или условие открытия */
  unlock?: string;
  levels: FirmwareLevelDef[];
}

export interface FirmwareState {
  id: string;
  level: number;
  copies: number;
}

export interface FirmwareMeta {
  unlockedFirmwares: string[];
  firmwareCollection: Record<string, FirmwareState>;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface Reward {
  kind: 'card' | 'firmware' | 'copies' | 'currency' | 'cosmetic';
  id?: string;
  amount?: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  category: string;
  tier: AchievementTier;
  goal: number;
  reward: Reward;
}

export interface AchievementState {
  id: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

// ---- Подписка на изменения (для перерисовки React) ----
let version = 0;
const subs = new Set<() => void>();
function emit() {
  version++;
  subs.forEach((f) => f());
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
/** Хук: компонент перерисуется после upgrade/claim/pick. */
export function useContractVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

// ---- Заглушки данных ----
const L = (...steps: [number, string][]): FirmwareLevelDef[] => steps.map(([copiesNeeded, effect]) => ({ copiesNeeded, effect }));

const STUB_FIRMWARES: FirmwareDef[] = [
  { id: 'fw_overdrive', name: 'Оверклок', desc: 'Больше энергии в начале хода', type: 'economy', rarity: 'rare', icon: 'energy', levels: L([0, '+1 энергия в 1-й ход'], [2, '+1 энергия каждые 2 хода'], [4, '+1 энергия каждый ход']) },
  { id: 'fw_meltdown', name: 'Тепловой взрыв', desc: 'Враги начинают бой ослабленными', type: 'attack', rarity: 'uncommon', icon: 'vulnerable', levels: L([0, '1 Брешь всем врагам'], [2, '2 Бреши всем врагам'], [3, '2 Бреши и 1 Лаг всем']) },
  { id: 'fw_citadel', name: 'Цитадель', desc: 'Блок в начале каждого хода', type: 'defense', rarity: 'common', icon: 'block', levels: L([0, '+3 блока каждый ход'], [2, '+5 блока каждый ход'], [3, '+6 блока и 1 Броня-патч']) },
  { id: 'fw_miner', name: 'Майнинг-ферма', desc: 'Кредиты после каждого боя', type: 'economy', rarity: 'common', icon: 'gold', levels: L([0, '+5 кредитов за бой'], [2, '+10 кредитов за бой'], [3, '+15 кредитов за бой']) },
  { id: 'fw_ghostly', name: 'Призрачный протокол', desc: 'Добор и защита', type: 'utility', rarity: 'epic', icon: 'draw', unlock: 'ach_no_damage', levels: L([0, '+1 карта в 1-й ход'], [3, '+1 карта и 3 блока каждый ход']) },
  { id: 'fw_plague', name: 'Чумной вектор', desc: 'Вирус на всех врагов', type: 'attack', rarity: 'rare', icon: 'virus', unlock: 'ach_virus_100', levels: L([0, '4 Вируса всем врагам'], [2, '6 Вируса всем'], [4, '8 Вируса всем']) },
  { id: 'fw_chain', name: 'Цепная реакция', desc: 'Каждая 3-я атака повторяется', type: 'combo', rarity: 'epic', icon: 'replay', unlock: 'ach_combo_10', levels: L([0, 'Каждая 4-я атака повторяется'], [3, 'Каждая 3-я атака повторяется']) },
  { id: 'fw_singularity', name: 'Сингулярность', desc: 'Удвоенный эффект первой силы', type: 'combo', rarity: 'legendary', icon: 'crown', unlock: 'ach_boss_act4', levels: L([0, 'Первая сила в бою срабатывает дважды'], [5, 'Первые две силы срабатывают дважды']) },
  { id: 'fw_bushido', name: 'Кодекс бусидо', desc: 'Разгон каждый ход', type: 'attack', rarity: 'uncommon', icon: 'strength', unlock: 'ach_win_samurai', levels: L([0, '+1 Разгон каждые 2 хода'], [3, '+1 Разгон каждый ход']) },
  { id: 'fw_biosync', name: 'Биосинхронизатор', desc: 'Лечение в конце хода', type: 'defense', rarity: 'rare', icon: 'regen', levels: L([0, '+1 HP в конце хода'], [2, '+2 HP в конце хода'], [3, '+3 HP в конце хода']) },
  { id: 'fw_scanner', name: 'Сканер уязвимостей', desc: 'Видно следующие 2 намерения', type: 'utility', rarity: 'uncommon', icon: 'eye', levels: L([0, 'Видно следующее намерение'], [3, 'Видно 2 намерения вперёд']) },
];

const STUB_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ach_first_win', title: 'Первый взлом', desc: 'Победите в любом бою', category: 'Бой', tier: 'bronze', goal: 1, reward: { kind: 'currency', amount: 50 } },
  { id: 'ach_kill_100', title: 'Сборщик логов', desc: 'Уничтожьте 100 врагов', category: 'Бой', tier: 'silver', goal: 100, reward: { kind: 'copies', id: 'fw_citadel', amount: 2 } },
  { id: 'ach_no_damage', title: 'Без следа', desc: 'Выиграйте бой с элитой без урона', category: 'Бой', tier: 'gold', goal: 1, reward: { kind: 'firmware', id: 'fw_ghostly' } },
  { id: 'ach_combo_10', title: 'Цепь команд', desc: 'Сыграйте 10 карт за один ход', category: 'Мастерство', tier: 'gold', goal: 10, reward: { kind: 'firmware', id: 'fw_chain' } },
  { id: 'ach_virus_100', title: 'Пациент ноль', desc: 'Нанесите 100 урона Вирусом', category: 'Мастерство', tier: 'silver', goal: 100, reward: { kind: 'firmware', id: 'fw_plague' } },
  { id: 'ach_run_1', title: 'Первый забег', desc: 'Пройдите первый акт', category: 'Забеги', tier: 'bronze', goal: 1, reward: { kind: 'card', id: 'n_miner' } },
  { id: 'ach_runs_10', title: 'Завсегдатай сети', desc: 'Завершите 10 забегов', category: 'Забеги', tier: 'silver', goal: 10, reward: { kind: 'currency', amount: 200 } },
  { id: 'ach_boss_act4', title: 'За горизонтом', desc: 'Победите босса 4-го акта', category: 'Забеги', tier: 'gold', goal: 1, reward: { kind: 'firmware', id: 'fw_singularity' } },
  { id: 'ach_win_samurai', title: 'Путь клинка', desc: 'Победите самураем', category: 'Классы', tier: 'silver', goal: 1, reward: { kind: 'firmware', id: 'fw_bushido' } },
  { id: 'ach_all_classes', title: 'Мультикласс', desc: 'Сыграйте каждым классом', category: 'Классы', tier: 'gold', goal: 8, reward: { kind: 'cosmetic', id: 'frame_prism' } },
  { id: 'ach_collect_5', title: 'Коллекционер', desc: 'Откройте 5 прошивок', category: 'Коллекция', tier: 'bronze', goal: 5, reward: { kind: 'copies', id: 'fw_miner', amount: 3 } },
  { id: 'ach_upgrade_max', title: 'Полный апгрейд', desc: 'Улучшите прошивку до максимума', category: 'Коллекция', tier: 'silver', goal: 1, reward: { kind: 'currency', amount: 150 } },
];

const meta: FirmwareMeta = {
  unlockedFirmwares: ['fw_overdrive', 'fw_meltdown', 'fw_citadel', 'fw_miner', 'fw_biosync', 'fw_scanner'],
  firmwareCollection: {
    fw_overdrive: { id: 'fw_overdrive', level: 1, copies: 2 },
    fw_meltdown: { id: 'fw_meltdown', level: 2, copies: 1 },
    fw_citadel: { id: 'fw_citadel', level: 3, copies: 0 },
    fw_miner: { id: 'fw_miner', level: 1, copies: 0 },
    fw_biosync: { id: 'fw_biosync', level: 1, copies: 1 },
  },
};

const achStates: Record<string, AchievementState> = Object.fromEntries(
  STUB_ACHIEVEMENTS.map((a, i) => {
    const progress = [1, 64, 0, 7, 100, 1, 3, 0, 1, 5, 5, 0][i] ?? 0;
    const completed = progress >= a.goal;
    return [a.id, { id: a.id, progress: Math.min(progress, a.goal), completed, claimed: completed && i === 0 }];
  }),
);

// ---- Прошивки ----
export function listFirmwares(): FirmwareDef[] {
  return STUB_FIRMWARES;
}
export function getFirmwareMeta(): FirmwareMeta {
  return meta;
}
export function getFirmwareDef(id: string): FirmwareDef | undefined {
  return STUB_FIRMWARES.find((f) => f.id === id);
}
export function isFirmwareUnlocked(id: string): boolean {
  return meta.unlockedFirmwares.includes(id);
}
export function listAvailableFirmwares(): FirmwareDef[] {
  return STUB_FIRMWARES.filter((f) => isFirmwareUnlocked(f.id));
}
/** Состояние прошивки; у открытой без копий — уровень 0 (ещё не собрана). */
export function firmwareStateOf(id: string): FirmwareState {
  return meta.firmwareCollection[id] ?? { id, level: 0, copies: 0 };
}
/** Сколько копий нужно до следующего уровня (null — максимум). Уровень N → N+1 требует levels[N].copiesNeeded. */
export function copiesForNext(def: FirmwareDef, st: FirmwareState): number | null {
  if (st.level >= def.levels.length) return null;
  return Math.max(1, def.levels[st.level]?.copiesNeeded ?? 1);
}
export function canUpgrade(id: string): boolean {
  const def = getFirmwareDef(id);
  if (!def || !isFirmwareUnlocked(id)) return false;
  const st = firmwareStateOf(id);
  const need = copiesForNext(def, st);
  return need !== null && st.level > 0 && st.copies >= need;
}
export function upgradeFirmware(id: string): boolean {
  if (!canUpgrade(id)) return false;
  const def = getFirmwareDef(id)!;
  const st = firmwareStateOf(id);
  meta.firmwareCollection[id] = { id, level: st.level + 1, copies: st.copies - copiesForNext(def, st)! };
  emit();
  return true;
}
export function addFirmwareCopy(id: string): void {
  const st = meta.firmwareCollection[id];
  meta.firmwareCollection[id] = st ? { ...st, copies: st.copies + 1 } : { id, level: 1, copies: 0 };
  emit();
}
export function firmwareEffect(def: FirmwareDef, level: number): unknown {
  return def.levels[Math.max(0, Math.min(level, def.levels.length) - 1)]?.effect;
}
export function firmwareEffectText(def: FirmwareDef, level: number): string {
  const e = firmwareEffect(def, level);
  return typeof e === 'string' ? e : def.desc;
}
export function rollFirmwareChoices(n = 3): FirmwareDef[] {
  const pool = [...listAvailableFirmwares()];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

// ---- Достижения ----
export function listAchievements(): AchievementDef[] {
  return STUB_ACHIEVEMENTS;
}
export function getAchievementStates(): Record<string, AchievementState> {
  return achStates;
}
export function claimAchievement(id: string): boolean {
  const st = achStates[id];
  if (!st || !st.completed || st.claimed) return false;
  achStates[id] = { ...st, claimed: true };
  const def = STUB_ACHIEVEMENTS.find((a) => a.id === id);
  if (def?.reward.kind === 'firmware' && def.reward.id && !meta.unlockedFirmwares.includes(def.reward.id)) meta.unlockedFirmwares.push(def.reward.id);
  if (def?.reward.kind === 'copies' && def.reward.id) for (let i = 0; i < (def.reward.amount ?? 1); i++) addFirmwareCopy(def.reward.id);
  emit();
  return true;
}
export function hasUnclaimed(): boolean {
  return Object.values(achStates).some((s) => s.completed && !s.claimed);
}
export function unclaimedCount(): number {
  return Object.values(achStates).filter((s) => s.completed && !s.claimed).length;
}
