/**
 * КОНТРАКТ ДВИЖКА. Общий для engine, web и supabase.
 * Менять можно только расширением (новые поля — опциональные, новые варианты union).
 * Переименование или удаление существующих полей ломает UI и сохранения.
 */

export const SAVE_VERSION = 1 as const;

// ---------- Базовые идентификаторы ----------

export type ClassId = 'netrunner' | 'phreaker' | 'ghost';
export type CardType = 'attack' | 'skill' | 'power' | 'status' | 'curse';
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'special';
export type TargetKind = 'enemy' | 'all_enemies' | 'random_enemy' | 'self' | 'none';
/** Идентификаторы статусов: 'vulnerable', 'weak', 'strength', 'dexterity', 'poison' (вирус) и т.д. */
export type StatusId = string;

// ---------- Эффекты (data-driven) ----------

export type Effect =
  | { type: 'damage'; amount: number; times?: number; target?: TargetKind }
  | { type: 'block'; amount: number }
  | { type: 'apply_status'; status: StatusId; amount: number; target?: TargetKind }
  | { type: 'draw'; amount: number }
  | { type: 'gain_energy'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'lose_hp'; amount: number }
  | { type: 'add_card'; cardId: string; to: 'hand' | 'draw' | 'discard'; count?: number }
  | { type: 'exhaust_random_hand'; amount: number }
  | { type: 'gain_gold'; amount: number };

// ---------- Определения контента (JSON-данные) ----------

export interface CardDef {
  id: string;
  name: string;
  classId: ClassId | 'neutral';
  type: CardType;
  rarity: Rarity;
  cost: number; // -1 = X, -2 = неиграбельна
  target: TargetKind;
  effects: Effect[];
  /** Текст с плейсхолдерами {damage}, {block} и т.п. либо готовый текст */
  description: string;
  exhaust?: boolean;
  ethereal?: boolean;
  upgrade?: {
    name?: string;
    cost?: number;
    effects?: Effect[];
    description?: string;
    exhaust?: boolean;
  };
}

export interface StatusDef {
  id: StatusId;
  name: string;
  description: string;
  kind: 'buff' | 'debuff';
  /** intensity — копится и не тает; duration — уменьшается на 1 в конце хода */
  stacking: 'intensity' | 'duration';
}

export type IntentKind = 'attack' | 'defend' | 'buff' | 'debuff' | 'attack_defend' | 'attack_debuff' | 'unknown';

export interface EnemyMove {
  id: string;
  name: string;
  intent: IntentKind;
  effects: Effect[]; // target 'self' = враг, по умолчанию цель атаки — игрок
}

export interface EnemyDef {
  id: string;
  name: string;
  tier: 'normal' | 'elite' | 'boss';
  act: 1 | 2 | 3;
  hp: [min: number, max: number];
  moves: EnemyMove[];
  /** Простой ИИ: 'cycle' — по кругу, 'random' — взвешенный выбор без 3 повторов подряд */
  ai: { kind: 'cycle'; order: string[] } | { kind: 'random'; weights: Record<string, number> };
  description?: string;
}

/** Группа врагов для узла карты */
export interface EncounterDef {
  id: string;
  act: 1 | 2 | 3;
  tier: 'normal' | 'elite' | 'boss';
  enemies: string[]; // id врагов, порядок = слева направо
  /** Только для первых 3 боёв акта (лёгкие) */
  early?: boolean;
}

export type RelicTrigger =
  | 'combat_start'
  | 'turn_start'
  | 'turn_end'
  | 'card_played'
  | 'attack_played'
  | 'combat_end'
  | 'pickup'
  | 'rest';

export interface RelicDef {
  id: string;
  name: string;
  rarity: 'starter' | 'common' | 'uncommon' | 'rare' | 'boss' | 'shop';
  classId: ClassId | 'neutral';
  description: string;
  trigger: RelicTrigger;
  effects: Effect[];
  /** Срабатывает каждые N триггеров (например, каждая 3-я атака) */
  every?: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  description: string;
  maxHp: number;
  startingGold: number;
  startingDeck: string[]; // id карт
  startingRelic: string;
}

export interface EventOption {
  label: string;
  effects: Effect[]; // плюс специальные: удалить/улучшить карту — через screen
  /** Специальное действие после эффектов */
  special?: 'remove_card' | 'upgrade_card' | 'random_relic' | 'random_card' | 'fight';
}

export interface EventDef {
  id: string;
  name: string;
  text: string;
  act?: 1 | 2 | 3;
  options: EventOption[];
}

// ---------- Состояние боя ----------

export interface CardInstance {
  uid: string;
  defId: string;
  upgraded: boolean;
}

export interface CombatantState {
  hp: number;
  maxHp: number;
  block: number;
  statuses: Record<StatusId, number>;
}

export interface Intent {
  kind: IntentKind;
  moveId: string;
  /** Итоговый урон за удар с учётом статусов (для отображения) */
  damage?: number;
  times?: number;
}

export interface EnemyState extends CombatantState {
  uid: string;
  defId: string;
  intent: Intent;
  moveHistory: string[];
}

export interface CombatState {
  turn: number;
  energy: number;
  maxEnergy: number;
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  player: CombatantState;
  enemies: EnemyState[];
  phase: 'player' | 'won' | 'lost';
  /** Счётчики для реликвий с every */
  counters: Record<string, number>;
}

// ---------- Карта забега ----------

export type MapNodeKind = 'combat' | 'elite' | 'event' | 'shop' | 'rest' | 'treasure' | 'boss';

export interface MapNode {
  id: string; // `${act}-${row}-${col}`
  act: 1 | 2 | 3;
  row: number; // 0..14, boss = 15
  col: number; // 0..6
  kind: MapNodeKind;
  next: string[];
}

