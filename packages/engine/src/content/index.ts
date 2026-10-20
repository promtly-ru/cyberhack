/**
 * Загрузка контента из JSON + индексы + валидация.
 * Для тестов контент подменяется через setContentForTests()/resetContent().
 */
import cardsJson from './cards.json';
import classesJson from './classes.json';
import encountersJson from './encounters.json';
import enemiesJson from './enemies.json';
import eventsJson from './events.json';
import relicsJson from './relics.json';
import statusesJson from './statuses.json';
import type {
  CardDef,
  ClassDef,
  Effect,
  EncounterDef,
  EnemyDef,
  EventDef,
  RelicDef,
  RelicTrigger,
  StatusDef,
} from '../types';
import { KNOWN_STATUSES } from '../statuses';
import { getPotion } from '../potions';

export interface ContentData {
  cards: CardDef[];
  enemies: EnemyDef[];
  relics: RelicDef[];
  statuses: StatusDef[];
  classes: ClassDef[];
  events: EventDef[];
  encounters: EncounterDef[];
}

export interface ContentIndex {
  data: ContentData;
  cards: Map<string, CardDef>;
  enemies: Map<string, EnemyDef>;
  relics: Map<string, RelicDef>;
  statuses: Map<string, StatusDef>;
  classes: Map<string, ClassDef>;
  events: Map<string, EventDef>;
  encounters: Map<string, EncounterDef>;
}

/** JSON может быть массивом или объектом-обёрткой с массивом внутри. */
function asArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    for (const v of Object.values(raw as Record<string, unknown>)) if (Array.isArray(v)) return v as T[];
  }
  return [];
}

export const defaultContent: ContentData = {
  cards: asArray<CardDef>(cardsJson),
  enemies: asArray<EnemyDef>(enemiesJson),
  relics: asArray<RelicDef>(relicsJson),
  statuses: asArray<StatusDef>(statusesJson),
  classes: asArray<ClassDef>(classesJson),
  events: asArray<EventDef>(eventsJson),
  encounters: asArray<EncounterDef>(encountersJson),
};

function toMap<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) if (!m.has(it.id)) m.set(it.id, it);
  return m;
}

export function buildIndex(data: ContentData): ContentIndex {
  return {
    data,
    cards: toMap(data.cards),
    enemies: toMap(data.enemies),
    relics: toMap(data.relics),
    statuses: toMap(data.statuses),
    classes: toMap(data.classes),
    events: toMap(data.events),
    encounters: toMap(data.encounters),
  };
}

let current: ContentIndex = buildIndex(defaultContent);

export function getContent(): ContentIndex {
  return current;
}

/** Подменить контент (тесты, моды, превью в редакторе). */
export function setContentForTests(data: ContentData): void {
  current = buildIndex(data);
}

/** Вернуть контент из JSON. */
export function resetContent(): void {
  current = buildIndex(defaultContent);
}

// ---------- Валидация ----------

const CLASS_IDS = new Set(['netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono', 'vabanker']);
const RELIC_TRIGGERS: ReadonlySet<RelicTrigger> = new Set<RelicTrigger>([
  'combat_start',
  'turn_start',
  'turn_end',
  'card_played',
  'attack_played',
  'combat_end',
  'pickup',
  'rest',
]);
const EFFECT_TYPES = new Set([
  'damage',
  'block',
  'apply_status',
  'draw',
  'gain_energy',
  'heal',
  'lose_hp',
  'add_card',
  'exhaust_random_hand',
  'gain_gold',
  'scry',
  'discard_hand_draw',
  'upgrade_random_hand',
  'gain_max_hp',
  'heal_pct',
  'double_next',
  'cleanse',
  'gain_potion',
  'gamble',
  'conditional',
  'multiply_status',
  'consume_status',
  'add_hook',
  'summon',
  'shield_allies',
]);
const ENEMY_ONLY_EFFECTS = new Set(['summon', 'shield_allies']);

