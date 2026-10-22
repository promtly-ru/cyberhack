# feat/ui — интерфейс прошивок и достижений

## Сделано
- **Иконка прошивок** вместо строки `FirmwareBar` в шапке забега (`TopBar.tsx`, внутри `.topbar__actions`). Зелёная точка — есть что улучшить.
- **Окно «Прошивки»** (`components/firmware/FirmwareModal.tsx`): сетка карточек в стиле карт (рамка по редкости, тип, уровень, шкала копий), фильтры по типу и редкости, сортировка (редкость / уровень / название / готовые к улучшению), детальный вид с уровнями и кнопкой «Улучшить».
  - В забеге (`mode="run"`) закрытые не показываются; в коллекции из меню (`mode="collection"`) — затемнены, с подсказкой, как открыть (`unlock` → название и описание ачивки).
- **Награда «выбери 1 из 3»** (`screens/FirmwareReward.tsx`): метки «Новая» / «+1 копия», «Пропустить» / «Забрать».
- **Меню достижений** (`screens/AchievementsScreen.tsx`): категории-вкладки, тиры (бронза/серебро/золото), прогресс-бары, награда на карточке, «Забрать» и «Забрать все», фильтры по статусу и тиру, поиск, счётчик X / N. Кнопка «Награды» в меню со значком числа невзятых наград.
- Все данные идут только через `ui-adapter/contract.ts` (заглушки, повторяющие API feat/data; в DEV выбор прошивки можно вызвать `window.__offerFirmware([...ids])`). Окна открываются через `ui-adapter/overlays.ts` (zustand), монтируются один раз в `App.tsx` (`<UiOverlays />`).
- Стили: `styles/firmware-ui.css`, `styles/achievements-ui.css` (импортируются из компонентов, `main.tsx` не трогал).
- Адаптивность проверена в браузере на 1440 / 768 / 390: горизонтального скролла нет, все кнопки и селекты в модалках от 44px, ошибок в консоли нет.

## Точечные правки чужих файлов (отдельный коммит)
- `App.tsx`: импорт и `<UiOverlays />`.
- `components/TopBar.tsx`: `FirmwareBar` → `<FirmwareButton mode="run" />`.
- `screens/MenuScreens.tsx`: `<AchievementsMenuButton />` и `<FirmwareButton mode="collection" />` в `.menu-tools`.

## После мерджа feat/data — одна замена
Адаптер уже повторяет API feat/data: состояния ачивок — массив, награда «1 из 3» — `metaExtra.pendingFirmwareChoice`, категории — id с русскими подписями в `labels.ts`, правило копий как в `copiesForNextLevel`.
После мерджа заменить **только** `apps/web/src/ui-adapter/contract.ts` кодом ниже. Компоненты не меняются.

Проверено заранее на пробной связке feat/data + feat/ui (временный worktree, удалён): typecheck 0 ошибок, lint 0 ошибок, vitest 366/366, e2e 39/39. Вживую: 48 прошивок (10 закрыты), 50 ачивок, выбор в награде «1 из 3» записывается в коллекцию и сбрасывает `pendingFirmwareChoice`, ошибок в консоли нет.

Награда «1 из 3» показывается, когда нет активного забега (после выхода с экрана конца забега), как просит feat/data.

<details><summary>Реальный contract.ts</summary>