// ---------- Экраны ----------

export type RewardItem =
  | { kind: 'gold'; amount: number }
  | { kind: 'card_choice'; cardIds: string[] }
  | { kind: 'relic'; relicId: string };

export interface ShopItem {
  kind: 'card' | 'relic' | 'remove';
  id?: string; // id карты/реликвии
  price: number;
  sold: boolean;
}

export type Screen =
  | { kind: 'map' }
  | { kind: 'combat' }
  | { kind: 'reward'; items: RewardItem[] }
  | { kind: 'card_pick'; cardIds: string[]; rewardIndex: number }
  | { kind: 'shop'; items: ShopItem[] }
  | { kind: 'rest' }
  | { kind: 'event'; eventId: string }
  | { kind: 'select_deck_card'; purpose: 'remove' | 'upgrade'; returnTo: 'map' | 'shop' }
  | { kind: 'game_over'; victory: boolean };

// ---------- Забег ----------

export interface RunStats {
  enemiesKilled: number;
  elitesKilled: number;
  bossesKilled: number;
  damageDealt: number;
  cardsPlayed: number;
  // ---- Расширения (опциональные, для достижений) ----
  /** Всего вируса наложено на врагов за забег */
  virusApplied?: number;
  /** Максимум вируса, наложенного на врагов за один бой */
  maxVirusInCombat?: number;
  /** Самый сильный удар по врагу (урон после блока) */
  maxHit?: number;
  /** Максимум золота на руках */
  maxGold?: number;
  /** Максимум карт, сыгранных за один ход */
  maxCardsInTurn?: number;
}

export interface RunState {
  version: typeof SAVE_VERSION;
  seed: string;
  classId: ClassId;
  ascension: number; // 0..15
  daily: boolean;
  act: 1 | 2 | 3;
  floor: number; // общий счётчик пройденных узлов
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardInstance[];
  relics: string[];
  map: MapNode[];
  currentNodeId: string | null;
  visited: string[];
  screen: Screen;
  combat: CombatState | null;
  /** Состояние ГСЧ (сериализуемое), отдельные потоки для разных систем */
  rng: Record<'map' | 'combat' | 'cards' | 'rewards' | 'events' | 'shop' | 'ai', number>;
  uidCounter: number;
  status: 'active' | 'won' | 'lost';
  score: number;
  stats: RunStats;
  // ---- Расширения движка (опциональные) ----
  /** Метапрогрессия: карты/реликвии, закрытые для этого забега (не выпадают в наградах и магазине) */
  locked?: { cards: string[]; relics: string[] };
  /** Награды, ожидающие на экране reward, пока открыт card_pick */
  pendingRewards?: RewardItem[];
  /** Товары магазина, пока открыт select_deck_card (удаление карты из магазина) */
  savedShop?: ShopItem[];
  /** Сколько раз удаляли карту в магазине (цена 75 + 25 × n) */
  cardRemovals?: number;
  /** Уже показанные события (не повторяются, пока есть другие) */
  seenEvents?: string[];
  /** Встреча с боссом текущего акта (известна заранее для UI) */
  bossEncounterId?: string;
}

// ---------- Действия игрока ----------

export type Action =
  | { type: 'choose_node'; nodeId: string }
  | { type: 'play_card'; cardUid: string; targetUid?: string }
  | { type: 'end_turn' }
  | { type: 'take_reward'; index: number }
  | { type: 'pick_card'; cardId: string | null } // null = пропустить
  | { type: 'leave_reward' }
  | { type: 'shop_buy'; index: number }
  | { type: 'leave_shop' }
  | { type: 'rest_heal' }
  | { type: 'rest_upgrade' } // переводит на select_deck_card
  | { type: 'select_deck_card'; cardUid: string | null }
  | { type: 'event_choice'; index: number };

// ---------- События для анимаций UI ----------

export type GameEvent =
  | { type: 'card_played'; cardUid: string; defId: string }
  | { type: 'damage'; targetUid: string | 'player'; amount: number; blocked: number }
  | { type: 'block_gained'; targetUid: string | 'player'; amount: number }
  | { type: 'status_applied'; targetUid: string | 'player'; status: StatusId; amount: number }
  | { type: 'heal'; targetUid: string | 'player'; amount: number }
  | { type: 'enemy_died'; enemyUid: string }
  | { type: 'enemy_move'; enemyUid: string; moveId: string }
  | { type: 'cards_drawn'; count: number }
  | { type: 'relic_triggered'; relicId: string }
  | { type: 'turn_started'; turn: number }
  | { type: 'combat_won' }
  | { type: 'combat_lost' }
  | { type: 'screen_changed'; screen: Screen['kind'] }
  // ---- Расширения движка ----
  | { type: 'deck_shuffled'; count: number }
  | { type: 'card_exhausted'; cardUid: string }
  | { type: 'gold_changed'; amount: number }
  | { type: 'relic_obtained'; relicId: string }
  | { type: 'card_obtained'; defId: string }
  | { type: 'card_removed'; cardUid: string; defId: string }
  | { type: 'card_upgraded'; cardUid: string; defId: string }
  | { type: 'act_started'; act: 1 | 2 | 3 };

export interface ActionResult {
  state: RunState;
  events: GameEvent[];
}

export interface NewRunOptions {
  seed: string;
  classId: ClassId;
  ascension?: number;
  daily?: boolean;
  /**
   * Метапрогрессия: открытые игроком карты/реликвии из числа закрываемых (см. unlocks.ts).
   * Не передано — открыто всё (тесты, симулятор, ежедневный забег).
   */
  unlocked?: { cards?: readonly string[]; relics?: readonly string[] };
}

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidActionError';
  }
}
