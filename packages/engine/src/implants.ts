/**
 * Импланты v2: цвет (редкость) решает силу, красные — чистый вред. У каждого импланта своё условие
 * действия (duration): весь забег, N боёв, до события, до выполнения задачи. Лимита на количество нет,
 * отказаться нельзя — цвет виден, но имплант берётся всегда.
 *
 * Внутри кода импланты остаются «relic» (RunState.relics, RelicDef) — так меньше переделок;
 * этот файл — договор цветов, условий и узлов, логика — здесь же.
 *
 * Классовый: на старте у класса ослабленная версия (classes.startingRelic → weak), полная выпадает
 * из любого ролла с шансом classFullChance (база 1%, Маяк +1%, не чаще раза за акт — потолок 5%).
 */

import { getContent } from './content';
import type { Rng } from './rng';
import type { GameEvent, RelicDef, RunState } from './types';

export type ImplantColor ='red' | 'gray' | 'green' | 'blue' | 'purple' | 'gold' | 'class';

/** Порядок от худшего к лучшему (синтез и рипердок ходят по нему; class вне лестницы) */
export const IMPLANT_LADDER: readonly ImplantColor[] = ['red', 'gray', 'green', 'blue', 'purple', 'gold'];

/** Веса цвета при ролле — одинаковые для Сигнала, событий, магазина, элиты и босса */
export const IMPLANT_COLOR_WEIGHTS: Record<Exclude<ImplantColor, 'class'>, number> = {
  red: 25, gray: 30, green: 20, blue: 13, purple: 9, gold: 3,
};

export const IMPLANT_COLOR_NAMES: Record<ImplantColor, string> = {
  red: 'Красный', gray: 'Серый', green: 'Зелёный', blue: 'Синий', purple: 'Фиолетовый', gold: 'Золотой', class: 'Классовый',
};

export const CLASS_FULL_BASE = 0.01;
export const BEACON_BONUS = 0.01;
/** Снятие красного в магазине: BASE + STEP × redRemovals */
export const RED_REMOVE_BASE_PRICE = 90;
export const RED_REMOVE_PRICE_STEP = 30;

/** Задача, по выполнении которой имплант снимается (красный) или сгорает (бафф) */
export type ImplantTask =
  | { kind: 'win_no_damage' } // выиграть бой без потери HP (goal = число таких боёв, обычно 1)
  | { kind: 'play_attacks'; n: number }
  | { kind: 'play_skills'; n: number }
  | { kind: 'kill_enemies'; n: number }
  | { kind: 'win_combats'; n: number }
  | { kind: 'win_elite' }
  | { kind: 'end_combat_hp_above'; pct: number }; // закончить бой с HP ≥ pct% от максимума

export type ImplantDuration =
  | { kind: 'run' }
  | { kind: 'combats'; n: number }
  | { kind: 'until'; event: 'boss' | 'rest' | 'act_end' }
  | { kind: 'task'; task: ImplantTask };

/** Счётчики условия в RunState.implantState */
export interface ImplantProgress {
  /** combats: сколько боёв осталось */
  combatsLeft?: number;
  /** task: текущий прогресс (goal — из задачи) */
  progress?: number;
}

/** Вариант на экране implant_node (выбор через node_choice; index = позиция) */
export interface ImplantNodeOption {
  label: string;
  /** Пояснение: что отдашь/получишь */
  hint?: string;
  /** Нельзя выбрать (нет денег, нет пары и т.п.) */
  disabled?: boolean;
  /** Импланты, которые затронет выбор (для подсветки в UI) */
  relicIds?: string[];
  /** Карантин: кредиты за этот вариант */
  gold?: number;
}

// ======================= Логика =======================

export type RollColor = Exclude<ImplantColor, 'class'>;

const RARITY_COLOR: Record<RelicDef['rarity'], ImplantColor> = {
  starter: 'class', common: 'gray', uncommon: 'green', rare: 'blue', boss: 'purple', shop: 'green',
};

/** Цена импланта в магазине по цвету (красные не продаются) */
export const IMPLANT_PRICES: Record<ImplantColor, number> = {
  red: 0, gray: 80, green: 120, blue: 170, purple: 230, gold: 320, class: 320,
};

export function relicColor(r: Pick<RelicDef, 'color' | 'rarity'>): ImplantColor {
  return r.color ?? RARITY_COLOR[r.rarity] ?? 'gray';
}

export function colorOf(id: string): ImplantColor {
  const def = getContent().relics.get(id);
  return def ? relicColor(def) : 'gray';
}

/** Можно выдать игроку: нейтральный или его класса, не закрыт, ещё нет */
export function implantAvailable(s: RunState, r: RelicDef): boolean {
  return (
    !s.relics.includes(r.id) &&
    (r.classId === 'neutral' || r.classId === s.classId) &&
    !(s.locked && s.locked.relics.includes(r.id))
  );
}

