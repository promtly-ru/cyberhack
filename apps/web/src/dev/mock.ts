/**
 * МОК ДВИЖКА. Используется только пока функции @cyberhack/engine бросают 'not implemented'.
 * Реализация упрощённая: хватает, чтобы прокликать все экраны UI.
 * Импортировать только из game/engine.ts.
 */
import type {
  Action,
  ActionResult,
  CardDef,
  CardInstance,
  ClassDef,
  ClassId,
  CombatState,
  CombatantState,
  Effect,
  EncounterDef,
  EnemyDef,
  EnemyState,
  EventDef,
  GameEvent,
  Intent,
  MapNode,
  MapNodeKind,
  NewRunOptions,
  RelicDef,
  RelicTrigger,
  RewardItem,
  RunState,
  ShopItem,
  StatusDef,
} from '@cyberhack/engine';

// ---------------------------------------------------------------------------
// Контент
// ---------------------------------------------------------------------------

export const MOCK_STATUSES: StatusDef[] = [
  { id: 'vulnerable', name: 'Уязвимость', kind: 'debuff', stacking: 'duration', description: 'Получает на 50% больше урона от атак.' },
  { id: 'weak', name: 'Слабость', kind: 'debuff', stacking: 'duration', description: 'Наносит на 25% меньше урона атаками.' },
  { id: 'frail', name: 'Хрупкость', kind: 'debuff', stacking: 'duration', description: 'Получает на 25% меньше блока от карт.' },
  { id: 'poison', name: 'Вирус', kind: 'debuff', stacking: 'intensity', description: 'В начале хода теряет столько HP, сколько стаков вируса, затем вирус ослабевает на 1.' },
  { id: 'strength', name: 'Разгон', kind: 'buff', stacking: 'intensity', description: 'Каждая атака наносит больше урона на величину Разгона.' },
  { id: 'dexterity', name: 'Отклик', kind: 'buff', stacking: 'intensity', description: 'Каждая карта блока даёт больше блока на величину Отклика.' },
  { id: 'thorns', name: 'Обратный трейс', kind: 'buff', stacking: 'intensity', description: 'Атакующий получает столько урона в ответ.' },
  { id: 'regen', name: 'Самовосстановление', kind: 'buff', stacking: 'duration', description: 'В конце хода восстанавливает HP, равное числу стаков.' },
];

const c = (def: CardDef): CardDef => def;

export const MOCK_CARDS: CardDef[] = [
  c({ id: 'ping', name: 'Пинг', classId: 'neutral', type: 'attack', rarity: 'starter', cost: 1, target: 'enemy',
    effects: [{ type: 'damage', amount: 6 }], description: 'Нанести {damage} урона.',
    upgrade: { effects: [{ type: 'damage', amount: 9 }] } }),
  c({ id: 'firewall', name: 'Файрвол', classId: 'neutral', type: 'skill', rarity: 'starter', cost: 1, target: 'self',
    effects: [{ type: 'block', amount: 5 }], description: 'Получить {block} блока.',
    upgrade: { effects: [{ type: 'block', amount: 8 }] } }),
  c({ id: 'buffer_overflow', name: 'Переполнение буфера', classId: 'netrunner', type: 'attack', rarity: 'starter', cost: 2, target: 'enemy',
    effects: [{ type: 'damage', amount: 8 }, { type: 'apply_status', status: 'vulnerable', amount: 2 }],
    description: 'Нанести {damage} урона. Наложить {amount} Уязвимости.',
    upgrade: { effects: [{ type: 'damage', amount: 10 }, { type: 'apply_status', status: 'vulnerable', amount: 3 }] } }),
  c({ id: 'ddos', name: 'DDoS-атака', classId: 'netrunner', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    effects: [{ type: 'damage', amount: 3, times: 3 }], description: 'Нанести {damage} урона {times} раза.',
    upgrade: { effects: [{ type: 'damage', amount: 4, times: 3 }] } }),
  c({ id: 'sql_injection', name: 'SQL-инъекция', classId: 'neutral', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    effects: [{ type: 'damage', amount: 7 }, { type: 'apply_status', status: 'weak', amount: 1 }],
    description: 'Нанести {damage} урона. Наложить {amount} Слабости.',
    upgrade: { effects: [{ type: 'damage', amount: 9 }, { type: 'apply_status', status: 'weak', amount: 2 }] } }),
  c({ id: 'packet_storm', name: 'Шторм пакетов', classId: 'netrunner', type: 'attack', rarity: 'common', cost: 1, target: 'all_enemies',
    effects: [{ type: 'damage', amount: 8, target: 'all_enemies' }], description: 'Нанести {damage} урона ВСЕМ врагам.',
    upgrade: { effects: [{ type: 'damage', amount: 11, target: 'all_enemies' }] } }),
  c({ id: 'brute_force', name: 'Брутфорс', classId: 'neutral', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    effects: [{ type: 'damage', amount: 14 }], description: 'Нанести {damage} урона.',
    upgrade: { effects: [{ type: 'damage', amount: 19 }] } }),
  c({ id: 'zero_day', name: 'Эксплойт нулевого дня', classId: 'netrunner', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy',
    effects: [{ type: 'damage', amount: 28 }], description: 'Нанести {damage} урона. Сгорает.', exhaust: true,
    upgrade: { cost: 2 } }),
  c({ id: 'backdoor', name: 'Бэкдор', classId: 'neutral', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    effects: [{ type: 'damage', amount: 4 }, { type: 'draw', amount: 1 }], description: 'Нанести {damage} урона. Взять {draw} карту.',
    upgrade: { effects: [{ type: 'damage', amount: 6 }, { type: 'draw', amount: 1 }] } }),
  c({ id: 'encrypt', name: 'Шифрование', classId: 'neutral', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    effects: [{ type: 'block', amount: 8 }], description: 'Получить {block} блока.',
    upgrade: { effects: [{ type: 'block', amount: 11 }] } }),
  c({ id: 'vpn_tunnel', name: 'VPN-туннель', classId: 'neutral', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    effects: [{ type: 'block', amount: 5 }, { type: 'draw', amount: 1 }], description: 'Получить {block} блока. Взять {draw} карту.',
    upgrade: { effects: [{ type: 'block', amount: 7 }, { type: 'draw', amount: 1 }] } }),
  c({ id: 'port_scan', name: 'Сканирование портов', classId: 'neutral', type: 'skill', rarity: 'common', cost: 1, target: 'none',
    effects: [{ type: 'draw', amount: 2 }], description: 'Взять {draw} карты.', upgrade: { cost: 0 } }),
  c({ id: 'overclock', name: 'Разгон ядра', classId: 'netrunner', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    effects: [{ type: 'gain_energy', amount: 2 }, { type: 'lose_hp', amount: 3 }], exhaust: true,
    description: 'Получить {energy} энергии. Потерять {lose} HP. Сгорает.',
    upgrade: { effects: [{ type: 'gain_energy', amount: 3 }, { type: 'lose_hp', amount: 3 }] } }),
  c({ id: 'phishing', name: 'Фишинг', classId: 'neutral', type: 'skill', rarity: 'common', cost: 1, target: 'enemy',
    effects: [{ type: 'apply_status', status: 'weak', amount: 2 }, { type: 'apply_status', status: 'vulnerable', amount: 2 }],
    description: 'Наложить 2 Слабости и 2 Уязвимости.',
    upgrade: { effects: [{ type: 'apply_status', status: 'weak', amount: 3 }, { type: 'apply_status', status: 'vulnerable', amount: 3 }], description: 'Наложить 3 Слабости и 3 Уязвимости.' } }),
  c({ id: 'worm', name: 'Сетевой червь', classId: 'phreaker', type: 'skill', rarity: 'starter', cost: 1, target: 'enemy',
    effects: [{ type: 'apply_status', status: 'poison', amount: 5 }], description: 'Заразить: {amount} Вируса.',
    upgrade: { effects: [{ type: 'apply_status', status: 'poison', amount: 7 }] } }),
  c({ id: 'trojan', name: 'Троян', classId: 'phreaker', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    effects: [{ type: 'damage', amount: 5 }, { type: 'apply_status', status: 'poison', amount: 3 }],
    description: 'Нанести {damage} урона. Заразить: {amount} Вируса.',
    upgrade: { effects: [{ type: 'damage', amount: 7 }, { type: 'apply_status', status: 'poison', amount: 4 }] } }),
  c({ id: 'logic_bomb', name: 'Логическая бомба', classId: 'phreaker', type: 'attack', rarity: 'uncommon', cost: 2, target: 'all_enemies',
    effects: [{ type: 'damage', amount: 12, target: 'all_enemies' }], exhaust: true, description: 'Нанести {damage} урона ВСЕМ врагам. Сгорает.',
    upgrade: { effects: [{ type: 'damage', amount: 16, target: 'all_enemies' }] } }),
  c({ id: 'botnet', name: 'Ботнет', classId: 'netrunner', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    effects: [{ type: 'apply_status', status: 'strength', amount: 2, target: 'self' }], description: 'Получить {amount} Разгона.',
    upgrade: { effects: [{ type: 'apply_status', status: 'strength', amount: 3, target: 'self' }] } }),
  c({ id: 'neural_boost', name: 'Нейроускоритель', classId: 'neutral', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    effects: [{ type: 'apply_status', status: 'dexterity', amount: 2, target: 'self' }], description: 'Получить {amount} Отклика.',
    upgrade: { effects: [{ type: 'apply_status', status: 'dexterity', amount: 3, target: 'self' }] } }),
  c({ id: 'mirror_proxy', name: 'Зеркальный прокси', classId: 'phreaker', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    effects: [{ type: 'apply_status', status: 'thorns', amount: 3, target: 'self' }], description: 'Получить {amount} Обратного трейса.',
    upgrade: { effects: [{ type: 'apply_status', status: 'thorns', amount: 5, target: 'self' }] } }),
  c({ id: 'shadow_step', name: 'Теневой шаг', classId: 'ghost', type: 'skill', rarity: 'starter', cost: 1, target: 'self',
    effects: [{ type: 'block', amount: 4 }, { type: 'draw', amount: 2 }], description: 'Получить {block} блока. Взять {draw} карты.',
    upgrade: { effects: [{ type: 'block', amount: 6 }, { type: 'draw', amount: 2 }] } }),
  c({ id: 'data_siphon', name: 'Перекачка данных', classId: 'ghost', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    effects: [{ type: 'damage', amount: 10 }, { type: 'heal', amount: 3 }], description: 'Нанести {damage} урона. Восстановить {heal} HP.',
    upgrade: { effects: [{ type: 'damage', amount: 13 }, { type: 'heal', amount: 4 }] } }),
  c({ id: 'ghost_protocol', name: 'Протокол «Призрак»', classId: 'ghost', type: 'skill', rarity: 'rare', cost: 2, target: 'self',
    effects: [{ type: 'block', amount: 14 }, { type: 'apply_status', status: 'regen', amount: 3, target: 'self' }],
    description: 'Получить {block} блока и {amount} Самовосстановления.',
    upgrade: { effects: [{ type: 'block', amount: 18 }, { type: 'apply_status', status: 'regen', amount: 4, target: 'self' }] } }),
  c({ id: 'glitch', name: 'Сбой', classId: 'neutral', type: 'status', rarity: 'special', cost: -2, target: 'none',
    effects: [], description: 'Неиграбельна. Засоряет руку.', ethereal: true }),
  c({ id: 'spyware', name: 'Шпионское ПО', classId: 'neutral', type: 'curse', rarity: 'special', cost: -2, target: 'none',
    effects: [], description: 'Неиграбельна. Проклятие.' }),
];

