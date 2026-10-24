/**
 * КОНТРАКТ ДВИЖКА. Общий для engine, web и supabase.
 * Менять можно только расширением (новые поля — опциональные, новые варианты union).
 * Переименование или удаление существующих полей ломает UI и сохранения.
 */

/** 2 — новая карта (секторы) и ИИ врагов; забеги версии 1 не загружаются */
export const SAVE_VERSION = 2 as const;

// ---------- Базовые идентификаторы ----------

export type ClassId = 'netrunner' | 'phreaker' | 'ghost' | 'samurai' | 'engineer' | 'biohacker' | 'droneop' | 'chrono' | 'vabanker';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'zero_day';
export type CardType = 'attack' | 'skill' | 'power' | 'status' | 'curse';
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'special';
export type TargetKind = 'enemy' | 'all_enemies' | 'random_enemy' | 'self' | 'none';
/** Идентификаторы статусов: 'vulnerable', 'weak', 'strength', 'dexterity', 'poison' (вирус) и т.д. */
export type StatusId = string;

// ---------- Эффекты (data-driven) ----------

/** Источник масштабирования для damage/block: итог = amount + perAmount * count */
export type ScalePer =
  | { kind: 'target_status'; status: StatusId }
  | { kind: 'self_status'; status: StatusId }
  | { kind: 'discard_size' }
  | { kind: 'exhaust_size' }
  | { kind: 'attacks_played_this_turn' }
  | { kind: 'cards_in_hand' };

/** Условие эффекта conditional: все заданные поля должны выполняться (И). */
export interface EffectCondition {
  /** У цели (выбранный враг, иначе первый живой) есть статус > 0 */
  targetHasStatus?: StatusId;
  /** У игрока есть статус > 0 */
  selfHasStatus?: StatusId;
  /** HP игрока строго ниже n% от максимума */
  hpBelowPct?: number;
  /** В руке не больше n карт (разыгрываемая карта уже не в руке) */
  handSizeAtMost?: number;
  /** До этой карты в этот ход сыграно не меньше n атак */
  playedAttacksThisTurnAtLeast?: number;
}

export type HookTrigger = 'play_attack' | 'play_skill' | 'apply_status' | 'exhaust' | 'turn_start' | 'turn_end' | 'take_damage';

/** Хук боя игрока: при событии on срабатывают effects (как эффекты карты). */
export interface CombatHook {
  on: HookTrigger;
  effects: Effect[];
  /** id карты-источника (для UI/отладки) */
  source?: string;
}

export type Effect =
  | { type: 'damage'; amount: number; times?: number; target?: TargetKind; per?: ScalePer; perAmount?: number }
  | { type: 'block'; amount: number; per?: ScalePer; perAmount?: number }
  | { type: 'apply_status'; status: StatusId; amount: number; target?: TargetKind }
  | { type: 'draw'; amount: number }
  | { type: 'gain_energy'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'lose_hp'; amount: number }
  | { type: 'add_card'; cardId: string; to: 'hand' | 'draw' | 'discard'; count?: number }
  | { type: 'exhaust_random_hand'; amount: number }
  | { type: 'gain_gold'; amount: number }
  // ---- Расширения механик (см. mechanics.test.ts) ----
  /** Просмотреть amount верхних карт добора: статусы и проклятия среди них уходят в сброс */
  | { type: 'scry'; amount: number }
  /** Сбросить руку и взять столько же карт + amount */
  | { type: 'discard_hand_draw'; amount: number }
  /** Улучшить amount случайных карт в руке до конца боя */
  | { type: 'upgrade_random_hand'; amount: number }
  /** +amount к максимуму HP (и столько же HP); работает и вне боя */
  | { type: 'gain_max_hp'; amount: number }
  /** Лечение на amount% от максимума HP; работает и вне боя */
  | { type: 'heal_pct'; amount: number }
  /** Следующие amount сыгранных карт срабатывают дважды (статус «Эхо») */
  | { type: 'double_next'; amount: number }
  /** Снять с игрока до amount разных дебаффов (99 — все) */
  | { type: 'cleanse'; amount: number }
  /** Получить amount расходников (potionId — конкретный, иначе случайный); при полных слотах — ничего */
  | { type: 'gain_potion'; amount: number; potionId?: string }
  /** Азарт: с шансом amount% срабатывают эффекты win, иначе lose (бросок по потоку ГСЧ combat) */
  | { type: 'gamble'; amount: number; win: Effect[]; lose?: Effect[] }
  /** Условный эффект: если if выполняется — then, иначе else */
  | { type: 'conditional'; if: EffectCondition; then: Effect[]; else?: Effect[] }
  /** Умножить стаки статуса у цели (floor) */
  | { type: 'multiply_status'; status: StatusId; factor: number; target?: TargetKind }
  /** Снять все стаки статуса с цели и нанести стаки*damageMult урона (через блок) */
  | { type: 'consume_status'; status: StatusId; damageMult: number; target?: TargetKind }
  /** Добавить хук до конца боя (обычно у power-карт) */
  | { type: 'add_hook'; hook: CombatHook }
  // ---- Эффекты врагов ----
  /** Призвать amount врагов enemyId, пока живых врагов меньше max (по умолчанию SUMMON_LIMIT) */
  | { type: 'summon'; enemyId: string; amount: number; max?: number }
  /** Блок amount всем живым союзникам (self — и себе) */
  | { type: 'shield_allies'; amount: number; self?: boolean };

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
  /** Удержание: не сбрасывается из руки в конце хода */
  retain?: boolean;
  /** Врождённая: всегда в стартовой руке боя */
  innate?: boolean;
  /** Эхо-ключ: если после розыгрыша энергия стала 0 — эффекты срабатывают ещё раз */
  echo?: boolean;
  /** Архетипы (движком в бою не используются) */
  tags?: string[];
  upgrade?: {
    name?: string;
    cost?: number;
    effects?: Effect[];
    description?: string;
    exhaust?: boolean;
    retain?: boolean;
    innate?: boolean;
    echo?: boolean;
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
  act: 1 | 2 | 3 | 4;
  hp: [min: number, max: number];
  moves: EnemyMove[];
  ai: EnemyAi;
  description?: string;
  /** Подсказка для художника: семейство силуэта, акцентный цвет, заметка */
  art?: EnemyArtSpec;
}