export function rollImplantColor(rng: Rng, exclude: readonly RollColor[] = []): RollColor {
  const w = (Object.entries(IMPLANT_COLOR_WEIGHTS) as [RollColor, number][]).filter(([c]) => !exclude.includes(c));
  return rng.weighted(w);
}

/** Случайный имплант цвета; пул пуст — ближайший соседний по лестнице (сначала выше) */
export function rollImplantOfColor(
  s: RunState,
  rng: Rng,
  color: RollColor,
  avoid: readonly string[] = [],
  exclude: readonly RollColor[] = [],
): string | undefined {
  const pool = getContent().data.relics.filter((r) => implantAvailable(s, r) && !avoid.includes(r.id));
  const i0 = IMPLANT_LADDER.indexOf(color);
  for (let d = 0; d < IMPLANT_LADDER.length; d++) {
    for (const i of d === 0 ? [i0] : [i0 + d, i0 - d]) {
      const c = IMPLANT_LADDER[i];
      if (!c || exclude.includes(c as RollColor)) continue;
      const of = pool.filter((r) => relicColor(r) === c);
      if (of.length > 0) return rng.pick(of).id;
    }
  }
  return undefined;
}

/** Полная версия классового, если у игрока ослабленная (и полной ещё нет) */
export function classFullCandidate(s: RunState): string | undefined {
  const relics = getContent().relics;
  for (const id of s.relics) {
    const full = relics.get(id)?.fullId;
    if (full && relics.has(full) && !s.relics.includes(full)) return full;
  }
  return undefined;
}

/** Ролл импланта (везде одинаково): шанс Классового, затем цвет по весам */
export function rollImplant(s: RunState, rng: Rng, opts: { noRed?: boolean; avoid?: readonly string[] } = {}): string | undefined {
  const full = classFullCandidate(s);
  if (full && !opts.avoid?.includes(full) && rng.next() < (s.classFullChance ?? CLASS_FULL_BASE)) return full;
  const exclude: RollColor[] = opts.noRed ? ['red'] : [];
  return rollImplantOfColor(s, rng, rollImplantColor(rng, exclude), opts.avoid, exclude);
}

/** Сдвиг по лестнице с клампом (Классовый считается вершиной) */
export function shiftColor(c: ImplantColor, step: number): RollColor {
  const i = c === 'class' ? IMPLANT_LADDER.length - 1 : IMPLANT_LADDER.indexOf(c);
  return IMPLANT_LADDER[Math.max(0, Math.min(IMPLANT_LADDER.length - 1, i + step))] as RollColor;
}

// ---------- условия ----------

export function taskGoal(t: ImplantTask): number {
  return 'n' in t ? t.n : 1;
}

function durationOf(id: string): ImplantDuration {
  return getContent().relics.get(id)?.duration ?? { kind: 'run' };
}

type ExpireReason = Extract<GameEvent, { type: 'implant_expired' }>['reason'];

/** Учёт полученного импланта: замена ослабленной версии, счётчики, очередь карточки */
export function registerImplant(s: RunState, id: string, ev: GameEvent[]): void {
  const def = getContent().relics.get(id);
  if (def?.weakId && s.relics.includes(def.weakId)) removeImplant(s, def.weakId, 'swap', ev);
  const d = durationOf(id);
  const st = (s.implantState ??= {});
  if (d.kind === 'combats') st[id] = { combatsLeft: d.n };
  else if (d.kind === 'task') st[id] = { progress: 0 };
  (s.implantQueue ??= []).push(id);
}

export function removeImplant(s: RunState, id: string, reason: ExpireReason, ev: GameEvent[]): void {
  const i = s.relics.indexOf(id);
  if (i < 0) return;
  s.relics.splice(i, 1);
  if (s.implantState) delete s.implantState[id];
  ev.push({ type: 'implant_expired', relicId: id, reason });
}

function addProgress(s: RunState, id: string, goal: number, by: number, ev: GameEvent[]): void {
  if (by <= 0) return;
  const st = ((s.implantState ??= {})[id] ??= { progress: 0 });
  const prev = st.progress ?? 0;
  const next = Math.min(goal, prev + by);
  if (next === prev) return;
  st.progress = next;
  ev.push({ type: 'implant_progress', relicId: id, progress: next, goal });
}

function tasks(s: RunState): [string, ImplantTask][] {
  const out: [string, ImplantTask][] = [];
  for (const id of s.relics) {
    const d = durationOf(id);
    if (d.kind === 'task') out.push([id, d.task]);
  }
  return out;
}

/** Прогресс задач по событиям одного действия в бою (атаки, навыки, убийства) */
export function trackCombatEvents(s: RunState, ev: GameEvent[]): void {
  const ts = tasks(s);
  if (ts.length === 0) return;
  const cards = getContent().cards;
  let attacks = 0;
  let skills = 0;
  let kills = 0;
  for (const e of ev) {
    if (e.type === 'card_played') {
      const t = cards.get(e.defId)?.type;
      if (t === 'attack') attacks++;
      else if (t === 'skill') skills++;
    } else if (e.type === 'enemy_died') kills++;
  }
  for (const [id, t] of ts) {
    const by = t.kind === 'play_attacks' ? attacks : t.kind === 'play_skills' ? skills : t.kind === 'kill_enemies' ? kills : 0;
    addProgress(s, id, taskGoal(t), by, ev);
  }
}