export const MOCK_ENEMIES: EnemyDef[] = [
  { id: 'firewall_bot', name: 'Файрвол-бот', tier: 'normal', act: 1, hp: [40, 44],
    moves: [
      { id: 'bash', name: 'Блокирующий удар', intent: 'attack', effects: [{ type: 'damage', amount: 8 }] },
      { id: 'harden', name: 'Укрепление', intent: 'defend', effects: [{ type: 'block', amount: 9 }] },
    ],
    ai: { kind: 'cycle', order: ['bash', 'harden', 'bash'] }, description: 'Корпоративный сетевой экран.' },
  { id: 'antivirus', name: 'Антивирус «Цербер»', tier: 'normal', act: 1, hp: [30, 34],
    moves: [
      { id: 'scan', name: 'Глубокий скан', intent: 'attack_debuff', effects: [{ type: 'damage', amount: 6 }, { type: 'apply_status', status: 'weak', amount: 1 }] },
      { id: 'quarantine', name: 'Карантин', intent: 'attack', effects: [{ type: 'damage', amount: 11 }] },
    ],
    ai: { kind: 'random', weights: { scan: 1, quarantine: 1 } } },
  { id: 'tracer', name: 'Трассировщик', tier: 'normal', act: 1, hp: [22, 26],
    moves: [
      { id: 'trace', name: 'Трассировка', intent: 'attack', effects: [{ type: 'damage', amount: 3, times: 3 }] },
      { id: 'lock', name: 'Захват сигнала', intent: 'buff', effects: [{ type: 'apply_status', status: 'strength', amount: 2, target: 'self' }] },
    ],
    ai: { kind: 'cycle', order: ['trace', 'lock'] } },
  { id: 'daemon', name: 'Демон-сторож', tier: 'normal', act: 1, hp: [46, 50],
    moves: [
      { id: 'bite', name: 'Укус', intent: 'attack', effects: [{ type: 'damage', amount: 10 }] },
      { id: 'hiss', name: 'Шум', intent: 'debuff', effects: [{ type: 'apply_status', status: 'vulnerable', amount: 2 }] },
    ],
    ai: { kind: 'random', weights: { bite: 2, hiss: 1 } } },
  { id: 'black_ice', name: 'Чёрный лёд', tier: 'elite', act: 1, hp: [82, 86],
    moves: [
      { id: 'freeze', name: 'Заморозка', intent: 'attack_debuff', effects: [{ type: 'damage', amount: 12 }, { type: 'apply_status', status: 'frail', amount: 2 }] },
      { id: 'crush', name: 'Дробление', intent: 'attack', effects: [{ type: 'damage', amount: 18 }] },
      { id: 'shell', name: 'Ледяной панцирь', intent: 'attack_defend', effects: [{ type: 'damage', amount: 7 }, { type: 'block', amount: 12 }] },
    ],
    ai: { kind: 'cycle', order: ['freeze', 'shell', 'crush'] } },
  { id: 'oracle', name: 'ИИ-страж ОРАКУЛ', tier: 'boss', act: 1, hp: [220, 220],
    moves: [
      { id: 'purge', name: 'Чистка', intent: 'attack', effects: [{ type: 'damage', amount: 7, times: 3 }] },
      { id: 'analyze', name: 'Анализ угроз', intent: 'debuff', effects: [{ type: 'apply_status', status: 'vulnerable', amount: 2 }, { type: 'apply_status', status: 'weak', amount: 2 }] },
      { id: 'reboot', name: 'Перезагрузка', intent: 'buff', effects: [{ type: 'block', amount: 20 }, { type: 'apply_status', status: 'strength', amount: 3, target: 'self' }] },
      { id: 'judgement', name: 'Приговор', intent: 'attack', effects: [{ type: 'damage', amount: 28 }] },
    ],
    ai: { kind: 'cycle', order: ['analyze', 'purge', 'reboot', 'judgement'] }, description: 'Сердце корпоративной сети.' },
];

