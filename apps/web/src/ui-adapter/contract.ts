/**
 * UI-адаптер: единственная точка, через которую интерфейс прошивок и достижений берёт данные.
 * Пока feat/data не влит — заглушки, повторяющие его API (firmware.ts в engine, game/achievements.ts, store.metaExtra).
 * После мерджа заменить тела функций по docs/handoff/feat-ui.md; экспорты и их сигнатуры не менять.
 */
import { useSyncExternalStore } from 'react';

// ---- Типы контракта ----
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type FirmwareType = 'attack' | 'defense' | 'economy' | 'utility' | 'combo';

export interface FirmwareLevelDef {
  copiesNeeded: number;
  /** В движке — Effect[]; текст для UI даёт firmwareEffectText */
  effect: unknown;
}

export interface FirmwareDef {
  id: string;
  name: string;
  desc: string;
  type: FirmwareType;
  rarity: Rarity;
  icon: string;
  /** id ачивки, которая открывает; нет — открыта с начала */
  unlock?: string;
  /** Уровни 1..N, индекс 0 — уровень 1 */
  levels: readonly FirmwareLevelDef[];
}

export interface FirmwareState {
  id: string;
  /** 1..N; 0 — ещё нет в коллекции */
  level: number;
  copies: number;
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

// ---- Подписка на изменения заглушек (после мерджа — подписка на useGame) ----
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
/** Хук: компонент перерисуется после улучшения/выбора/получения награды. */
export function useContractVersion(): unknown {
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
  { id: 'ach_first_win', title: 'Первый взлом', desc: 'Победите в любом бою', category: 'combat', tier: 'bronze', goal: 1, reward: { kind: 'currency', amount: 50 } },
  { id: 'ach_kill_100', title: 'Сборщик логов', desc: 'Уничтожьте 100 врагов', category: 'combat', tier: 'silver', goal: 100, reward: { kind: 'copies', id: 'fw_citadel', amount: 2 } },
  { id: 'ach_no_damage', title: 'Без следа', desc: 'Выиграйте бой с элитой без урона', category: 'combat', tier: 'gold', goal: 1, reward: { kind: 'firmware', id: 'fw_ghostly' } },
  { id: 'ach_combo_10', title: 'Цепь команд', desc: 'Сыграйте 10 карт за один ход', category: 'records', tier: 'gold', goal: 10, reward: { kind: 'firmware', id: 'fw_chain' } },
  { id: 'ach_virus_100', title: 'Пациент ноль', desc: 'Нанесите 100 урона Вирусом', category: 'records', tier: 'silver', goal: 100, reward: { kind: 'firmware', id: 'fw_plague' } },
  { id: 'ach_run_1', title: 'Первый забег', desc: 'Пройдите первый акт', category: 'progress', tier: 'bronze', goal: 1, reward: { kind: 'card', id: 'n_miner' } },
  { id: 'ach_runs_10', title: 'Завсегдатай сети', desc: 'Завершите 10 забегов', category: 'progress', tier: 'silver', goal: 10, reward: { kind: 'currency', amount: 200 } },
  { id: 'ach_boss_act4', title: 'За горизонтом', desc: 'Победите босса 4-го акта', category: 'progress', tier: 'gold', goal: 1, reward: { kind: 'firmware', id: 'fw_singularity' } },
  { id: 'ach_win_samurai', title: 'Путь клинка', desc: 'Победите самураем', category: 'classes', tier: 'silver', goal: 1, reward: { kind: 'firmware', id: 'fw_bushido' } },
  { id: 'ach_all_classes', title: 'Мультикласс', desc: 'Сыграйте каждым классом', category: 'classes', tier: 'gold', goal: 8, reward: { kind: 'cosmetic', id: 'frame_prism' } },
  { id: 'ach_collect_5', title: 'Коллекционер', desc: 'Откройте 5 прошивок', category: 'firmware', tier: 'bronze', goal: 5, reward: { kind: 'copies', id: 'fw_miner', amount: 3 } },
  { id: 'ach_upgrade_max', title: 'Полный апгрейд', desc: 'Улучшите прошивку до максимума', category: 'firmware', tier: 'silver', goal: 1, reward: { kind: 'currency', amount: 150 } },
];

const meta: { unlockedFirmwares: string[]; firmwareCollection: Record<string, FirmwareState> } = {
  unlockedFirmwares: [],
  firmwareCollection: {
    fw_overdrive: { id: 'fw_overdrive', level: 1, copies: 2 },
    fw_meltdown: { id: 'fw_meltdown', level: 2, copies: 1 },
    fw_citadel: { id: 'fw_citadel', level: 3, copies: 0 },
    fw_miner: { id: 'fw_miner', level: 1, copies: 0 },
    fw_biosync: { id: 'fw_biosync', level: 1, copies: 1 },
  },
};

let achStates: AchievementState[] = STUB_ACHIEVEMENTS.map((a, i) => {
  const progress = Math.min(a.goal, [1, 64, 0, 7, 100, 1, 3, 0, 1, 5, 5, 0][i] ?? 0);
  const completed = progress >= a.goal;
  return { id: a.id, progress, completed, claimed: completed && i === 0 };
});

let pendingChoice: string[] | null = null;

// ---- Прошивки ----
export function listFirmwares(): readonly FirmwareDef[] {
  return STUB_FIRMWARES;
}
export function getFirmwareDef(id: string): FirmwareDef | undefined {
  return STUB_FIRMWARES.find((f) => f.id === id);
}
/** Как в движке: без unlock — открыта; иначе — в unlockedFirmwares или уже в коллекции. */
export function isFirmwareUnlocked(id: string): boolean {
  const def = getFirmwareDef(id);
  if (!def) return false;
  return def.unlock === undefined || meta.unlockedFirmwares.includes(id) || meta.firmwareCollection[id] !== undefined;
}
export function firmwareStateOf(id: string): FirmwareState {
  return meta.firmwareCollection[id] ?? { id, level: 0, copies: 0 };
}
/** Копий до следующего уровня; null — максимум или прошивки нет в коллекции. */
export function copiesForNext(id: string): number | null {
  const def = getFirmwareDef(id);
  const st = meta.firmwareCollection[id];
  if (!def || !st || st.level >= def.levels.length) return null;
  return def.levels[st.level]?.copiesNeeded ?? null;
}
export function canUpgrade(id: string): boolean {
  const need = copiesForNext(id);
  return need !== null && firmwareStateOf(id).copies >= need;
}
export function upgradeFirmware(id: string): void {
  if (!canUpgrade(id)) return;
  const st = firmwareStateOf(id);
  meta.firmwareCollection[id] = { id, level: st.level + 1, copies: st.copies - copiesForNext(id)! };
  emit();
}
function addCopy(id: string, amount = 1) {
  const def = getFirmwareDef(id);
  if (!def) return;
  const cur = meta.firmwareCollection[id];
  if (!cur) meta.firmwareCollection[id] = { id, level: 1, copies: amount - 1 };
  else if (cur.level < def.levels.length) meta.firmwareCollection[id] = { ...cur, copies: cur.copies + amount };
}
/** Текст эффекта на уровне (в движке: describeFirmwareEffects(fw, 2, level)). */
export function firmwareEffectText(def: FirmwareDef, level: number): string {
  const e = def.levels[Math.max(1, Math.min(level, def.levels.length)) - 1]?.effect;
  return typeof e === 'string' ? e : def.desc;
}

// ---- Награда «1 из 3» (в сторе: metaExtra.pendingFirmwareChoice) ----
export function usePendingFirmwareChoice(): string[] | null {
  useContractVersion();
  return pendingChoice;
}
export function pickFirmwareChoice(id: string): void {
  if (!pendingChoice?.includes(id)) return;
  addCopy(id);
  pendingChoice = null;
  emit();
}
export function skipFirmwareChoice(): void {
  pendingChoice = null;
  emit();
}
/** Только для разработки/e2e: предложить выбор (в реальной игре награду выдаёт store в конце забега). */
export function devOfferFirmwareChoice(ids: string[]): void {
  pendingChoice = ids;
  emit();
}

// ---- Достижения ----
export function listAchievements(): readonly AchievementDef[] {
  return STUB_ACHIEVEMENTS;
}
export function getAchievementStates(): AchievementState[] {
  return achStates;
}
export function useAchievementStates(): AchievementState[] {
  useContractVersion();
  return achStates;
}
export function claimAchievement(id: string): boolean {
  const st = achStates.find((s) => s.id === id);
  if (!st || !st.completed || st.claimed) return false;
  achStates = achStates.map((s) => (s.id === id ? { ...s, claimed: true } : s));
  const r = STUB_ACHIEVEMENTS.find((a) => a.id === id)?.reward;
  if (r?.kind === 'firmware' && r.id && !meta.unlockedFirmwares.includes(r.id)) meta.unlockedFirmwares.push(r.id);
  if (r?.kind === 'copies' && r.id) addCopy(r.id, r.amount ?? 1);
  emit();
  return true;
}
export function hasUnclaimed(): boolean {
  return achStates.some((s) => s.completed && !s.claimed);
}
export function useUnclaimedCount(): number {
  return useAchievementStates().filter((s) => s.completed && !s.claimed).length;
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __offerFirmware: typeof devOfferFirmwareChoice }).__offerFirmware = devOfferFirmwareChoice;
