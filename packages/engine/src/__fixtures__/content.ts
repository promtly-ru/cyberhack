/**
 * Тестовый контент. Не зависит от реального JSON.
 */
import type { ContentData } from '../content';
import type { CardDef, EncounterDef, EnemyDef, EventDef, RelicDef, StatusDef } from '../types';

const statuses: StatusDef[] = [
  { id: 'vulnerable', name: 'Уязвимость', description: '+50% урона', kind: 'debuff', stacking: 'duration' },
  { id: 'weak', name: 'Слабость', description: '-25% урона', kind: 'debuff', stacking: 'duration' },
  { id: 'frail', name: 'Хрупкость', description: '-25% блока', kind: 'debuff', stacking: 'duration' },
  { id: 'strength', name: 'Сила', description: '+N урона', kind: 'buff', stacking: 'intensity' },
  { id: 'dexterity', name: 'Ловкость', description: '+N блока', kind: 'buff', stacking: 'intensity' },
  { id: 'virus', name: 'Вирус', description: 'Теряет N HP', kind: 'debuff', stacking: 'intensity' },
  { id: 'thorns', name: 'Шипы', description: 'Отражает N', kind: 'buff', stacking: 'intensity' },
  { id: 'regen', name: 'Регенерация', description: 'Лечит N', kind: 'buff', stacking: 'intensity' },
  { id: 'ritual', name: 'Ритуал', description: '+N силы', kind: 'buff', stacking: 'intensity' },
  { id: 'plating', name: 'Броня', description: '+N блока', kind: 'buff', stacking: 'intensity' },
];

function card(c: Partial<CardDef> & Pick<CardDef, 'id' | 'effects'>): CardDef {
  return {
    name: c.id,
    classId: 'netrunner',
    type: 'skill',
    rarity: 'common',
    cost: 1,
    target: 'none',
    description: c.id,
    ...c,
  };
}