const HOOK_TRIGGERS = new Set(['play_attack', 'play_skill', 'apply_status', 'exhaust', 'turn_start', 'turn_end', 'take_damage']);
const PER_KINDS = new Set(['target_status', 'self_status', 'discard_size', 'exhaust_size', 'attacks_played_this_turn', 'cards_in_hand']);
/** Эффекты без поля amount */
const NO_AMOUNT = new Set(['add_card', 'conditional', 'multiply_status', 'consume_status', 'add_hook']);

function checkDuplicates(kind: string, items: readonly { id: string }[], errors: string[]): void {
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || it.id === '') {
      errors.push(`${kind}: элемент без id`);
      continue;
    }
    if (seen.has(it.id)) errors.push(`${kind}: дубль id "${it.id}"`);
    seen.add(it.id);
  }
}

/** Возвращает список ошибок контента (пустой — всё в порядке). */
export function validateContent(data: ContentData = current.data): string[] {
  const errors: string[] = [];
  checkDuplicates('cards', data.cards, errors);
  checkDuplicates('enemies', data.enemies, errors);
  checkDuplicates('relics', data.relics, errors);
  checkDuplicates('statuses', data.statuses, errors);
  checkDuplicates('classes', data.classes, errors);
  checkDuplicates('events', data.events, errors);
  checkDuplicates('encounters', data.encounters, errors);

  const cardIds = new Set(data.cards.map((c) => c.id));
  const enemyIds = new Set(data.enemies.map((e) => e.id));
  const relicIds = new Set(data.relics.map((r) => r.id));
  const statusIds = new Set(data.statuses.map((s) => s.id));

  const checkEffects = (where: string, effects: unknown, enemy = false): void => {
    if (!Array.isArray(effects)) {
      errors.push(`${where}: effects не массив`);
      return;
    }
    (effects as Effect[]).forEach((e, i) => {
      const at = `${where}.effects[${i}]`;
      if (!e || !EFFECT_TYPES.has(e.type)) {
        errors.push(`${at}: неизвестный тип эффекта "${(e as { type?: unknown })?.type}"`);
        return;
      }
      if (!enemy && ENEMY_ONLY_EFFECTS.has(e.type)) errors.push(`${at}: эффект "${e.type}" только для врагов`);
      if (e.type === 'summon' && !enemyIds.has(e.enemyId)) errors.push(`${at}: неизвестный враг "${e.enemyId}"`);
      if (e.type === 'apply_status' && !statusIds.has(e.status)) errors.push(`${at}: неизвестный статус "${e.status}"`);
      if (e.type === 'add_card' && !cardIds.has(e.cardId)) errors.push(`${at}: неизвестная карта "${e.cardId}"`);
      if (e.type === 'gain_potion' && e.potionId !== undefined && !getPotion(e.potionId))
        errors.push(`${at}: неизвестный расходник "${e.potionId}"`);
      if (e.type === 'gamble') {
        if (e.amount < 0 || e.amount > 100) errors.push(`${at}: шанс gamble вне 0..100`);
        checkEffects(`${at}.win`, e.win);
        if (e.lose !== undefined) checkEffects(`${at}.lose`, e.lose);
      }
      if ((e.type === 'damage' || e.type === 'block') && e.per !== undefined) {
        if (!PER_KINDS.has(e.per.kind)) errors.push(`${at}: неизвестный per.kind "${e.per.kind}"`);
        if ((e.per.kind === 'target_status' || e.per.kind === 'self_status') && !statusIds.has(e.per.status))
          errors.push(`${at}: неизвестный статус per "${e.per.status}"`);
        if (e.perAmount !== undefined && typeof e.perAmount !== 'number') errors.push(`${at}: perAmount не число`);
      }
      if (e.type === 'conditional') {
        const cond = e.if as unknown;
        if (!cond || typeof cond !== 'object') errors.push(`${at}: нет условия if`);
        else {
          for (const k of ['targetHasStatus', 'selfHasStatus'] as const) {
            const v = e.if[k];
            if (v !== undefined && !statusIds.has(v)) errors.push(`${at}: неизвестный статус в if.${k} "${v}"`);
          }
          for (const k of ['hpBelowPct', 'handSizeAtMost', 'playedAttacksThisTurnAtLeast'] as const) {
            const v = e.if[k];
            if (v !== undefined && typeof v !== 'number') errors.push(`${at}: if.${k} не число`);
          }
        }
        checkEffects(`${at}.then`, e.then);
        if (e.else !== undefined) checkEffects(`${at}.else`, e.else);
      }
      if ((e.type === 'multiply_status' || e.type === 'consume_status') && !statusIds.has(e.status))
        errors.push(`${at}: неизвестный статус "${e.status}"`);
      if (e.type === 'multiply_status' && typeof e.factor !== 'number') errors.push(`${at}: factor не число`);
      if (e.type === 'consume_status' && typeof e.damageMult !== 'number') errors.push(`${at}: damageMult не число`);
      if (e.type === 'add_hook') {
        if (!e.hook || !HOOK_TRIGGERS.has(e.hook.on)) errors.push(`${at}: неизвестный hook.on "${e.hook?.on}"`);
        else checkEffects(`${at}.hook`, e.hook.effects);
      }
      if (typeof (e as { amount?: unknown }).amount !== 'number' && !NO_AMOUNT.has(e.type))
        errors.push(`${at}: amount не число`);
    });
  };

  for (const s of data.statuses) {
    if (!(s.id in KNOWN_STATUSES)) errors.push(`statuses: статус "${s.id}" не поддерживается движком`);
  }

  for (const c of data.cards) {
    const w = `card "${c.id}"`;
    if (!(c.classId === 'neutral' || CLASS_IDS.has(c.classId))) errors.push(`${w}: неизвестный classId "${c.classId}"`);
    if (typeof c.cost !== 'number' || c.cost < -2) errors.push(`${w}: некорректная стоимость ${c.cost}`);
    checkEffects(w, c.effects);
    if (c.upgrade?.effects) checkEffects(`${w}.upgrade`, c.upgrade.effects);
  }

  for (const e of data.enemies) {
    const w = `enemy "${e.id}"`;
    if (!Array.isArray(e.hp) || e.hp.length !== 2 || e.hp[0] > e.hp[1] || e.hp[0] <= 0)
      errors.push(`${w}: некорректный hp`);
    const moves = Array.isArray(e.moves) ? e.moves : [];
    if (moves.length === 0) errors.push(`${w}: нет moves`);
    checkDuplicates(`${w}.moves`, moves, errors);
    const moveIds = new Set(moves.map((m) => m.id));
    for (const m of moves) checkEffects(`${w}.move "${m.id}"`, m.effects, true);
    const badMove = (where: string, id: unknown) => {
      if (typeof id !== 'string' || !moveIds.has(id)) errors.push(`${w}: ${where} ссылается на неизвестный move "${String(id)}"`);
    };
    if (!e.ai) errors.push(`${w}: нет ai`);
    else if (e.ai.kind === 'cycle') {
      if (!Array.isArray(e.ai.order) || e.ai.order.length === 0) errors.push(`${w}: пустой ai.order`);
      else for (const id of e.ai.order) if (!moveIds.has(id)) errors.push(`${w}: ai.order ссылается на неизвестный move "${id}"`);
    } else if (e.ai.kind === 'random') {
      const entries = Object.entries(e.ai.weights ?? {});
      if (!entries.some(([, wt]) => wt > 0)) errors.push(`${w}: нет положительных ai.weights`);
      for (const [id] of entries) if (!moveIds.has(id)) errors.push(`${w}: ai.weights ссылается на неизвестный move "${id}"`);
    } else if (e.ai.kind === 'phased') {
      const phases = Array.isArray(e.ai.phases) ? e.ai.phases : [];
      if (phases.length === 0) errors.push(`${w}: нет ai.phases`);
      phases.forEach((p, i) => {
        if (typeof p.hpAtMost !== 'number' || p.hpAtMost <= 0 || p.hpAtMost > 100) errors.push(`${w}: ai.phases[${i}].hpAtMost вне 1..100`);
        if (!p.order?.length && !Object.values(p.weights ?? {}).some((x) => x > 0)) errors.push(`${w}: ai.phases[${i}] без ходов`);
        p.order?.forEach((id) => badMove(`ai.phases[${i}].order`, id));
        Object.keys(p.weights ?? {}).forEach((id) => badMove(`ai.phases[${i}].weights`, id));
        if (p.onEnter !== undefined) badMove(`ai.phases[${i}].onEnter`, p.onEnter);
      });
      if (phases.length > 0 && !phases.some((p) => p.hpAtMost === 100)) errors.push(`${w}: нет фазы с hpAtMost 100`);
    } else if (e.ai.kind === 'scripted') {
      if (!Array.isArray(e.ai.script)) errors.push(`${w}: ai.script не массив`);
      else e.ai.script.forEach((st, i) => badMove(`ai.script[${i}]`, st.move));
      if (!Array.isArray(e.ai.fallback) || e.ai.fallback.length === 0) errors.push(`${w}: пустой ai.fallback`);
      else e.ai.fallback.forEach((id) => badMove('ai.fallback', id));
    } else errors.push(`${w}: неизвестный ai.kind`);
  }

  for (const r of data.relics) {
    const w = `relic "${r.id}"`;
    if (!RELIC_TRIGGERS.has(r.trigger)) errors.push(`${w}: неизвестный trigger "${r.trigger}"`);
    if (r.every !== undefined && (!Number.isInteger(r.every) || r.every < 1)) errors.push(`${w}: every должен быть целым >= 1`);
    checkEffects(w, r.effects);
  }

  for (const c of data.classes) {
    const w = `class "${c.id}"`;
    if (!CLASS_IDS.has(c.id)) errors.push(`${w}: неизвестный id класса`);
    if (!Array.isArray(c.startingDeck) || c.startingDeck.length === 0) errors.push(`${w}: пустая стартовая колода`);
    else for (const id of c.startingDeck) if (!cardIds.has(id)) errors.push(`${w}: стартовая колода ссылается на неизвестную карту "${id}"`);
    if (!relicIds.has(c.startingRelic)) errors.push(`${w}: неизвестная стартовая реликвия "${c.startingRelic}"`);
  }

  for (const ev of data.events) {
    const w = `event "${ev.id}"`;
    if (!Array.isArray(ev.options) || ev.options.length === 0) errors.push(`${w}: нет options`);
    else
      ev.options.forEach((o, i) => {
        checkEffects(`${w}.options[${i}]`, o.effects);
        o.outcomes?.forEach((r, j) => checkEffects(`${w}.options[${i}].outcomes[${j}]`, r.effects));
        if (o.outcomes && o.outcomes.some((r) => !(r.weight > 0))) errors.push(`${w}.options[${i}]: вес исхода должен быть > 0`);
      });
  }

  for (const enc of data.encounters) {
    const w = `encounter "${enc.id}"`;
    if (!Array.isArray(enc.enemies) || enc.enemies.length === 0) errors.push(`${w}: нет врагов`);
    else for (const id of enc.enemies) if (!enemyIds.has(id)) errors.push(`${w}: неизвестный враг "${id}"`);
  }

  // Покрытие актов: для каждого акта нужны обычные, элитные и босс-встречи.
  if (data.encounters.length > 0) {
    const maxAct = Math.max(...data.encounters.map((e) => e.act));
    for (const act of ([1, 2, 3, 4] as const).filter((a) => a <= maxAct)) {
      for (const tier of ['normal', 'elite', 'boss'] as const) {
        if (!data.encounters.some((e) => e.act === act && e.tier === tier))
          errors.push(`encounters: нет встреч tier "${tier}" для акта ${act}`);
      }
    }
  }

  return errors;
}