export type EnemyArtFamily = 'drone' | 'bot' | 'worm' | 'eye' | 'daemon' | 'construct' | 'swarm' | 'ghost' | 'beast' | 'core';
export type EnemyArtAccent = 'cyan' | 'magenta' | 'acid' | 'orange' | 'green' | 'violet' | 'red';
export interface EnemyArtSpec {
  family: EnemyArtFamily;
  accent: EnemyArtAccent;
  note: string;
}

/** Условие хода врага; все заданные поля должны выполниться */
export interface AiCondition {
  /** Ровно этот ход врага (1 — первый) */
  turn?: number;
  /** Каждый N-й ход врага */
  every?: number;
  /** HP врага в % строго меньше */
  hpBelow?: number;
  /** HP врага в % не меньше */
  hpAtLeast?: number;
  /** Живых врагов (включая себя) не больше / не меньше */
  enemiesAtMost?: number;
  enemiesAtLeast?: number;
  /** В прошлом ходу игрок разыграл карту этого типа ('attack', 'skill', 'power') или с этим id */
  playerPlayed?: string;
  /** Сколько таких карт минимум (по умолчанию 1) */
  playerPlayedCount?: number;
}

/** Фаза врага: активна, пока HP% <= hpAtMost (берётся фаза с наименьшим подходящим порогом) */
export interface EnemyPhase {
  hpAtMost: number;
  /** Ходы фазы по кругу (или weights — взвешенно) */
  order?: string[];
  weights?: Record<string, number>;
  /** Ход сразу при входе в фазу */
  onEnter?: string;
}

export interface ScriptedStep {
  move: string;
  when?: AiCondition;
  /** Только один раз за бой */
  once?: boolean;
}

/**
 * ИИ врага: 'cycle' — по кругу; 'random' — взвешенно без 3 повторов подряд;
 * 'phased' — фазы по порогам HP; 'scripted' — первый подходящий шаг скрипта, иначе fallback по кругу.
 */
export type EnemyAi =
  | { kind: 'cycle'; order: string[] }
  | { kind: 'random'; weights: Record<string, number> }
  | { kind: 'phased'; phases: EnemyPhase[] }
  | { kind: 'scripted'; script: ScriptedStep[]; fallback: string[] };

/** Правило зоны: none — нет; overheat — каждый 3-й ход враги +Разгон; adaptive — сопротивление к повторной атаке; distortion — часть намерений скрыта */
export type ZoneRuleId = 'none' | 'overheat' | 'adaptive' | 'distortion';