export const MOCK_ENCOUNTERS: EncounterDef[] = [
  { id: 'e1', act: 1, tier: 'normal', enemies: ['firewall_bot', 'antivirus'], early: true },
  { id: 'e2', act: 1, tier: 'normal', enemies: ['tracer', 'tracer'], early: true },
  { id: 'e3', act: 1, tier: 'normal', enemies: ['daemon'] },
  { id: 'e4', act: 1, tier: 'normal', enemies: ['tracer', 'firewall_bot', 'antivirus'] },
  { id: 'el1', act: 1, tier: 'elite', enemies: ['black_ice'] },
  { id: 'b1', act: 1, tier: 'boss', enemies: ['oracle'] },
];

export const MOCK_RELICS: RelicDef[] = [
  { id: 'neural_link', name: 'Нейролинк', rarity: 'starter', classId: 'netrunner', trigger: 'combat_end',
    effects: [{ type: 'heal', amount: 6 }], description: 'В конце боя восстанавливает 6 HP.' },
  { id: 'signal_jammer', name: 'Глушилка сигнала', rarity: 'starter', classId: 'phreaker', trigger: 'combat_start',
    effects: [{ type: 'apply_status', status: 'poison', amount: 2, target: 'all_enemies' }], description: 'В начале боя заражает всех врагов: 2 Вируса.' },
  { id: 'optic_cloak', name: 'Оптический камуфляж', rarity: 'starter', classId: 'ghost', trigger: 'combat_start',
    effects: [{ type: 'block', amount: 8 }], description: 'В начале боя даёт 8 блока.' },
  { id: 'synth_coffee', name: 'Синткофе', rarity: 'common', classId: 'neutral', trigger: 'combat_start',
    effects: [{ type: 'draw', amount: 2 }], description: 'В начале боя возьмите 2 дополнительные карты.' },
  { id: 'quantum_chip', name: 'Квантовый чип', rarity: 'rare', classId: 'neutral', trigger: 'attack_played', every: 3,
    effects: [{ type: 'gain_energy', amount: 1 }], description: 'Каждая 3-я атака даёт 1 энергию.' },
  { id: 'backup_drive', name: 'Резервный диск', rarity: 'uncommon', classId: 'neutral', trigger: 'rest',
    effects: [{ type: 'heal', amount: 10 }], description: 'В Безопасном узле дополнительно восстанавливает 10 HP.' },
  { id: 'crypto_wallet', name: 'Криптокошелёк', rarity: 'common', classId: 'neutral', trigger: 'pickup',
    effects: [{ type: 'gain_gold', amount: 50 }], description: 'При получении: +50 кредитов.' },
  { id: 'overclocked_cpu', name: 'Разогнанный CPU', rarity: 'boss', classId: 'neutral', trigger: 'turn_start',
    effects: [{ type: 'gain_energy', amount: 1 }], description: 'В начале каждого хода +1 энергия.' },
];

export const MOCK_CLASSES: ClassDef[] = [
  { id: 'netrunner', name: 'Нетраннер', maxHp: 75, startingGold: 99, startingRelic: 'neural_link',
    description: 'Универсальный взломщик. Прямые атаки, уязвимости и грубая сила.',
    startingDeck: ['ping', 'ping', 'ping', 'ping', 'ping', 'firewall', 'firewall', 'firewall', 'firewall', 'buffer_overflow'] },
  { id: 'phreaker', name: 'Фрикер', maxHp: 70, startingGold: 99, startingRelic: 'signal_jammer',
    description: 'Мастер вирусов. Заражает системы и ждёт, пока они рухнут сами.',
    startingDeck: ['ping', 'ping', 'ping', 'ping', 'ping', 'firewall', 'firewall', 'firewall', 'firewall', 'worm'] },
  { id: 'ghost', name: 'Призрак', maxHp: 66, startingGold: 99, startingRelic: 'optic_cloak',
    description: 'Невидимка. Уклоняется, тянет карты и бьёт из тени.',
    startingDeck: ['ping', 'ping', 'ping', 'ping', 'ping', 'firewall', 'firewall', 'firewall', 'firewall', 'shadow_step'] },
];

export const MOCK_EVENTS: EventDef[] = [
  { id: 'abandoned_terminal', name: 'Заброшенный терминал', act: 1,
    text: 'В тёмном углу подсети мигает забытый терминал администратора. Сессия всё ещё открыта. Кто-то очень торопился уйти.',
    options: [
      { label: 'Скачать данные. +60 кредитов, −6 HP', effects: [{ type: 'gain_gold', amount: 60 }, { type: 'lose_hp', amount: 6 }] },
      { label: 'Стереть следы. Удалить карту из колоды', effects: [], special: 'remove_card' },
      { label: 'Уйти, не оставляя логов', effects: [] },
    ] },
  { id: 'data_broker', name: 'Подпольный дата-брокер', act: 1,
    text: '«Есть свежий имплант, почти не палёный», — шепчет голос в зашифрованном канале. Цена, как всегда, кусается.',
    options: [
      { label: 'Купить имплант. −50 кредитов, случайная реликвия', effects: [{ type: 'gain_gold', amount: -50 }], special: 'random_relic' },
      { label: 'Попросить патч. Улучшить карту', effects: [{ type: 'lose_hp', amount: 4 }], special: 'upgrade_card' },
      { label: 'Отключиться', effects: [] },
    ] },
];

// ---------------------------------------------------------------------------
// Доступ к контенту
// ---------------------------------------------------------------------------

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const CARD_MAP = byId(MOCK_CARDS);
const ENEMY_MAP = byId(MOCK_ENEMIES);
const RELIC_MAP = byId(MOCK_RELICS);
const STATUS_MAP = byId(MOCK_STATUSES);
const EVENT_MAP = byId(MOCK_EVENTS);
const CLASS_MAP = byId(MOCK_CLASSES);

function need<T>(m: Map<string, T>, id: string, what: string): T {
  const v = m.get(id);
  if (!v) throw new Error(`mock: unknown ${what} '${id}'`);
  return v;
}

export const mockFind = {
  card: (id: string) => CARD_MAP.get(id),
  enemy: (id: string) => ENEMY_MAP.get(id),
  relic: (id: string) => RELIC_MAP.get(id),
  status: (id: string) => STATUS_MAP.get(id),
  event: (id: string) => EVENT_MAP.get(id),
  cls: (id: string) => CLASS_MAP.get(id),
};

export const getCardDef = (id: string) => need(CARD_MAP, id, 'card');
export const getEnemyDef = (id: string) => need(ENEMY_MAP, id, 'enemy');
export const getRelicDef = (id: string) => need(RELIC_MAP, id, 'relic');
export const getStatusDef = (id: string) => need(STATUS_MAP, id, 'status');
export const getEventDef = (id: string) => need(EVENT_MAP, id, 'event');
export const getClassDef = (id: ClassId) => need(CLASS_MAP, id, 'class');
export const listClasses = () => MOCK_CLASSES.slice();

function cardView(defId: string, upgraded: boolean): { cost: number; effects: Effect[]; description: string; exhaust: boolean } {
  const d = getCardDef(defId);
  const u = upgraded ? d.upgrade : undefined;
  return {
    cost: u?.cost ?? d.cost,
    effects: u?.effects ?? d.effects,
    description: u?.description ?? d.description,
    exhaust: u?.exhaust ?? d.exhaust ?? false,
  };
}