const cards: CardDef[] = [
  card({
    id: 'strike',
    type: 'attack',
    rarity: 'starter',
    target: 'enemy',
    effects: [{ type: 'damage', amount: 6 }],
    description: 'Нанести {damage} урона.',
    upgrade: { effects: [{ type: 'damage', amount: 9 }] },
  }),
  card({
    id: 'defend',
    rarity: 'starter',
    effects: [{ type: 'block', amount: 5 }],
    description: 'Получить {block} блока.',
    upgrade: { effects: [{ type: 'block', amount: 8 }], description: 'Получить {block} блока!' },
  }),
  card({
    id: 'bash',
    type: 'attack',
    rarity: 'starter',
    cost: 2,
    target: 'enemy',
    effects: [
      { type: 'damage', amount: 8 },
      { type: 'apply_status', status: 'vulnerable', amount: 2 },
    ],
    description: '{damage} урона, {vulnerable} уязвимости.',
    upgrade: { effects: [{ type: 'damage', amount: 10 }, { type: 'apply_status', status: 'vulnerable', amount: 3 }] },
  }),
  card({
    id: 'x_burst',
    type: 'attack',
    rarity: 'uncommon',
    cost: -1,
    target: 'enemy',
    effects: [{ type: 'damage', amount: 5 }],
    description: 'X раз нанести {damage} урона.',
    upgrade: { effects: [{ type: 'damage', amount: 7 }] },
  }),
  card({
    id: 'purge',
    rarity: 'common',
    cost: 0,
    exhaust: true,
    effects: [{ type: 'block', amount: 4 }, { type: 'draw', amount: 1 }],
    description: '{block} блока, добрать {draw}. Сжечь.',
    upgrade: { exhaust: false },
  }),
  card({
    id: 'ghost_shield',
    rarity: 'common',
    ethereal: true,
    effects: [{ type: 'block', amount: 10 }],
    description: 'Эфемерная. {block} блока.',
  }),
  card({
    id: 'glitch',
    classId: 'neutral',
    type: 'status',
    rarity: 'special',
    cost: -2,
    effects: [],
    description: 'Неиграбельна.',
  }),
  card({
    id: 'malware',
    classId: 'neutral',
    type: 'curse',
    rarity: 'special',
    cost: -2,
    effects: [],
    description: 'Проклятие.',
  }),
  card({
    id: 'overclock',
    type: 'power',
    rarity: 'uncommon',
    effects: [{ type: 'apply_status', status: 'strength', amount: 2 }],
    description: '+{strength} силы.',
    upgrade: { effects: [{ type: 'apply_status', status: 'strength', amount: 3 }] },
  }),
  card({
    id: 'ddos',
    type: 'attack',
    rarity: 'common',
    target: 'all_enemies',
    effects: [{ type: 'damage', amount: 4 }],
    description: '{damage} урона всем.',
  }),
  card({
    id: 'ping_storm',
    type: 'attack',
    rarity: 'common',
    target: 'random_enemy',
    effects: [{ type: 'damage', amount: 3, times: 3 }],
    description: '{damage}×{times} случайным.',
  }),
  card({
    id: 'virus_inject',
    rarity: 'common',
    target: 'enemy',
    effects: [{ type: 'apply_status', status: 'virus', amount: 5 }],
    description: '{virus} вируса.',
  }),
  card({
    id: 'weaken',
    rarity: 'common',
    target: 'all_enemies',
    effects: [
      { type: 'apply_status', status: 'weak', amount: 2 },
      { type: 'apply_status', status: 'frail', amount: 1, target: 'self' },
    ],
    description: 'Всем {weak} слабости.',
  }),
  card({
    id: 'firewall',
    type: 'power',
    rarity: 'uncommon',
    target: 'self',
    effects: [
      { type: 'apply_status', status: 'plating', amount: 3 },
      { type: 'apply_status', status: 'thorns', amount: 2 },
    ],
    description: 'Броня и шипы.',
  }),
  card({
    id: 'patch',
    rarity: 'uncommon',
    effects: [
      { type: 'heal', amount: 4 },
      { type: 'apply_status', status: 'regen', amount: 3 },
      { type: 'apply_status', status: 'dexterity', amount: 1 },
    ],
    description: 'Лечение {heal}.',
  }),
  card({
    id: 'battery',
    rarity: 'rare',
    cost: 0,
    exhaust: true,
    effects: [{ type: 'gain_energy', amount: 2 }],
    description: '+{energy} энергии.',
  }),
  card({
    id: 'spam',
    type: 'attack',
    rarity: 'common',
    target: 'enemy',
    effects: [
      { type: 'damage', amount: 7 },
      { type: 'add_card', cardId: 'glitch', to: 'discard' },
      { type: 'add_card', cardId: 'glitch', to: 'draw' },
    ],
    description: '{damage} урона.',
  }),
  card({
    id: 'cleanup',
    rarity: 'rare',
    cost: 0,
    effects: [
      { type: 'exhaust_random_hand', amount: 1 },
      { type: 'gain_gold', amount: 5 },
      { type: 'lose_hp', amount: 1 },
      { type: 'add_card', cardId: 'strike', to: 'hand' },
    ],
    description: 'Сжечь {exhaust}.',
  }),
  card({
    id: 'ritual_code',
    type: 'power',
    rarity: 'rare',
    cost: 1,
    effects: [{ type: 'apply_status', status: 'ritual', amount: 1 }],
    description: 'Ритуал.',
  }),
  // phreaker
  card({ id: 'p_strike', classId: 'phreaker', type: 'attack', rarity: 'starter', target: 'enemy', effects: [{ type: 'damage', amount: 6 }] }),
  card({ id: 'p_defend', classId: 'phreaker', rarity: 'starter', effects: [{ type: 'block', amount: 5 }] }),
  card({ id: 'p_tone', classId: 'phreaker', type: 'attack', rarity: 'common', target: 'enemy', effects: [{ type: 'damage', amount: 9 }] }),
  // neutral
  card({ id: 'n_scan', classId: 'neutral', rarity: 'common', cost: 0, effects: [{ type: 'draw', amount: 1 }] }),
  card({ id: 'n_bolt', classId: 'neutral', type: 'attack', rarity: 'uncommon', target: 'enemy', effects: [{ type: 'damage', amount: 10 }] }),
  card({ id: 'n_overflow', classId: 'neutral', rarity: 'rare', effects: [{ type: 'block', amount: 15 }] }),
];