/** Группа врагов для узла карты */
export interface EncounterDef {
  id: string;
  act: 1 | 2 | 3 | 4;
  tier: 'normal' | 'elite' | 'boss';
  enemies: string[]; // id врагов, порядок = слева направо
  /** Только для первых 3 боёв акта (лёгкие) */
  early?: boolean;
  /** Вес при выборе босса акта (по умолчанию 1; секретный босс — меньше) */
  weight?: number;
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
  // ---- Импланты v2 (см. implants.ts) ----
  /** Цвет (редкость); нет поля — старый формат, считается по rarity */
  color?: import('./implants').ImplantColor;
  /** buff — польза, debuff — вред (все красные) */
  kind?: 'buff' | 'debuff';
  /** Сколько действует; нет поля — до конца забега */
  duration?: import('./implants').ImplantDuration;
  /** Классовый: id полной версии (у ослабленной) */
  fullId?: string;
  /** Классовый: id ослабленной версии (у полной) */
  weakId?: string;
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

export type EventSpecial =
  | 'remove_card'
  | 'upgrade_card'
  | 'random_relic'
  | 'random_card'
  | 'fight'
  | 'fight_elite'
  | 'transform_card'
  | 'lose_potion'
  | 'remove_curse';

/** Условие доступности варианта события */
export interface EventRequires {
  /** не меньше N кредитов */
  gold?: number;
  /** HP строго больше N */
  hp?: number;
  /** есть хотя бы один расходник */
  potion?: boolean;
  /** в колоде есть карта этого типа */
  cardType?: string;
  /** есть улучшаемая карта */
  upgradable?: boolean;
  /** флаг цепочки событий выставлен / не выставлен */
  flag?: string;
  noFlag?: string;
}

export interface EventResult {
  effects: Effect[]; // плюс специальные: удалить/улучшить карту — через screen
  /** Специальное действие после эффектов */
  special?: EventSpecial;
  /** Запомнить выбор (для цепочек событий) */
  setFlag?: string;
  /** Текст итога, показывается на карте */
  text?: string;
}

export interface EventOption extends EventResult {
  label: string;
  requires?: EventRequires;
  /** Исходы с вероятностями (по весам, поток ГСЧ events); вместо effects/special */
  outcomes?: (EventResult & { weight: number })[];
}

export interface EventDef {
  id: string;
  name: string;
  text: string;
  act?: 1 | 2 | 3 | 4;
  /** Событие появляется только если флаг выставлен / не выставлен */
  requiresFlag?: string;
  excludesFlag?: string;
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
  /** Намерение скрыто правилом зоны (kind = 'unknown') */
  hidden?: boolean;
}

export interface EnemyState extends CombatantState {
  uid: string;
  defId: string;
  intent: Intent;
  moveHistory: string[];
  /** ИИ 'phased': текущая фаза (индекс в ai.phases) и длина moveHistory при входе в неё */
  aiPhase?: number;
  aiPhaseStart?: number;
  /** Призван в бою */
  summoned?: boolean;
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
  /** Режим «Перегрев»: шкала 0..100 (нет поля = режим выключен) */
  heat?: number;
  /** Охлаждение (кнопка) уже использовано в этот ход */
  heatCooled?: boolean;
  /** «Слив ядра» уже использован в этот ход */
  heatVented?: boolean;
  /** Неделя «Охота за головой»: uid помеченного врага (нет поля = нет метки) */
  bountyUid?: string;
  /** Неделя «Нестабильный код»: uid карты в руке, что сработает дважды и сгорит */
  volatileUid?: string;
  /** Хуки игрока (от power-карт); нет поля = нет хуков */
  hooks?: CombatHook[];
  /** Атак сыграно в этот ход (сброс в начале хода) */
  attacksThisTurn?: number;
  /** Правило зоны этого боя (нет поля = без правила) */
  zoneRule?: ZoneRuleId;
  /** id карт, разыгранных игроком в текущем (или прошлом, во время хода врагов) ходу */
  playedThisTurn?: string[];
  /** adaptive: подряд сыгранные одинаковые атаки */
  attackStreak?: { cardId: string; count: number };
  /** adaptive: сопротивление к атаке cardId до конца хода turn */
  resist?: { cardId: string; turn: number };
}

// ---------- Карта забега ----------

export type MapNodeKind = 'combat' | 'elite' | 'event' | 'shop' | 'rest' | 'treasure' | 'boss' | 'lab' | 'blackbox' | 'relay' | 'ambush'
  /** Импланты v2: treasure и blackbox больше не генерируются (оставлены для старых сохранений) */
  | 'signal' | 'synth' | 'ripperdoc' | 'quarantine' | 'beacon';

export interface MapNode {
  id: string; // `${act}-${row}-${col}`
  act: 1 | 2 | 3 | 4;
  row: number; // 0..14, boss = 15
  col: number; // 0..6
  kind: MapNodeKind;
  next: string[];
  /** Сектор зоны (1..3); у босса нет */
  sector?: 1 | 2 | 3;
}

// ---------- Экраны ----------

export type RewardItem =
  | { kind: 'gold'; amount: number }
  | { kind: 'card_choice'; cardIds: string[] }
  | { kind: 'relic'; relicId: string }
  | { kind: 'firmware'; firmwareId: string }
  | { kind: 'potion'; potionId: string };

export interface ShopItem {
  kind: 'card' | 'relic' | 'remove' | 'potion' | 'upgrade' | 'refresh' | 'remove_red';
  id?: string; // id карты/реликвии/расходника
  price: number;
  sold: boolean;
  /** Распродажа (−30%); price — уже со скидкой */
  sale?: boolean;
  /** Цена без скидки */
  basePrice?: number;
  /** refresh: сколько обновлений уже сделано */
  n?: number;
}

export type Screen =
  | { kind: 'map' }
  | { kind: 'combat' }
  | { kind: 'reward'; items: RewardItem[] }
  | { kind: 'card_pick'; cardIds: string[]; rewardIndex: number }
  | { kind: 'shop'; items: ShopItem[] }
  | { kind: 'rest' }
  | { kind: 'lab' }
  | { kind: 'blackbox' }
  | { kind: 'relay' }
  /** Импланты v2: узлы с выбором через node_choice; options — что показать (порядок = index) */
  | { kind: 'implant_node'; node: 'signal' | 'synth' | 'ripperdoc' | 'quarantine' | 'beacon'; options: import('./implants').ImplantNodeOption[] }
  | { kind: 'event'; eventId: string }
  | { kind: 'select_deck_card'; purpose: 'remove' | 'upgrade' | 'transform'; returnTo: 'map' | 'shop'; /** uid карт, из которых можно выбрать улучшение (1 из 3) */ offer?: string[] }
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
  /** Режим сложности (поверх Ascension); нет поля = normal */
  difficulty?: Difficulty;
  /** Еженедельный вызов: id недели ('2026-W43'); нет поля = обычный забег */
  weekly?: string;
  /** Режим «Перегрев»: в бою работает шкала Heat; нет поля = обычный забег */
  heat?: boolean;
  /** Правила зон отключены (тестовые фикстуры) */
  noZoneRules?: boolean;
  act: 1 | 2 | 3 | 4;
  floor: number; // общий счётчик пройденных узлов
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardInstance[];
  /** Импланты игрока (id). Внутри кода — «relic», в игре — «имплант» */
  relics: string[];
  /** Состояние условий имплантов: id → счётчики (см. implants.ts) */
  implantState?: Record<string, import('./implants').ImplantProgress>;
  /** Шанс выпадения полного Классового импланта (база CLASS_FULL_BASE, Маяк +BEACON_BONUS) */
  classFullChance?: number;
  /** Акты, в которых уже взят Маяк */
  beaconActs?: number[];
  /** Сколько красных имплантов снято за кредиты (цена растёт) */
  redRemovals?: number;
  /** Очередь только что полученных имплантов — UI показывает крупную карточку, ack_implant убирает первый */
  implantQueue?: string[];
  /** Прошивки: работают, пока в колоде собраны их карты (см. firmware.ts) */
  firmwares?: string[];
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
  locked?: { cards: string[]; relics: string[]; firmwares?: string[] };
  /** Прошивки, улучшенные в этом забеге (каждую можно улучшить один раз) */
  upgradedFirmwares?: string[];
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
  /** Расходники («Модули-инъекции»), до POTION_SLOTS штук; нет поля = пусто */
  potions?: string[];
  /** Мутаторы забега (см. mutators.ts); нет поля = без мутаторов */
  mutators?: string[];
  /** Дополнительные потоки ГСЧ, создаются лениво (старые сохранения их не имеют) */
  rngExt?: Record<string, number>;
  /** Сколько максимума HP уже получено эффектами в бою (карты, расходники) — потолок MAX_HP_GAIN_IN_COMBAT на забег */
  combatMaxHpGain?: number;
  /** Предложенные карты для улучшения/превращения по узлу: повторное открытие экрана не пересоздаёт набор */
  offers?: Record<string, string[]>;
  /** Последние предложенные в наградах карты — чтобы не повторялись подряд. */
  recentOffers?: string[];
  /** Флаги цепочек событий */
  flags?: string[];
  /** Итог последнего события/узла (показывается на карте) */
  eventResult?: string;
  /** Сколько раз улучшали карту в магазине */
  shopUpgrades?: number;
}