```ts
/**
 * UI-адаптер: единственная точка, через которую интерфейс прошивок и достижений берёт данные.
 * Реальные данные: прошивки — @cyberhack/engine (firmware.ts), состояние — useGame().metaExtra,
 * ачивки — game/achievements.ts. Экспорты и их сигнатуры совпадают с прежними заглушками.
 */
import {
  canUpgrade as engineCanUpgrade,
  copiesForNextLevel,
  describeFirmwareEffects,
  getFirmware,
  isFirmwareUnlocked as engineIsUnlocked,
  listFirmwares as engineListFirmwares,
  MAX_FIRMWARE_LEVEL,
} from '@cyberhack/engine';
import { useGame } from '../game/store';
import * as ach from '../game/achievements';

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
export type Reward = ach.Reward;
export type AchievementDef = ach.AchievementDef;
export type AchievementState = ach.AchievementState;

const metaExtra = () => useGame.getState().metaExtra;

/** Хук: компонент перерисуется при смене мета-данных (коллекция, ачивки, награда). */
export function useContractVersion(): unknown {
  return useGame((s) => s.metaExtra);
}

// ---- Прошивки ----
export function listFirmwares(): readonly FirmwareDef[] {
  return engineListFirmwares();
}
export function getFirmwareDef(id: string): FirmwareDef | undefined {
  return getFirmware(id);
}
export function isFirmwareUnlocked(id: string): boolean {
  const def = getFirmware(id);
  return !!def && engineIsUnlocked(def, metaExtra());
}
export function firmwareStateOf(id: string): FirmwareState {
  return metaExtra().firmwareCollection[id] ?? { id, level: 0, copies: 0 };
}
export function copiesForNext(id: string): number | null {
  return copiesForNextLevel(metaExtra(), id);
}
export function canUpgrade(id: string): boolean {
  return engineCanUpgrade(metaExtra(), id);
}
export function upgradeFirmware(id: string): void {
  useGame.getState().upgradeFirmware(id);
}
export function firmwareEffectText(def: FirmwareDef, level: number): string {
  const fw = getFirmware(def.id);
  return fw ? describeFirmwareEffects(fw, 2, Math.max(1, Math.min(level, MAX_FIRMWARE_LEVEL))) : def.desc;
}

// ---- Награда «1 из 3»: показываем вне забега (после экрана конца забега) ----
export function usePendingFirmwareChoice(): string[] | null {
  return useGame((s) => (s.run ? null : s.metaExtra.pendingFirmwareChoice));
}
export function pickFirmwareChoice(id: string): void {
  useGame.getState().pickFirmwareChoice(id);
}
export function skipFirmwareChoice(): void {
  useGame.getState().skipFirmwareChoice();
}

// ---- Достижения ----
export function listAchievements(): readonly AchievementDef[] {
  return ach.listAchievements();
}
export function getAchievementStates(): AchievementState[] {
  return ach.getAchievementStates();
}
export const useAchievementStates = ach.useAchievementStates;
export function claimAchievement(id: string): boolean {
  return ach.claimAchievement(id);
}
export function hasUnclaimed(): boolean {
  return ach.hasUnclaimed();
}
export function useUnclaimedCount(): number {
  return ach.useAchievementStates().filter((s) => s.completed && !s.claimed).length;
}
```
</details>

Ещё (не обязательно):
- Старая панель `AchievementsPanel` в профиле и `FirmwareBar` в `Bits.tsx` больше не используются в меню/шапке. Удалить можно после мерджа (чужие файлы).
- Валюта (`metaExtra.currency`) и косметика в UI пока не показаны: нужен геймдизайн магазина.

## Пробный мердж всех трёх веток
origin/main (a4fa581) + feat/data (78114ea) + feat/perf (80db06e) + feat/ui, в таком порядке: конфликтов нет. С реальным `contract.ts`: typecheck 0 ошибок, lint 0 ошибок, vitest 366/366, e2e 39/39, шапка боя на 360px в порядке. Временный worktree удалён.

## Проверки
feat/ui на заглушках: typecheck ✓, lint ✓ (0 ошибок), vitest 333/333 ✓, e2e 39/39 ✓.
Внимание: все worktree используют порт 4173, а `reuseExistingServer` подхватывает чужой preview. Прогон шёл через временный конфиг (не закоммичен), который наследует `playwright.config.ts`, но поднимает свой сервер на 4183 с `reuseExistingServer: false`.

## Просьбы к другим веткам
- feat/perf: кнопка `.fw-btn` в шапке забега 44×44. Если perf-стили меняют `.topbar__actions`, проверьте, что она не обрезается на 390px.