function enemiesForAct(act: 1 | 2 | 3): EnemyDef[] {
  const k = act; // множитель сложности
  return [
    {
      id: `a${act}_firewall`,
      name: 'Файрвол',
      tier: 'normal',
      act,
      hp: [10 + 4 * k, 14 + 4 * k],
      moves: [
        { id: 'hit', name: 'Удар', intent: 'attack', effects: [{ type: 'damage', amount: 4 + k }] },
        { id: 'guard', name: 'Защита', intent: 'defend', effects: [{ type: 'block', amount: 5 }] },
      ],
      ai: { kind: 'cycle', order: ['hit', 'guard'] },
    },
    {
      id: `a${act}_scanner`,
      name: 'Сканер',
      tier: 'normal',
      act,
      hp: [8 + 3 * k, 10 + 3 * k],
      moves: [
        { id: 'ping', name: 'Пинг', intent: 'attack', effects: [{ type: 'damage', amount: 2 + k, times: 2 }] },
        {
          id: 'mark',
          name: 'Метка',
          intent: 'debuff',
          effects: [
            { type: 'apply_status', status: 'vulnerable', amount: 1 },
            { type: 'add_card', cardId: 'glitch', to: 'discard' },
          ],
        },
      ],
      ai: { kind: 'random', weights: { ping: 3, mark: 1 } },
    },
    {
      id: `a${act}_antivirus`,
      name: 'Антивирус',
      tier: 'elite',
      act,
      hp: [30 + 8 * k, 34 + 8 * k],
      moves: [
        { id: 'scan', name: 'Скан', intent: 'buff', effects: [{ type: 'apply_status', status: 'ritual', amount: 1, target: 'self' }] },
        { id: 'quarantine', name: 'Карантин', intent: 'attack', effects: [{ type: 'damage', amount: 6 + 2 * k }] },
        {
          id: 'heal',
          name: 'Ремонт',
          intent: 'buff',
          effects: [
            { type: 'heal', amount: 5 },
            { type: 'apply_status', status: 'plating', amount: 2, target: 'self' },
          ],
        },
      ],
      ai: { kind: 'cycle', order: ['scan', 'quarantine', 'heal', 'quarantine'] },
    },
    {
      id: `a${act}_core`,
      name: 'Ядро',
      tier: 'boss',
      act,
      hp: [60 + 20 * k, 60 + 20 * k],
      moves: [
        { id: 'smash', name: 'Удар', intent: 'attack', effects: [{ type: 'damage', amount: 8 + 2 * k }] },
        {
          id: 'corrupt',
          name: 'Порча',
          intent: 'debuff',
          effects: [
            { type: 'apply_status', status: 'weak', amount: 2 },
            { type: 'apply_status', status: 'frail', amount: 2 },
            { type: 'apply_status', status: 'virus', amount: 2 },
          ],
        },
        {
          id: 'shield',
          name: 'Щит',
          intent: 'attack_defend',
          effects: [
            { type: 'block', amount: 10 },
            { type: 'damage', amount: 5 + k },
            { type: 'apply_status', status: 'thorns', amount: 1, target: 'self' },
          ],
        },
        { id: 'drain', name: 'Утечка', intent: 'attack_debuff', effects: [{ type: 'lose_hp', amount: 2 }, { type: 'draw', amount: 1 }] },
      ],
      ai: { kind: 'cycle', order: ['smash', 'corrupt', 'shield', 'drain'] },
    },
  ];
}

const enemies: EnemyDef[] = [...enemiesForAct(1), ...enemiesForAct(2), ...enemiesForAct(3)];

const encounters: EncounterDef[] = ([1, 2, 3] as const).flatMap((act): EncounterDef[] => [
  { id: `e${act}_easy1`, act, tier: 'normal', enemies: [`a${act}_firewall`], early: true },
  { id: `e${act}_easy2`, act, tier: 'normal', enemies: [`a${act}_scanner`], early: true },
  { id: `e${act}_duo`, act, tier: 'normal', enemies: [`a${act}_firewall`, `a${act}_scanner`] },
  { id: `e${act}_trio`, act, tier: 'normal', enemies: [`a${act}_scanner`, `a${act}_scanner`, `a${act}_firewall`] },
  { id: `e${act}_elite`, act, tier: 'elite', enemies: [`a${act}_antivirus`] },
  { id: `e${act}_boss`, act, tier: 'boss', enemies: [`a${act}_core`] },
]);