// ---------- Действия игрока ----------

export type Action =
  | { type: 'choose_node'; nodeId: string }
  | { type: 'play_card'; cardUid: string; targetUid?: string }
  | { type: 'end_turn' }
  /** Режим «Перегрев»: охладить (−30 Heat, −6 HP, раз в ход) */
  | { type: 'cool' }
  /** Режим «Перегрев»: слить ядро (Heat ≥ 50) — урон всем врагам, Heat падает до 15, раз в ход */
  | { type: 'vent' }
  | { type: 'take_reward'; index: number }
  | { type: 'pick_card'; cardId: string | null } // null = пропустить
  | { type: 'leave_reward' }
  | { type: 'shop_buy'; index: number }
  | { type: 'leave_shop' }
  | { type: 'rest_heal' }
  | { type: 'rest_upgrade' } // переводит на select_deck_card
  /** Привал: выжечь красный имплант (вместо отдыха/улучшения) */
  | { type: 'rest_burn_red'; relicId: string }
  /** Закрыть крупную карточку полученного импланта (первый в implantQueue) */
  | { type: 'ack_implant' }
  | { type: 'select_deck_card'; cardUid: string | null }
  /** На экране улучшения (select_deck_card, purpose upgrade) — улучшить прошивку вместо карты */
  | { type: 'upgrade_firmware'; firmwareId: string }
  | { type: 'event_choice'; index: number }
  /** Выбор на экране lab / blackbox / relay */
  | { type: 'node_choice'; index: number }
  | { type: 'leave_node' }
  /** Выпить расходник из слота; в бою — любой, вне боя — только лечебные. targetUid — для расходников на врага */
  | { type: 'use_potion'; slot: number; targetUid?: string }
  | { type: 'discard_potion'; slot: number };

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
  | { type: 'firmware_obtained'; firmwareId: string }
  | { type: 'turn_started'; turn: number }
  | { type: 'combat_won' }
  | { type: 'combat_lost' }
  | { type: 'screen_changed'; screen: Screen['kind'] }
  // ---- Расширения движка ----
  | { type: 'deck_shuffled'; count: number }
  | { type: 'card_exhausted'; cardUid: string }
  | { type: 'gold_changed'; amount: number }
  | { type: 'relic_obtained'; relicId: string }
  /** Имплант кончился (условие выполнено / бои закончились) или снят */
  | { type: 'implant_expired'; relicId: string; reason: 'duration' | 'task' | 'removed' | 'synth' | 'swap' }
  | { type: 'implant_progress'; relicId: string; progress: number; goal: number }
  | { type: 'card_obtained'; defId: string }
  | { type: 'card_removed'; cardUid: string; defId: string }
  | { type: 'card_upgraded'; cardUid: string; defId: string }
  | { type: 'firmware_upgraded'; firmwareId: string }
  | { type: 'act_started'; act: 1 | 2 | 3 | 4 }
  | { type: 'potion_obtained'; potionId: string }
  | { type: 'potion_used'; potionId: string; slot: number }
  | { type: 'potion_discarded'; potionId: string; slot: number }
  /** Эхо: карта сработала повторно */
  | { type: 'card_echoed'; cardUid: string }
  /** Барьер поглотил удар */
  | { type: 'barrier_absorbed'; targetUid: string | 'player'; amount: number }
  /** Карты ушли из руки/добора в сброс эффектом (scry, discard_hand_draw) */
  | { type: 'cards_discarded'; count: number }
  /** Враг призван */
  | { type: 'enemy_summoned'; enemyUid: string; defId: string }
  /** Сработало правило зоны */
  | { type: 'zone_rule'; rule: ZoneRuleId };

export interface ActionResult {
  state: RunState;
  events: GameEvent[];
}

export interface NewRunOptions {
  seed: string;
  classId: ClassId;
  ascension?: number;
  difficulty?: Difficulty;
  /** Еженедельный вызов: id недели; мутаторы и правило недели выводятся из него */
  weekly?: string;
  /** Режим «Перегрев» */
  heat?: boolean;
  /** false — без правил зон (тесты) */
  zoneRules?: boolean;
  /**
   * Метапрогрессия: открытые игроком карты/реликвии из числа закрываемых (см. unlocks.ts).
   * Не передано — открыто всё (тесты, симулятор, еженедельный вызов).
   */
  unlocked?: { cards?: readonly string[]; relics?: readonly string[]; firmwares?: readonly string[] };
  /** Мутаторы забега (id из mutators.ts); в еженедельном вызове игнорируются (задаются неделей) */
  mutators?: readonly string[];
}

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidActionError';
  }
}