/** Выигран бой: задачи, счётчики боёв, «до босса» */
export function onImplantCombatWon(s: RunState, tier: 'normal' | 'elite' | 'boss', ev: GameEvent[]): void {
  const startHp = s.combatStartHp ?? s.hp;
  delete s.combatStartHp;
  for (const [id, t] of tasks(s)) {
    const ok =
      t.kind === 'win_combats' ||
      (t.kind === 'win_elite' && tier === 'elite') ||
      (t.kind === 'win_no_damage' && s.hp >= startHp) ||
      (t.kind === 'end_combat_hp_above' && s.hp * 100 >= t.pct * s.maxHp);
    if (ok) addProgress(s, id, taskGoal(t), 1, ev);
  }
  for (const [id, t] of tasks(s)) if ((s.implantState?.[id]?.progress ?? 0) >= taskGoal(t)) removeImplant(s, id, 'task', ev);
  for (const id of [...s.relics]) {
    const d = durationOf(id);
    if (d.kind !== 'combats') continue;
    const st = ((s.implantState ??= {})[id] ??= { combatsLeft: d.n });
    st.combatsLeft = Math.max(0, (st.combatsLeft ?? d.n) - 1);
    ev.push({ type: 'implant_progress', relicId: id, progress: d.n - st.combatsLeft, goal: d.n });
    if (st.combatsLeft <= 0) removeImplant(s, id, 'duration', ev);
  }
  if (tier === 'boss') onImplantEvent(s, 'boss', ev);
}

/** Событие забега для условий until */
export function onImplantEvent(s: RunState, event: 'boss' | 'rest' | 'act_end', ev: GameEvent[]): void {
  for (const id of [...s.relics]) {
    const d = durationOf(id);
    if (d.kind === 'until' && d.event === event) removeImplant(s, id, 'duration', ev);
  }
}

export function redImplants(s: RunState): string[] {
  return s.relics.filter((id) => colorOf(id) === 'red');
}

export function redRemovePrice(s: RunState, priceMult = 1): number {
  return Math.round((RED_REMOVE_BASE_PRICE + RED_REMOVE_PRICE_STEP * (s.redRemovals ?? 0)) * priceMult);
}

// ---------- узлы ----------

export type ImplantNodeKind = 'signal' | 'synth' | 'ripperdoc' | 'quarantine' | 'beacon';

function nameOf(id: string): string {
  return getContent().relics.get(id)?.name ?? id;
}

/** Синтезатор: цвета, где у игрока ≥2 импланта (кроме золота и Классового) */
export function synthGroups(s: RunState): [RollColor, string[]][] {
  const out: [RollColor, string[]][] = [];
  for (const c of IMPLANT_LADDER) {
    if (c === 'gold') continue;
    const ids = s.relics.filter((id) => colorOf(id) === c);
    if (ids.length >= 2) out.push([c as RollColor, ids]);
  }
  return out;
}

export function ripperdocTargets(s: RunState): string[] {
  return s.relics.filter((id) => colorOf(id) !== 'class');
}

export function implantNodeOptions(s: RunState, node: Exclude<ImplantNodeKind, 'quarantine'>): ImplantNodeOption[] {
  switch (node) {
    case 'signal':
      return [{ label: 'Получить имплант', hint: 'Случайный имплант любого цвета' }];
    case 'beacon':
      return [
        {
          label: `+${Math.round(BEACON_BONUS * 100)}% к шансу Классового`,
          hint: 'До конца забега',
          disabled: (s.beaconActs ?? []).includes(s.act),
        },
      ];
    case 'synth':
      return synthGroups(s).map(([c, ids]) => ({
        label: `Слить 2 · ${IMPLANT_COLOR_NAMES[c]}`,
        hint: `2 случайных → ${IMPLANT_COLOR_NAMES[shiftColor(c, 1)]}`,
        relicIds: ids,
      }));
    case 'ripperdoc':
      return ripperdocTargets(s).map((id) => {
        const c = colorOf(id);
        return {
          label: `Отдать: ${nameOf(id)}`,
          hint: `50/50: ${IMPLANT_COLOR_NAMES[shiftColor(c, 1)]} или ${IMPLANT_COLOR_NAMES[shiftColor(c, -1)]}`,
          relicIds: [id],
        };
      });
  }
}

/** Награда Карантина: снять красный (по варианту на каждый) или кредиты */
export function quarantineOptions(s: RunState, gold: number): ImplantNodeOption[] {
  return [
    ...redImplants(s).map((id) => ({ label: `Снять: ${nameOf(id)}`, hint: 'Красный имплант удаляется', relicIds: [id] })),
    { label: `+${gold} кредитов`, gold },
  ];
}