const relics: RelicDef[] = [
  { id: 'r_starter', name: 'Бэкап', rarity: 'starter', classId: 'netrunner', description: 'Лечит 6 после боя', trigger: 'combat_end', effects: [{ type: 'heal', amount: 6 }] },
  { id: 'r_p_starter', name: 'Свисток', rarity: 'starter', classId: 'phreaker', description: '', trigger: 'combat_start', effects: [{ type: 'block', amount: 3 }] },
  { id: 'r_vuln', name: 'Сниффер', rarity: 'common', classId: 'neutral', description: '', trigger: 'combat_start', effects: [{ type: 'apply_status', status: 'vulnerable', amount: 1, target: 'all_enemies' }] },
  { id: 'r_every3', name: 'Кастет', rarity: 'common', classId: 'neutral', description: '', trigger: 'attack_played', every: 3, effects: [{ type: 'damage', amount: 5, target: 'random_enemy' }] },
  { id: 'r_turn_end', name: 'Кэш', rarity: 'common', classId: 'neutral', description: '', trigger: 'turn_end', effects: [{ type: 'block', amount: 2 }] },
  { id: 'r_cards5', name: 'Счётчик', rarity: 'uncommon', classId: 'neutral', description: '', trigger: 'card_played', every: 5, effects: [{ type: 'draw', amount: 1 }] },
  { id: 'r_turn_start', name: 'Батарея', rarity: 'uncommon', classId: 'neutral', description: '', trigger: 'turn_start', every: 2, effects: [{ type: 'gain_energy', amount: 1 }] },
  { id: 'r_gold', name: 'Кошелёк', rarity: 'rare', classId: 'neutral', description: '', trigger: 'pickup', effects: [{ type: 'gain_gold', amount: 50 }, { type: 'heal', amount: 5 }] },
  { id: 'r_rest', name: 'Подушка', rarity: 'rare', classId: 'neutral', description: '', trigger: 'rest', effects: [{ type: 'heal', amount: 5 }] },
  { id: 'r_boss_energy', name: 'Ядро', rarity: 'boss', classId: 'neutral', description: '', trigger: 'turn_start', effects: [{ type: 'gain_energy', amount: 1 }] },
  { id: 'r_boss_draw', name: 'Буфер', rarity: 'boss', classId: 'neutral', description: '', trigger: 'combat_start', effects: [{ type: 'draw', amount: 2 }] },
  { id: 'r_boss_aoe', name: 'Взрыв', rarity: 'boss', classId: 'neutral', description: '', trigger: 'combat_start', effects: [{ type: 'damage', amount: 3, target: 'all_enemies' }] },
  { id: 'r_shop', name: 'Купон', rarity: 'shop', classId: 'neutral', description: '', trigger: 'combat_start', effects: [{ type: 'apply_status', status: 'strength', amount: 1 }] },
];

const events: EventDef[] = [
  {
    id: 'ev_cache',
    name: 'Тайник',
    text: 'Зашифрованный тайник.',
    options: [
      { label: 'Взломать', effects: [{ type: 'gain_gold', amount: 40 }, { type: 'lose_hp', amount: 5 }] },
      { label: 'Уйти', effects: [] },
    ],
  },
  {
    id: 'ev_forge',
    name: 'Компилятор',
    text: 'Перекомпилировать программу?',
    options: [
      { label: 'Улучшить', effects: [], special: 'upgrade_card' },
      { label: 'Удалить', effects: [], special: 'remove_card' },
    ],
  },
  {
    id: 'ev_ambush',
    name: 'Засада',
    text: 'Ловушка-ханипот.',
    options: [
      { label: 'Драться', effects: [], special: 'fight' },
      { label: 'Откупиться', effects: [{ type: 'gain_gold', amount: -30 }, { type: 'heal', amount: 10 }], special: 'random_relic' },
    ],
  },
  {
    id: 'ev_market',
    name: 'Даркнет',
    text: 'Чёрный рынок.',
    act: 2,
    options: [
      { label: 'Купить код', effects: [{ type: 'gain_gold', amount: -500 }], special: 'random_card' },
      { label: 'Украсть', effects: [{ type: 'damage', amount: 3, times: 2 }, { type: 'add_card', cardId: 'malware', to: 'discard' }], special: 'random_card' },
    ],
  },
];

const classes: ContentData['classes'] = [
  {
    id: 'netrunner',
    name: 'Нетраннер',
    description: 'Атакующий хакер',
    maxHp: 70,
    startingGold: 99,
    startingDeck: ['strike', 'strike', 'strike', 'strike', 'strike', 'defend', 'defend', 'defend', 'defend', 'bash'],
    startingRelic: 'r_starter',
  },
  {
    id: 'phreaker',
    name: 'Фрикер',
    description: 'Телефонный взломщик',
    maxHp: 65,
    startingGold: 99,
    startingDeck: ['p_strike', 'p_strike', 'p_strike', 'p_strike', 'p_defend', 'p_defend', 'p_defend', 'p_defend'],
    startingRelic: 'r_p_starter',
  },
];

export function fixtureContent(): ContentData {
  return structuredClone({ cards, enemies, relics, statuses, classes, events, encounters });
}

/** Лёгкий контент: враги с 1 HP и уроном 1 — бот гарантированно проходит до конца. */
export function easyContent(): ContentData {
  const c = fixtureContent();
  for (const e of c.enemies) {
    e.hp = [1, 1];
    for (const m of e.moves) {
      for (const eff of m.effects) if (eff.type === 'damage') eff.amount = 1;
    }
  }
  return c;
}