export function describeCard(defId: string, upgraded: boolean): string {
  const v = cardView(defId, upgraded);
  const first = <K extends Effect['type']>(t: K) => v.effects.find((e) => e.type === t) as Extract<Effect, { type: K }> | undefined;
  return v.description
    .replace('{damage}', String(first('damage')?.amount ?? 0))
    .replace('{times}', String(first('damage')?.times ?? 1))
    .replace('{block}', String(first('block')?.amount ?? 0))
    .replace('{draw}', String(first('draw')?.amount ?? 0))
    .replace('{energy}', String(first('gain_energy')?.amount ?? 0))
    .replace('{heal}', String(first('heal')?.amount ?? 0))
    .replace('{lose}', String(first('lose_hp')?.amount ?? 0))
    .replace('{amount}', String(first('apply_status')?.amount ?? 0));
}

// ---------------------------------------------------------------------------
// ГСЧ
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Stream = keyof RunState['rng'];

function rnd(s: RunState, stream: Stream): number {
  let t = (s.rng[stream] = (s.rng[stream] + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rndInt = (s: RunState, st: Stream, lo: number, hi: number) => lo + Math.floor(rnd(s, st) * (hi - lo + 1));
function pick<T>(s: RunState, st: Stream, arr: readonly T[]): T {
  const v = arr[Math.floor(rnd(s, st) * arr.length)];
  if (v === undefined) throw new Error('mock: pick from empty');
  return v;
}
function shuffle<T>(s: RunState, st: Stream, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s, st) * (i + 1));
    const a = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = a;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Карта
// ---------------------------------------------------------------------------

function generateMap(s: RunState, act: 1 | 2 | 3): MapNode[] {
  const nodes = new Map<string, MapNode>();
  const id = (r: number, col: number) => `${act}-${r}-${col}`;
  const kindFor = (row: number): MapNodeKind => {
    if (row === 0) return 'combat';
    if (row === 8) return 'treasure';
    if (row === 14) return 'rest';
    const roll = rnd(s, 'map');
    if (row >= 5 && roll < 0.1) return 'elite';
    if (roll < 0.32) return 'event';
    if (roll < 0.42) return 'shop';
    if (row >= 5 && row !== 13 && roll < 0.55) return 'rest';
    return 'combat';
  };
  const ensure = (row: number, col: number) => {
    const k = id(row, col);
    let n = nodes.get(k);
    if (!n) {
      n = { id: k, act, row, col, kind: kindFor(row), next: [] };
      nodes.set(k, n);
    }
    return n;
  };
  const starts = [1, 5, rndInt(s, 'map', 0, 6), rndInt(s, 'map', 0, 6), 3];
  for (const start of starts) {
    let col = start;
    for (let row = 0; row < 14; row++) {
      const cur = ensure(row, col);
      const nextCol = Math.max(0, Math.min(6, col + rndInt(s, 'map', -1, 1)));
      const nxt = ensure(row + 1, nextCol);
      if (!cur.next.includes(nxt.id)) cur.next.push(nxt.id);
      col = nextCol;
    }
  }
  const boss: MapNode = { id: id(15, 3), act, row: 15, col: 3, kind: 'boss', next: [] };
  for (const n of nodes.values()) if (n.row === 14) n.next = [boss.id];
  return [...nodes.values(), boss].sort((a, b) => a.row - b.row || a.col - b.col);
}

// ---------------------------------------------------------------------------
// Бой
// ---------------------------------------------------------------------------

type Ctx = { s: RunState; ev: GameEvent[] };

function uid(s: RunState, prefix = 'c'): string {
  s.uidCounter += 1;
  return `${prefix}${s.uidCounter}`;
}

function rollIntent(s: RunState, e: EnemyState): void {
  const def = getEnemyDef(e.defId);
  let moveId: string;
  if (def.ai.kind === 'cycle') {
    moveId = def.ai.order[e.moveHistory.length % def.ai.order.length] ?? def.moves[0]!.id;
  } else {
    const entries = Object.entries(def.ai.weights);
    const last2 = e.moveHistory.slice(-2);
    const allowed = entries.filter(([id]) => !(last2.length === 2 && last2.every((m) => m === id)));
    const total = allowed.reduce((a, [, w]) => a + w, 0);
    let r = rnd(s, 'ai') * total;
    moveId = allowed[0]?.[0] ?? def.moves[0]!.id;
    for (const [id, w] of allowed) {
      r -= w;
      if (r <= 0) {
        moveId = id;
        break;
      }
    }
  }
  const move = def.moves.find((m) => m.id === moveId) ?? def.moves[0]!;
  const dmg = move.effects.find((x) => x.type === 'damage') as Extract<Effect, { type: 'damage' }> | undefined;
  const intent: Intent = { kind: move.intent, moveId: move.id };
  if (dmg) {
    intent.damage = calcDamage(dmg.amount, e, s.combat?.player);
    if ((dmg.times ?? 1) > 1) intent.times = dmg.times;
  }
  e.intent = intent;
}

function refreshIntents(s: RunState): void {
  const cb = s.combat;
  if (!cb) return;
  for (const e of cb.enemies) {
    const def = getEnemyDef(e.defId);
    const move = def.moves.find((m) => m.id === e.intent.moveId);
    const dmg = move?.effects.find((x) => x.type === 'damage') as Extract<Effect, { type: 'damage' }> | undefined;
    if (dmg) e.intent.damage = calcDamage(dmg.amount, e, cb.player);
  }
}

function calcDamage(base: number, attacker: CombatantState, defender: CombatantState | undefined): number {
  let d = base + (attacker.statuses.strength ?? 0);
  if ((attacker.statuses.weak ?? 0) > 0) d = Math.floor(d * 0.75);
  if (defender && (defender.statuses.vulnerable ?? 0) > 0) d = Math.floor(d * 1.5);
  return Math.max(0, d);
}

function dealDamage(ctx: Ctx, target: CombatantState, targetUid: string | 'player', amount: number): void {
  const blocked = Math.min(target.block, amount);
  target.block -= blocked;
  const dmg = amount - blocked;
  target.hp = Math.max(0, target.hp - dmg);
  ctx.ev.push({ type: 'damage', targetUid, amount: dmg, blocked });
  if (targetUid !== 'player') ctx.s.stats.damageDealt += dmg;
  if (targetUid !== 'player' && target.hp <= 0) {
    ctx.ev.push({ type: 'enemy_died', enemyUid: targetUid });
    target.block = 0;
    target.statuses = {};
    ctx.s.stats.enemiesKilled += 1;
    const def = getEnemyDef((target as EnemyState).defId);
    if (def.tier === 'elite') ctx.s.stats.elitesKilled += 1;
    if (def.tier === 'boss') ctx.s.stats.bossesKilled += 1;
  }
}

function addStatus(ctx: Ctx, t: CombatantState, uidT: string | 'player', status: string, amount: number): void {
  if (t.hp <= 0) return;
  t.statuses[status] = (t.statuses[status] ?? 0) + amount;
  ctx.ev.push({ type: 'status_applied', targetUid: uidT, status, amount });
}

function drawCards(ctx: Ctx, n: number): void {
  const cb = ctx.s.combat!;
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (cb.hand.length >= 10) break;
    if (cb.drawPile.length === 0) {
      if (cb.discardPile.length === 0) break;
      cb.drawPile = shuffle(ctx.s, 'combat', cb.discardPile);
      cb.discardPile = [];
    }
    const card = cb.drawPile.shift();
    if (card) {
      cb.hand.push(card);
      drawn++;
    }
  }
  if (drawn) ctx.ev.push({ type: 'cards_drawn', count: drawn });
}

const alive = (cb: CombatState) => cb.enemies.filter((e) => e.hp > 0);

/** Применить эффекты игрока (карты/реликвии). */
function applyPlayerEffects(ctx: Ctx, effects: Effect[], targetUid?: string): void {
  const cb = ctx.s.combat!;
  for (const eff of effects) {
    switch (eff.type) {
      case 'damage': {
        const times = eff.times ?? 1;
        for (let i = 0; i < times; i++) {
          const kind = eff.target ?? 'enemy';
          const targets =
            kind === 'all_enemies' ? alive(cb)
            : kind === 'random_enemy' ? (alive(cb).length ? [pick(ctx.s, 'combat', alive(cb))] : [])
            : cb.enemies.filter((e) => e.uid === targetUid && e.hp > 0);
          for (const t of targets) {
            dealDamage(ctx, t, t.uid, calcDamage(eff.amount, cb.player, t));
            const thorns = t.statuses.thorns ?? 0;
            if (thorns > 0 && t.hp > 0) dealDamage(ctx, cb.player, 'player', thorns);
          }
        }
        break;
      }
      case 'block': {
        let b = eff.amount + (cb.player.statuses.dexterity ?? 0);
        if ((cb.player.statuses.frail ?? 0) > 0) b = Math.floor(b * 0.75);
        cb.player.block += Math.max(0, b);
        ctx.ev.push({ type: 'block_gained', targetUid: 'player', amount: b });
        break;
      }
      case 'apply_status': {
        const kind = eff.target ?? 'enemy';
        if (kind === 'self') addStatus(ctx, cb.player, 'player', eff.status, eff.amount);
        else if (kind === 'all_enemies') for (const t of alive(cb)) addStatus(ctx, t, t.uid, eff.status, eff.amount);
        else {
          const t = cb.enemies.find((e) => e.uid === targetUid);
          if (t) addStatus(ctx, t, t.uid, eff.status, eff.amount);
        }
        break;
      }
      case 'draw':
        drawCards(ctx, eff.amount);
        break;
      case 'gain_energy':
        cb.energy += eff.amount;
        break;
      case 'heal': {
        const h = Math.min(eff.amount, ctx.s.maxHp - cb.player.hp);
        cb.player.hp += h;
        ctx.ev.push({ type: 'heal', targetUid: 'player', amount: h });
        break;
      }
      case 'lose_hp':
        cb.player.hp = Math.max(0, cb.player.hp - eff.amount);
        ctx.ev.push({ type: 'damage', targetUid: 'player', amount: eff.amount, blocked: 0 });
        break;
      case 'add_card':
        for (let i = 0; i < (eff.count ?? 1); i++) {
          const card: CardInstance = { uid: uid(ctx.s), defId: eff.cardId, upgraded: false };
          if (eff.to === 'hand') cb.hand.push(card);
          else if (eff.to === 'draw') cb.drawPile.push(card);
          else cb.discardPile.push(card);
        }
        break;
      case 'exhaust_random_hand':
        for (let i = 0; i < eff.amount && cb.hand.length; i++) {
          const idx = Math.floor(rnd(ctx.s, 'combat') * cb.hand.length);
          const [card] = cb.hand.splice(idx, 1);
          if (card) cb.exhaustPile.push(card);
        }
        break;
      case 'gain_gold':
        ctx.s.gold = Math.max(0, ctx.s.gold + eff.amount);
        break;
    }
  }
}

function triggerRelics(ctx: Ctx, trigger: RelicTrigger): void {
  for (const id of ctx.s.relics) {
    const r = RELIC_MAP.get(id);
    if (!r || r.trigger !== trigger) continue;
    if (r.every) {
      const counters = ctx.s.combat?.counters;
      if (!counters) continue;
      counters[id] = (counters[id] ?? 0) + 1;
      if (counters[id]! % r.every !== 0) continue;
    }
    ctx.ev.push({ type: 'relic_triggered', relicId: id });
    if (ctx.s.combat && trigger !== 'combat_end') applyPlayerEffects(ctx, r.effects);
    else
      for (const e of r.effects) {
        if (e.type === 'heal') ctx.s.hp = Math.min(ctx.s.maxHp, ctx.s.hp + e.amount);
        if (e.type === 'gain_gold') ctx.s.gold += e.amount;
      }
  }
}

function startCombat(ctx: Ctx, tier: 'normal' | 'elite' | 'boss'): void {
  const s = ctx.s;
  const pool = MOCK_ENCOUNTERS.filter((e) => e.tier === tier && (tier !== 'normal' || (s.floor <= 3 ? e.early : true)));
  const enc = pick(s, 'combat', pool.length ? pool : MOCK_ENCOUNTERS);
  const enemies: EnemyState[] = enc.enemies.map((defId) => {
    const def = getEnemyDef(defId);
    const hp = rndInt(s, 'combat', def.hp[0], def.hp[1]);
    return { uid: uid(s, 'e'), defId, hp, maxHp: hp, block: 0, statuses: {}, intent: { kind: 'unknown', moveId: '' }, moveHistory: [] };
  });
  s.combat = {
    turn: 1, energy: 3, maxEnergy: 3, hand: [], discardPile: [], exhaustPile: [],
    drawPile: shuffle(s, 'combat', s.deck.map((c2) => ({ ...c2 }))),
    player: { hp: s.hp, maxHp: s.maxHp, block: 0, statuses: {} },
    enemies, phase: 'player', counters: {},
  };
  for (const e of enemies) rollIntent(s, e);
  s.screen = { kind: 'combat' };
  ctx.ev.push({ type: 'screen_changed', screen: 'combat' });
  triggerRelics(ctx, 'combat_start');
  ctx.ev.push({ type: 'turn_started', turn: 1 });
  drawCards(ctx, 5);
  refreshIntents(s);
}

function cardRewardIds(s: RunState, n = 3): string[] {
  const pool = MOCK_CARDS.filter((c2) => (c2.classId === s.classId || c2.classId === 'neutral') && c2.rarity !== 'starter' && c2.rarity !== 'special');
  const out: string[] = [];
  while (out.length < n && out.length < pool.length) {
    const roll = rnd(s, 'cards');
    const rarity = roll < 0.1 ? 'rare' : roll < 0.45 ? 'uncommon' : 'common';
    const sub = pool.filter((c2) => c2.rarity === rarity && !out.includes(c2.id));
    const choice = pick(s, 'cards', sub.length ? sub : pool.filter((c2) => !out.includes(c2.id)));
    out.push(choice.id);
  }
  return out;
}

function randomRelic(s: RunState): string | null {
  const pool = MOCK_RELICS.filter((r) => r.rarity !== 'starter' && r.rarity !== 'boss' && !s.relics.includes(r.id));
  return pool.length ? pick(s, 'rewards', pool).id : null;
}

function gainRelic(ctx: Ctx, id: string): void {
  ctx.s.relics.push(id);
  const r = RELIC_MAP.get(id);
  if (r?.trigger === 'pickup') for (const e of r.effects) if (e.type === 'gain_gold') ctx.s.gold += e.amount;
}

function computeScore(s: RunState): number {
  const st = s.stats;
  return s.floor * 10 + st.enemiesKilled * 5 + st.elitesKilled * 25 + st.bossesKilled * 100 + Math.floor(st.damageDealt / 10) + s.ascension * 50 + (s.status === 'won' ? 500 : 0);
}

function finishCombat(ctx: Ctx): void {
  const s = ctx.s;
  const cb = s.combat!;
  if (cb.player.hp <= 0) {
    cb.phase = 'lost';
    s.hp = 0;
    s.status = 'lost';
    s.score = computeScore(s);
    s.screen = { kind: 'game_over', victory: false };
    ctx.ev.push({ type: 'combat_lost' }, { type: 'screen_changed', screen: 'game_over' });
    return;
  }
  if (alive(cb).length > 0) return;
  cb.phase = 'won';
  s.hp = cb.player.hp;
  const node = s.map.find((n) => n.id === s.currentNodeId);
  ctx.ev.push({ type: 'combat_won' });
  triggerRelics(ctx, 'combat_end');
  const items: RewardItem[] = [{ kind: 'gold', amount: rndInt(s, 'rewards', 12, 22) + (node?.kind === 'elite' ? 20 : 0) }];
  if (node?.kind === 'elite') {
    const r = randomRelic(s);
    if (r) items.push({ kind: 'relic', relicId: r });
  }
  if (node?.kind === 'boss') items.push({ kind: 'relic', relicId: 'overclocked_cpu' });
  items.push({ kind: 'card_choice', cardIds: cardRewardIds(s) });
  s.combat = null;
  s.screen = { kind: 'reward', items };
  ctx.ev.push({ type: 'screen_changed', screen: 'reward' });
}

function endTurn(ctx: Ctx): void {
  const s = ctx.s;
  const cb = s.combat!;
  // Сброс руки
  for (const card of cb.hand) {
    const d = getCardDef(card.defId);
    (d.ethereal ? cb.exhaustPile : cb.discardPile).push(card);
  }
  cb.hand = [];
  triggerRelics(ctx, 'turn_end');
  const regen = cb.player.statuses.regen ?? 0;
  if (regen > 0) {
    const h = Math.min(regen, s.maxHp - cb.player.hp);
    cb.player.hp += h;
    ctx.ev.push({ type: 'heal', targetUid: 'player', amount: h });
  }
  // Ход врагов
  for (const e of cb.enemies) {
    if (e.hp <= 0) continue;
    e.block = 0;
    const poison = e.statuses.poison ?? 0;
    if (poison > 0) {
      dealDamage(ctx, e, e.uid, poison);
      e.statuses.poison = poison - 1;
      if (!e.statuses.poison) delete e.statuses.poison;
      if (e.hp <= 0) continue;
    }
    const def = getEnemyDef(e.defId);
    const move = def.moves.find((m) => m.id === e.intent.moveId) ?? def.moves[0]!;
    ctx.ev.push({ type: 'enemy_move', enemyUid: e.uid, moveId: move.id });
    for (const eff of move.effects) {
      if (eff.type === 'damage') {
        for (let i = 0; i < (eff.times ?? 1); i++) {
          dealDamage(ctx, cb.player, 'player', calcDamage(eff.amount, e, cb.player));
          const thorns = cb.player.statuses.thorns ?? 0;
          if (thorns > 0) dealDamage(ctx, e, e.uid, thorns);
          if (cb.player.hp <= 0 || e.hp <= 0) break;
        }
      } else if (eff.type === 'block') {
        e.block += eff.amount;
        ctx.ev.push({ type: 'block_gained', targetUid: e.uid, amount: eff.amount });
      } else if (eff.type === 'apply_status') {
        if (eff.target === 'self') addStatus(ctx, e, e.uid, eff.status, eff.amount);
        else addStatus(ctx, cb.player, 'player', eff.status, eff.amount);
      }
    }
    e.moveHistory.push(move.id);
    if (cb.player.hp <= 0) break;
  }
  if (cb.player.hp <= 0 || alive(cb).length === 0) {
    finishCombat(ctx);
    return;
  }
  // Тают duration-статусы
  const tick = (st: Record<string, number>) => {
    for (const k of Object.keys(st)) {
      if (STATUS_MAP.get(k)?.stacking === 'duration') {
        st[k] = (st[k] ?? 0) - 1;
        if ((st[k] ?? 0) <= 0) delete st[k];
      }
    }
  };
  tick(cb.player.statuses);
  for (const e of cb.enemies) {
    tick(e.statuses);
    if (e.hp > 0) rollIntent(s, e);
  }
  // Новый ход игрока
  cb.turn += 1;
  cb.player.block = 0;
  cb.energy = cb.maxEnergy;
  ctx.ev.push({ type: 'turn_started', turn: cb.turn });
  triggerRelics(ctx, 'turn_start');
  drawCards(ctx, 5);
  refreshIntents(s);
}

function playCard(ctx: Ctx, cardUid: string, targetUid?: string): void {
  const s = ctx.s;
  const cb = s.combat;
  if (!cb || cb.phase !== 'player') throw new Error('mock: not in combat');
  const idx = cb.hand.findIndex((h) => h.uid === cardUid);
  const card = cb.hand[idx];
  if (!card) throw new Error('mock: card not in hand');
  const def = getCardDef(card.defId);
  const v = cardView(card.defId, card.upgraded);
  if (v.cost < -1 || def.type === 'status' || def.type === 'curse') throw new Error('mock: unplayable');
  const cost = v.cost === -1 ? cb.energy : v.cost;
  if (cost > cb.energy) throw new Error('mock: not enough energy');
  if (def.target === 'enemy' && !cb.enemies.some((e) => e.uid === targetUid && e.hp > 0)) throw new Error('mock: bad target');
  cb.energy -= cost;
  cb.hand.splice(idx, 1);
  ctx.ev.push({ type: 'card_played', cardUid, defId: card.defId });
  s.stats.cardsPlayed += 1;
  applyPlayerEffects(ctx, v.effects, targetUid);
  if (def.type !== 'power') (v.exhaust ? cb.exhaustPile : cb.discardPile).push(card);
  triggerRelics(ctx, 'card_played');
  if (def.type === 'attack') triggerRelics(ctx, 'attack_played');
  refreshIntents(s);
  finishCombat(ctx);
}

function availableNodes(s: RunState): string[] {
  if (!s.currentNodeId) return s.map.filter((n) => n.act === s.act && n.row === 0).map((n) => n.id);
  return s.map.find((n) => n.id === s.currentNodeId)?.next ?? [];
}

function makeShop(s: RunState): ShopItem[] {
  const cards = cardRewardIds(s, 5).map<ShopItem>((id) => {
    const r = getCardDef(id).rarity;
    const base = r === 'rare' ? 150 : r === 'uncommon' ? 75 : 50;
    return { kind: 'card', id, price: base + rndInt(s, 'shop', -5, 10), sold: false };
  });
  const relics: ShopItem[] = [];
  for (let i = 0; i < 2; i++) {
    const r = randomRelic(s);
    if (r && !relics.some((x) => x.id === r)) relics.push({ kind: 'relic', id: r, price: 140 + rndInt(s, 'shop', 0, 60), sold: false });
  }
  const sale = cards[1];
  if (sale) {
    sale.basePrice = sale.price;
    sale.price = Math.round(sale.price * 0.7);
    sale.sale = true;
  }
  return [...cards, ...relics, { kind: 'remove', price: 75, sold: false }, { kind: 'upgrade', price: 70, sold: false }, { kind: 'refresh', price: 35, sold: false, n: 0 }];
}

// ---------------------------------------------------------------------------
// Публичный API мока
// ---------------------------------------------------------------------------

export function newRun(opts: NewRunOptions): RunState {
  const cls = getClassDef(opts.classId);
  const h = hashStr(opts.seed);
  const s: RunState = {
    version: 1, seed: opts.seed, classId: opts.classId, ascension: opts.ascension ?? 0, ...(opts.weekly ? { weekly: opts.weekly } : {}),
    act: 1, floor: 0, hp: cls.maxHp, maxHp: cls.maxHp, gold: cls.startingGold, deck: [], relics: [cls.startingRelic],
    map: [], currentNodeId: null, visited: [], screen: { kind: 'map' }, combat: null,
    rng: { map: h ^ 1, combat: h ^ 2, cards: h ^ 3, rewards: h ^ 4, events: h ^ 5, shop: h ^ 6, ai: h ^ 7 },
    uidCounter: 0, status: 'active', score: 0,
    stats: { enemiesKilled: 0, elitesKilled: 0, bossesKilled: 0, damageDealt: 0, cardsPlayed: 0 },
  };
  s.deck = cls.startingDeck.map((defId) => ({ uid: uid(s), defId, upgraded: false }));
  s.map = generateMap(s, 1);
  return s;
}

export function applyAction(state: RunState, action: Action): ActionResult {
  const s: RunState = structuredClone(state);
  const ctx: Ctx = { s, ev: [] };
  const toMap = () => {
    s.screen = { kind: 'map' };
    ctx.ev.push({ type: 'screen_changed', screen: 'map' });
  };
  const screen = s.screen;
  switch (action.type) {
    case 'choose_node': {
      if (screen.kind !== 'map' || !availableNodes(s).includes(action.nodeId)) throw new Error('mock: node not available');
      const node = s.map.find((n) => n.id === action.nodeId)!;
      s.currentNodeId = node.id;
      s.visited.push(node.id);
      s.floor += 1;
      if (node.kind === 'combat' || node.kind === 'elite' || node.kind === 'boss') startCombat(ctx, node.kind === 'combat' ? 'normal' : node.kind);
      else if (node.kind === 'event') {
        s.screen = { kind: 'event', eventId: pick(s, 'events', MOCK_EVENTS).id };
        ctx.ev.push({ type: 'screen_changed', screen: 'event' });
      } else if (node.kind === 'shop') {
        s.screen = { kind: 'shop', items: makeShop(s) };
        ctx.ev.push({ type: 'screen_changed', screen: 'shop' });
      } else if (node.kind === 'rest') {
        s.screen = { kind: 'rest' };
        ctx.ev.push({ type: 'screen_changed', screen: 'rest' });
      } else {
        const items: RewardItem[] = [{ kind: 'gold', amount: rndInt(s, 'rewards', 30, 60) }];
        const r = randomRelic(s);
        if (r) items.push({ kind: 'relic', relicId: r });
        s.screen = { kind: 'reward', items };
        ctx.ev.push({ type: 'screen_changed', screen: 'reward' });
      }
      break;
    }
    case 'play_card':
      playCard(ctx, action.cardUid, action.targetUid);
      break;
    case 'end_turn':
      if (!s.combat || s.combat.phase !== 'player') throw new Error('mock: not in combat');
      endTurn(ctx);
      break;
    case 'take_reward': {
      if (screen.kind !== 'reward') throw new Error('mock: not on reward');
      const item = screen.items[action.index];
      if (!item) throw new Error('mock: bad reward');
      if (item.kind === 'card_choice') {
        s.screen = { kind: 'card_pick', cardIds: item.cardIds, rewardIndex: action.index };
        ctx.ev.push({ type: 'screen_changed', screen: 'card_pick' });
        break;
      }
      if (item.kind === 'gold') s.gold += item.amount;
      if (item.kind === 'relic') gainRelic(ctx, item.relicId);
      screen.items.splice(action.index, 1);
      break;
    }
    case 'pick_card': {
      if (screen.kind !== 'card_pick') throw new Error('mock: not on card pick');
      // Мок держит предыдущий экран наград во вспомогательном стеке (см. rewardStack).
      const prev = rewardStack.get(s.seed + s.floor) ?? [];
      const items = prev.filter((_, i) => i !== screen.rewardIndex || action.cardId === null);
      if (action.cardId) s.deck.push({ uid: uid(s), defId: action.cardId, upgraded: false });
      s.screen = { kind: 'reward', items };
      ctx.ev.push({ type: 'screen_changed', screen: 'reward' });
      break;
    }
    case 'leave_reward': {
      const node = s.map.find((n) => n.id === s.currentNodeId);
      if (node?.kind === 'boss') {
        s.status = 'won';
        s.score = computeScore(s);
        s.screen = { kind: 'game_over', victory: true };
        ctx.ev.push({ type: 'screen_changed', screen: 'game_over' });
      } else toMap();
      break;
    }
    case 'shop_buy': {
      if (screen.kind !== 'shop') throw new Error('mock: not in shop');
      const item = screen.items[action.index];
      if (!item || item.sold || item.price > s.gold) throw new Error('mock: cannot buy');
      s.gold -= item.price;
      item.sold = true;
      if (item.kind === 'card' && item.id) s.deck.push({ uid: uid(s), defId: item.id, upgraded: false });
      if (item.kind === 'relic' && item.id) gainRelic(ctx, item.id);
      if (item.kind === 'remove') {
        shopStack.set(s.seed + s.floor, screen.items);
        s.screen = { kind: 'select_deck_card', purpose: 'remove', returnTo: 'shop' };
        ctx.ev.push({ type: 'screen_changed', screen: 'select_deck_card' });
      }
      break;
    }
    case 'leave_shop':
      toMap();
      break;
    case 'rest_heal': {
      let heal = Math.floor(s.maxHp * 0.3);
      if (s.relics.includes('backup_drive')) heal += 10;
      s.hp = Math.min(s.maxHp, s.hp + heal);
      ctx.ev.push({ type: 'heal', targetUid: 'player', amount: heal });
      toMap();
      break;
    }
    case 'rest_upgrade':
      s.screen = { kind: 'select_deck_card', purpose: 'upgrade', returnTo: 'map' };
      ctx.ev.push({ type: 'screen_changed', screen: 'select_deck_card' });
      break;
    case 'select_deck_card': {
      if (screen.kind !== 'select_deck_card') throw new Error('mock: not selecting');
      if (action.cardUid) {
        const i = s.deck.findIndex((d) => d.uid === action.cardUid);
        if (i < 0) throw new Error('mock: bad card');
        if (screen.purpose === 'remove') s.deck.splice(i, 1);
        else s.deck[i] = { ...s.deck[i]!, upgraded: true };
      }
      if (screen.returnTo === 'shop') {
        s.screen = { kind: 'shop', items: shopStack.get(s.seed + s.floor) ?? [] };
        ctx.ev.push({ type: 'screen_changed', screen: 'shop' });
      } else if (!action.cardUid && screen.purpose === 'upgrade' && s.map.find((n) => n.id === s.currentNodeId)?.kind === 'rest') {
        s.screen = { kind: 'rest' };
        ctx.ev.push({ type: 'screen_changed', screen: 'rest' });
      } else toMap();
      break;
    }
    case 'event_choice': {
      if (screen.kind !== 'event') throw new Error('mock: not in event');
      const opt = getEventDef(screen.eventId).options[action.index];
      if (!opt) throw new Error('mock: bad option');
      for (const e of opt.effects) {
        if (e.type === 'gain_gold') s.gold = Math.max(0, s.gold + e.amount);
        if (e.type === 'lose_hp') s.hp = Math.max(1, s.hp - e.amount);
        if (e.type === 'heal') s.hp = Math.min(s.maxHp, s.hp + e.amount);
      }
      if (opt.special === 'random_relic') {
        const r = randomRelic(s);
        if (r) gainRelic(ctx, r);
      }
      if (opt.special === 'random_card') s.deck.push({ uid: uid(s), defId: cardRewardIds(s, 1)[0]!, upgraded: false });
      if (opt.special === 'remove_card' || opt.special === 'upgrade_card') {
        s.screen = { kind: 'select_deck_card', purpose: opt.special === 'remove_card' ? 'remove' : 'upgrade', returnTo: 'map' };
        ctx.ev.push({ type: 'screen_changed', screen: 'select_deck_card' });
      } else if (opt.special === 'fight') startCombat(ctx, 'normal');
      else toMap();
      break;
    }
  }
  if (s.screen.kind === 'reward') rewardStack.set(s.seed + s.floor, s.screen.items);
  return { state: s, events: ctx.ev };
}

/** Мок хранит вспомогательные стеки экранов (у настоящего движка это внутри state). */
const rewardStack = new Map<string, RewardItem[]>();
const shopStack = new Map<string, ShopItem[]>();

export function getLegalActions(s: RunState): Action[] {
  const out: Action[] = [];
  const sc = s.screen;
  switch (sc.kind) {
    case 'map':
      for (const id of availableNodes(s)) out.push({ type: 'choose_node', nodeId: id });
      break;
    case 'combat': {
      const cb = s.combat;
      if (!cb || cb.phase !== 'player') break;
      for (const card of cb.hand) {
        const def = getCardDef(card.defId);
        const v = cardView(card.defId, card.upgraded);
        if (v.cost < -1 || def.type === 'status' || def.type === 'curse') continue;
        if ((v.cost === -1 ? 0 : v.cost) > cb.energy) continue;
        if (def.target === 'enemy') for (const e of alive(cb)) out.push({ type: 'play_card', cardUid: card.uid, targetUid: e.uid });
        else out.push({ type: 'play_card', cardUid: card.uid });
      }
      out.push({ type: 'end_turn' });
      break;
    }
    case 'reward':
      sc.items.forEach((_, i) => out.push({ type: 'take_reward', index: i }));
      out.push({ type: 'leave_reward' });
      break;
    case 'card_pick':
      for (const id of sc.cardIds) out.push({ type: 'pick_card', cardId: id });
      out.push({ type: 'pick_card', cardId: null });
      break;
    case 'shop':
      sc.items.forEach((it, i) => {
        if (!it.sold && it.price <= s.gold) out.push({ type: 'shop_buy', index: i });
      });
      out.push({ type: 'leave_shop' });
      break;
    case 'rest':
      out.push({ type: 'rest_heal' }, { type: 'rest_upgrade' });
      break;
    case 'event':
      getEventDef(sc.eventId).options.forEach((_, i) => out.push({ type: 'event_choice', index: i }));
      break;
    case 'select_deck_card':
      for (const d of s.deck) if (sc.purpose === 'remove' || !d.upgraded) out.push({ type: 'select_deck_card', cardUid: d.uid });
      out.push({ type: 'select_deck_card', cardUid: null });
      break;
    case 'game_over':
      break;
  }
  return out;
}

export function replay(opts: NewRunOptions, actions: Action[]): RunState {
  let s = newRun(opts);
  for (const a of actions) s = applyAction(s, a).state;
  return s;
}

// ---------------------------------------------------------------------------
// Dev-сценарии: готовые состояния для скриншотов и ручной проверки (?dev=combat и т.п.)
// ---------------------------------------------------------------------------

export type DevScenario = 'map' | 'combat' | 'reward' | 'card_pick' | 'shop' | 'rest' | 'event' | 'deck' | 'defeat' | 'victory';

/** Реалистичный забег в середине первого акта: бой с 2 врагами, рука 5 карт, статусы, намерения. */
export function mockCombatRun(): RunState {
  const s = newRun({ seed: 'dev-combat', classId: 'netrunner' });
  // Пройденный путь: 3 узла
  let cur = s.map.find((n) => n.row === 0)!;
  for (let i = 0; i < 3; i++) {
    s.visited.push(cur.id);
    const nextId = cur.next[0];
    const nxt = s.map.find((n) => n.id === nextId);
    if (!nxt) break;
    cur = nxt;
  }
  s.currentNodeId = s.visited[s.visited.length - 1] ?? null;
  s.floor = 3;
  s.hp = 58;
  s.gold = 147;
  s.relics = ['neural_link', 'synth_coffee', 'quantum_chip'];
  s.deck.push(
    { uid: uid(s), defId: 'ddos', upgraded: true },
    { uid: uid(s), defId: 'botnet', upgraded: false },
    { uid: uid(s), defId: 'vpn_tunnel', upgraded: false },
    { uid: uid(s), defId: 'zero_day', upgraded: false },
  );
  s.stats = { enemiesKilled: 3, elitesKilled: 0, bossesKilled: 0, damageDealt: 141, cardsPlayed: 27 };
  const mk = (defId: string, upgraded = false): CardInstance => ({ uid: uid(s), defId, upgraded });
  const enemies: EnemyState[] = [
    { uid: 'e-fw', defId: 'firewall_bot', hp: 31, maxHp: 42, block: 6, statuses: { vulnerable: 2 }, intent: { kind: 'attack', moveId: 'bash', damage: 8 }, moveHistory: ['bash', 'harden'] },
    { uid: 'e-av', defId: 'antivirus', hp: 32, maxHp: 32, block: 0, statuses: { weak: 1, poison: 3 }, intent: { kind: 'attack_debuff', moveId: 'scan', damage: 6 }, moveHistory: ['quarantine'] },
  ];
  s.combat = {
    turn: 2, energy: 3, maxEnergy: 3,
    hand: [mk('ping'), mk('ddos', true), mk('firewall'), mk('buffer_overflow'), mk('botnet')],
    drawPile: [mk('ping'), mk('firewall'), mk('ping'), mk('vpn_tunnel'), mk('zero_day'), mk('firewall'), mk('ping')],
    discardPile: [mk('ping'), mk('firewall'), mk('sql_injection')],
    exhaustPile: [mk('glitch')],
    player: { hp: 58, maxHp: 75, block: 4, statuses: { strength: 1 } },
    enemies, phase: 'player', counters: { quantum_chip: 1 },
  };
  s.screen = { kind: 'combat' };
  refreshIntents(s);
  return s;
}

export function mockScenario(kind: DevScenario): RunState {
  const s = mockCombatRun();
  if (kind === 'combat') return s;
  s.combat = null;
  switch (kind) {
    case 'map':
      s.screen = { kind: 'map' };
      break;
    case 'reward':
      s.screen = { kind: 'reward', items: [{ kind: 'gold', amount: 24 }, { kind: 'relic', relicId: 'backup_drive' }, { kind: 'card_choice', cardIds: ['brute_force', 'packet_storm', 'zero_day'] }] };
      rewardStack.set(s.seed + s.floor, (s.screen as { items: RewardItem[] }).items);
      break;
    case 'card_pick':
      s.screen = { kind: 'card_pick', cardIds: ['brute_force', 'packet_storm', 'zero_day'], rewardIndex: 0 };
      rewardStack.set(s.seed + s.floor, [{ kind: 'card_choice', cardIds: ['brute_force', 'packet_storm', 'zero_day'] }]);
      break;
    case 'shop':
      s.screen = { kind: 'shop', items: makeShop(s) };
      break;
    case 'rest':
      s.screen = { kind: 'rest' };
      break;
    case 'event':
      s.screen = { kind: 'event', eventId: 'abandoned_terminal' };
      break;
    case 'deck':
      s.screen = { kind: 'select_deck_card', purpose: 'upgrade', returnTo: 'map' };
      break;
    case 'defeat':
      s.hp = 0;
      s.status = 'lost';
      s.score = computeScore(s);
      s.screen = { kind: 'game_over', victory: false };
      break;
    case 'victory':
      s.status = 'won';
      s.floor = 16;
      s.stats = { enemiesKilled: 19, elitesKilled: 2, bossesKilled: 1, damageDealt: 1384, cardsPlayed: 212 };
      s.score = computeScore(s);
      s.screen = { kind: 'game_over', victory: true };
      break;
  }
  return s;
}
