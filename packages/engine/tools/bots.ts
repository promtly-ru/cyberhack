/**
 * Боты-симуляторы поверх getLegalActions/applyAction.
 *  - novice: простой жадный игрок;
 *  - expert: оценка карт, компактная колода, выбор пути, перебор розыгрыша руки с симуляцией хода врагов.
 * Боты детерминированы: собственный ГСЧ от сида забега.
 */
import { getAscensionMods } from '../src/ascension';
import { canUpgrade, needsEnemyTarget, resolveCard, type ResolvedCard } from '../src/cards';
import { endTurn, isPlayable, livingEnemies, playCard, type CombatCtx } from '../src/combat';
import { getContent } from '../src/content';
import { getLegalActions } from '../src/run';
import { hashString, mulberry32 } from '../src/rng';
import { getStatus } from '../src/statuses';
import type { Action, CardInstance, CombatState, Effect, EnemyState, MapNode, RunState, ShopItem } from '../src/types';

export type BotKind = 'novice' | 'expert';

export interface Bot {
  readonly kind: BotKind;
  act(s: RunState): Action;
}

// ---------- общий ГСЧ бота ----------

class BotRng {
  private st: number;
  constructor(seed: string) {
    this.st = hashString(`bot::${seed}`);
  }
  next(): number {
    const [v, s] = mulberry32(this.st);
    this.st = s;
    return v;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }
}

export function createBot(kind: BotKind, seed: string): Bot {
  return kind === 'novice' ? new NoviceBot(seed) : new ExpertBot(seed);
}

// ---------- утилиты ----------

/** Страховка от бесконечных комбо: не больше 60 розыгрышей за ход. */
function playCap(cap: { key: string; n: number }, s: RunState, c: CombatState): boolean {
  const key = `${s.floor}:${c.turn}`;
  if (cap.key !== key) {
    cap.key = key;
    cap.n = 0;
  }
  cap.n++;
  return cap.n > 60;
}

function incomingDamage(c: CombatState): number {
  let sum = 0;
  for (const e of livingEnemies(c)) sum += (e.intent.damage ?? 0) * (e.intent.times ?? 1);
  return sum;
}

function cardOf(inst: CardInstance): ResolvedCard {
  return resolveCard(inst.defId, inst.upgraded);
}

function blockOf(card: ResolvedCard): number {
  return card.effects.reduce((s, e) => (e.type === 'block' ? s + e.amount : s), 0);
}

function damageOf(card: ResolvedCard): number {
  return card.effects.reduce((s, e) => (e.type === 'damage' && e.target !== 'self' ? s + e.amount * (e.times ?? 1) : s), 0);
}

function isStarterBasic(defId: string): boolean {
  return /_(ping|firewall)$/.test(defId);
}

function isJunk(defId: string): boolean {
  const t = getContent().cards.get(defId)?.type;
  return t === 'curse' || t === 'status';
}

// =====================================================================
// НОВИЧОК
// =====================================================================

class NoviceBot implements Bot {
  readonly kind = 'novice' as const;
  private cap = { key: '', n: 0 };
  private rng: BotRng;
  constructor(seed: string) {
    this.rng = new BotRng(seed);
  }

  act(s: RunState): Action {
    const legal = getLegalActions(s);
    const sc = s.screen;
    switch (sc.kind) {
      case 'combat':
        return this.combat(s, legal);
      case 'map':
        return this.rng.pick(legal);
      case 'reward': {
        const i = sc.items.findIndex(() => true);
        return i >= 0 ? { type: 'take_reward', index: i } : { type: 'leave_reward' };
      }
      case 'card_pick':
        if (this.rng.next() < 0.3) return { type: 'pick_card', cardId: null };
        return { type: 'pick_card', cardId: this.rng.pick(sc.cardIds) };
      case 'shop': {
        const buys = legal.filter(
          (a) => a.type === 'shop_buy' && sc.items[a.index]?.kind !== 'remove',
        );
        return buys.length > 0 ? this.rng.pick(buys) : { type: 'leave_shop' };
      }
      case 'rest':
        if (s.hp < s.maxHp * 0.5 || !legal.some((a) => a.type === 'rest_upgrade')) return { type: 'rest_heal' };
        return { type: 'rest_upgrade' };
      case 'event':
        return this.rng.pick(legal);
      case 'select_deck_card': {
        const opts = legal.filter((a) => a.type === 'select_deck_card' && a.cardUid !== null);
        if (opts.length === 0) return { type: 'select_deck_card', cardUid: null };
        if (sc.purpose === 'remove') {
          const junk = s.deck.find((c) => isJunk(c.defId)) ?? s.deck.find((c) => isStarterBasic(c.defId));
          if (junk) return { type: 'select_deck_card', cardUid: junk.uid };
        }
        return this.rng.pick(opts);
      }
      default:
        return legal[0] as Action;
    }
  }

  private combat(s: RunState, legal: Action[]): Action {
    const c = s.combat as CombatState;
    if (playCap(this.cap, s, c)) return { type: 'end_turn' };
    const plays = legal.filter((a): a is Extract<Action, { type: 'play_card' }> => a.type === 'play_card');
    const info = plays.map((a) => {
      const inst = c.hand.find((h) => h.uid === a.cardUid) as CardInstance;
      return { a, card: cardOf(inst) };
    });
    const incoming = incomingDamage(c);
    if (incoming > c.player.block) {
      const blocks = info.filter((x) => blockOf(x.card) > 0).sort((x, y) => blockOf(y.card) - blockOf(x.card));
      if (blocks[0]) return blocks[0].a;
    }
    const alive = livingEnemies(c);
    const minHp = alive.reduce((m, e) => (e.hp < m.hp ? e : m), alive[0] as EnemyState);
    const attacks = info
      .filter((x) => x.card.type === 'attack')
      .filter((x) => x.a.targetUid === undefined || x.a.targetUid === minHp.uid)
      .sort((x, y) => damageOf(y.card) - damageOf(x.card));
    if (attacks[0]) return attacks[0].a;
    const other = info.filter(
      (x) => x.card.type !== 'status' && x.card.type !== 'curse' && blockOf(x.card) === 0 && x.card.type !== 'attack',
    );
    const pick = other.find((x) => x.a.targetUid === undefined || x.a.targetUid === minHp.uid);
    if (pick) return pick.a;
    return { type: 'end_turn' };
  }
}

// =====================================================================
// ОПЫТНЫЙ
// =====================================================================

/** Сколько «очков» стоит единица статуса (для оценки карт вне боя). */
const STATUS_CARD_VALUE: Record<string, number> = {
  vulnerable: 3,
  weak: 3,
  frail: 1,
  strength: 7,
  dexterity: 6,
  virus: 2.2,
  thorns: 4,
  regen: 3,
  ritual: 25,
  plating: 6,
};

function effectValue(e: Effect, cls: RunState['classId'], card: ResolvedCard): number {
  const aoe = (t?: string): number => (t === 'all_enemies' || card.target === 'all_enemies' ? 1.6 : 1);
  switch (e.type) {
    case 'damage':
      if (e.target === 'self') return -e.amount;
      return e.amount * (e.times ?? 1) * aoe(e.target) * (cls === 'netrunner' ? 1.15 : 1) +
        ((e.times ?? 1) > 1 && cls === 'netrunner' ? 2 : 0);
    case 'block':
      return e.amount * (cls === 'ghost' ? 1.0 : 0.8);
    case 'apply_status': {
      let v = (STATUS_CARD_VALUE[e.status] ?? 1) * e.amount;
      if (e.status === 'virus' && cls === 'phreaker') v *= 1.4;
      if (e.status === 'strength' && cls === 'netrunner') v *= 1.4;
      if (e.status === 'dexterity' && cls === 'ghost') v *= 1.4;
      return v * aoe(e.target);
    }
    case 'draw':
      return e.amount * (cls === 'ghost' ? 5 : 4);
    case 'gain_energy':
      return e.amount * 7;
    case 'heal':
      return e.amount * 1.0;
    case 'lose_hp':
      return -e.amount * 1.0;
    case 'add_card': {
      const def = getContent().cards.get(e.cardId);
      if (!def || def.type === 'status' || def.type === 'curse') return -4 * (e.count ?? 1);
      return (e.count ?? 1) * 4.5;
    }
    case 'gain_gold':
      return e.amount * 0.15;
    default:
      return 0;
  }
}

/** Ценность карты на энергию (тир-лист, считается из эффектов). */
export function cardScore(defId: string, upgraded: boolean, cls: RunState['classId']): number {
  const def = getContent().cards.get(defId);
  if (!def) return 0;
  if (def.type === 'curse' || def.type === 'status') return -20;
  const card = resolveCard(defId, upgraded);
  let v = card.effects.reduce((s, e) => s + effectValue(e, cls, card), 0);
  if (card.cost === -1) v *= 3; // X-карта ≈ 3 повтора
  if (card.type === 'power') v *= 1.0;
  if (card.def.ethereal) v *= 0.85;
  if (card.exhaust && card.type !== 'power') v *= 0.8;
  const cost = card.cost === -1 ? 3 : Math.max(0, card.cost);
  // ценность за энергию со смягчением: 0-стоимость не бесконечна
  return v / (cost + 0.6) + (cost === 0 ? 2 : 0);
}

const BASE_ATTACK_SCORE = (cls: RunState['classId']): number => cardScore(`${cls === 'netrunner' ? 'nr' : cls === 'phreaker' ? 'ph' : 'gh'}_ping`, false, cls);

interface PlanStep {
  uid: string;
  targetUid?: string;
}

class ExpertBot implements Bot {
  readonly kind = 'expert' as const;
  private cap = { key: '', n: 0 };
  private rng: BotRng;
  private plan: PlanStep[] = [];
  private planTurn = -1;
  private planFloor = -1;
  constructor(seed: string) {
    this.rng = new BotRng(seed);
  }

  act(s: RunState): Action {
    const sc = s.screen;
    switch (sc.kind) {
      case 'combat':
        return this.combat(s);
      case 'map':
        return this.map(s);
      case 'reward':
        return this.reward(s, sc.items);
      case 'card_pick':
        return { type: 'pick_card', cardId: this.chooseCard(s, sc.cardIds, 0) };
      case 'shop':
        return this.shop(s, sc.items);
      case 'rest':
        return this.rest(s);
      case 'event':
        return this.event(s, sc.eventId);
      case 'select_deck_card':
        return this.selectDeck(s, sc.purpose);
      default:
        return getLegalActions(s)[0] as Action;
    }
  }

  // ---------- колода ----------

  private deckStrength(s: RunState): number {
    // Насколько колода «прокачана»: средняя ценность карт относительно стартовой атаки.
    const base = BASE_ATTACK_SCORE(s.classId);
    const avg = s.deck.reduce((acc, c) => acc + cardScore(c.defId, c.upgraded, s.classId), 0) / Math.max(1, s.deck.length);
    return avg / base;
  }

  /** Нужда в типах карт: AoE, блок, атака — для коррекции оценки. */
  private needAdjust(s: RunState, defId: string): number {
    const card = resolveCard(defId, false);
    const deck = s.deck.map((c) => cardOf(c));
    const blockCards = deck.filter((c) => blockOf(c) > 0).length;
    const aoeCards = deck.filter((c) => c.target === 'all_enemies' || c.effects.some((e) => 'target' in e && e.target === 'all_enemies')).length;
    const powers = deck.filter((c) => c.type === 'power').length;
    let adj = 0;
    const isAoe = card.target === 'all_enemies' || card.effects.some((e) => 'target' in e && e.target === 'all_enemies');
    if (isAoe && aoeCards < 2) adj += 3;
    if (blockOf(card) > 0 && blockCards < 5) adj += 1.5;
    if (card.type === 'power' && powers >= 3) adj -= 4;
    if (s.act >= 2 && card.effects.some((e) => e.type === 'heal')) adj -= 2;
    return adj;
  }

  private chooseCard(s: RunState, ids: readonly string[], minBonus: number): string | null {
    let best: string | null = null;
    let bestV = -Infinity;
    for (const id of ids) {
      const v = cardScore(id, false, s.classId) + this.needAdjust(s, id);
      if (v > bestV) {
        bestV = v;
        best = id;
      }
    }
    // Порог: колода должна оставаться компактной.
    const base = BASE_ATTACK_SCORE(s.classId);
    const sizePenalty = Math.max(0, s.deck.length - 14) * 0.35;
    const threshold = base * 1.05 + sizePenalty + minBonus;
    return bestV >= threshold ? best : null;
  }

  private worstCard(s: RunState): CardInstance | undefined {
    let worst: CardInstance | undefined;
    let wv = Infinity;
    const blockCount = s.deck.filter((c) => blockOf(cardOf(c)) > 0).length;
    for (const c of s.deck) {
      let v = cardScore(c.defId, c.upgraded, s.classId);
      if (isStarterBasic(c.defId)) {
        v -= 3;
        // не оставлять колоду без блока
        if (/_firewall$/.test(c.defId) && blockCount <= 3) v += 10;
        if (/_firewall$/.test(c.defId)) v += 0.5;
      }
      if (v < wv) {
        wv = v;
        worst = c;
      }
    }
    return worst;
  }

  private bestUpgrade(s: RunState): CardInstance | undefined {
    let best: CardInstance | undefined;
    let bv = -Infinity;
    for (const c of s.deck) {
      if (!canUpgrade(c.defId, c.upgraded)) continue;
      const gain = cardScore(c.defId, true, s.classId) - cardScore(c.defId, false, s.classId);
      const v = gain + (isStarterBasic(c.defId) ? -1 : 0);
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    return best;
  }

  private selectDeck(s: RunState, purpose: 'remove' | 'upgrade'): Action {
    const c = purpose === 'upgrade' ? this.bestUpgrade(s) : this.worstCard(s);
    return { type: 'select_deck_card', cardUid: c?.uid ?? null };
  }

  // ---------- экраны вне боя ----------

  private reward(s: RunState, items: Extract<RunState['screen'], { kind: 'reward' }>['items']): Action {
    // pick_card(null) тоже снимает выбор карт с экрана, поэтому просто берём всё по очереди.
    void s;
    return items.length > 0 ? { type: 'take_reward', index: 0 } : { type: 'leave_reward' };
  }

  private relicValue(id: string): number {
    const r = getContent().relics.get(id);
    if (!r) return 0;
    if (id === 'r_unstable_reactor') return 6;
    if (id === 'r_laundry_script' || id === 'r_anon_wallet') return 2;
    return { common: 5, uncommon: 7, rare: 9, boss: 10, shop: 6, starter: 0 }[r.rarity];
  }

  private shop(s: RunState, items: ShopItem[]): Action {
    const legal = new Set(
      getLegalActions(s).flatMap((a) => (a.type === 'shop_buy' ? [a.index] : [])),
    );
    // 1) удаление стартовой карты/проклятия
    const removeIdx = items.findIndex((it, i) => it.kind === 'remove' && legal.has(i));
    if (removeIdx >= 0) {
      const w = this.worstCard(s);
      if (w && (isStarterBasic(w.defId) || isJunk(w.defId)) && s.deck.length > 8) return { type: 'shop_buy', index: removeIdx };
    }
    // 2) лучшее по соотношению ценность/цена
    let best = -1;
    let bestV = 0;
    items.forEach((it, i) => {
      if (!legal.has(i) || it.kind === 'remove' || !it.id) return;
      let v: number;
      if (it.kind === 'relic') v = this.relicValue(it.id) * 2.2;
      else {
        if (this.chooseCard(s, [it.id], 1.5) === null) return;
        v = cardScore(it.id, false, s.classId) + this.needAdjust(s, it.id);
      }
      const ratio = v / it.price;
      if (ratio > bestV) {
        bestV = ratio;
        best = i;
      }
    });
    if (best >= 0) return { type: 'shop_buy', index: best };
    return { type: 'leave_shop' };
  }

  private rest(s: RunState): Action {
    const legal = getLegalActions(s);
    const canUp = legal.some((a) => a.type === 'rest_upgrade');
    const node = s.map.find((n) => n.id === s.currentNodeId);
    const beforeBoss = node?.row === 14;
    const ratio = s.hp / s.maxHp;
    if (!canUp || ratio < 0.5 || (beforeBoss && ratio < 0.72)) return { type: 'rest_heal' };
    return { type: 'rest_upgrade' };
  }

  private event(s: RunState, eventId: string): Action {
    const def = getContent().events.get(eventId);
    const legal = getLegalActions(s).flatMap((a) => (a.type === 'event_choice' ? [a.index] : []));
    if (!def) return { type: 'event_choice', index: legal[0] ?? 0 };
    const ratio = s.hp / s.maxHp;
    let best = legal[0] ?? 0;
    let bv = -Infinity;
    for (const i of legal) {
      const o = def.options[i];
      if (!o) continue;
      let v = 0;
      let hpLoss = 0;
      for (const e of o.effects) {
        if (e.type === 'gain_gold') v += e.amount * 0.12;
        if (e.type === 'lose_hp' || e.type === 'damage') hpLoss += e.amount;
        if (e.type === 'heal') v += Math.min(e.amount, s.maxHp - s.hp) * 0.6;
        if (e.type === 'add_card') v += isJunk(e.cardId) ? -14 : 4;
      }
      if (hpLoss >= s.hp) continue;
      v -= hpLoss * (0.4 + (1 - ratio) * 1.6);
      if (o.special === 'random_relic') v += 14;
      if (o.special === 'random_card') v += 3;
      if (o.special === 'remove_card') v += 9;
      if (o.special === 'upgrade_card') v += 7;
      if (o.special === 'fight') v -= ratio > 0.6 ? 2 : 12;
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    return { type: 'event_choice', index: best };
  }

  private map(s: RunState): Action {
    const legal = getLegalActions(s).flatMap((a) => (a.type === 'choose_node' ? [a.nodeId] : []));
    const byId = new Map(s.map.map((n) => [n.id, n] as const));
    const ratio = s.hp / s.maxHp;
    const strong = this.deckStrength(s) > 1.15 && ratio > 0.6;
    const nodeValue = (n: MapNode, depth: number): number => {
      // чем дальше узел, тем менее точна оценка HP
      const r = Math.min(1, ratio + depth * 0.02);
      switch (n.kind) {
        case 'combat':
          return r > 0.4 ? 1.2 : 0.2;
        case 'elite':
          return strong && depth < 4 ? 3 : s.act === 1 && r > 0.75 ? 1 : -4 - (1 - r) * 6;
        case 'rest':
          return r < 0.55 ? 5 : 2;
        case 'shop':
          return s.gold >= 140 ? 3 : s.gold >= 80 ? 1.2 : 0.2;
        case 'event':
          return 1.4;
        case 'treasure':
          return 3;
        default:
          return 0;
      }
    };
    const memo = new Map<string, number>();
    const bestFrom = (id: string, depth: number): number => {
      const key = `${id}:${depth}`;
      const m = memo.get(key);
      if (m !== undefined) return m;
      const n = byId.get(id);
      if (!n || n.kind === 'boss') return 0;
      let next = 0;
      if (n.next.length > 0) next = Math.max(...n.next.map((x) => bestFrom(x, depth + 1)));
      const v = nodeValue(n, depth) + next * 0.92;
      memo.set(key, v);
      return v;
    };
    let best = legal[0] as string;
    let bv = -Infinity;
    for (const id of legal) {
      const v = bestFrom(id, 0) + this.rng.next() * 0.01;
      if (v > bv) {
        bv = v;
        best = id;
      }
    }
    return { type: 'choose_node', nodeId: best };
  }

  // ---------- бой ----------

  private combat(s: RunState): Action {
    const c = s.combat as CombatState;
    if (playCap(this.cap, s, c)) return { type: 'end_turn' };
    // Исполняем сохранённый план, пока он валиден.
    if (this.planTurn === c.turn && this.planFloor === s.floor && this.plan.length > 0) {
      const step = this.plan[0] as PlanStep;
      const inst = c.hand.find((h) => h.uid === step.uid);
      const targetOk = step.targetUid === undefined || c.enemies.some((e) => e.uid === step.targetUid && e.hp > 0);
      if (inst && targetOk && isPlayable(c, cardOf(inst))) {
        this.plan.shift();
        return { type: 'play_card', cardUid: step.uid, ...(step.targetUid ? { targetUid: step.targetUid } : {}) };
      }
    }
    this.plan = this.search(s);
    this.planTurn = c.turn;
    this.planFloor = s.floor;
    const step = this.plan.shift();
    if (!step) return { type: 'end_turn' };
    return { type: 'play_card', cardUid: step.uid, ...(step.targetUid ? { targetUid: step.targetUid } : {}) };
  }

  /** Перебор последовательностей розыгрыша текущей руки (DFS + транспозиции, лимит узлов). */
  private search(s: RunState): PlanStep[] {
    const mods = getAscensionMods(s.ascension);
    const root = cloneSim(s);
    const rootEnemyHp = new Map(root.combat!.enemies.map((e) => [e.uid, e.hp] as const));
    const ctxBase = { mods, rootEnemyHp, startHp: s.combat!.player.hp, maxHp: s.maxHp, runHpRatio: s.hp / s.maxHp };
    let bestScore = -Infinity;
    let bestPlan: PlanStep[] = [];
    let nodes = 0;
    const LIMIT = 260;
    const seen = new Set<string>();

    const dfs = (st: RunState, plan: PlanStep[], stop: boolean, bonus: number): void => {
      nodes++;
      const score = evaluate(st, ctxBase) + bonus;
      if (score > bestScore) {
        bestScore = score;
        bestPlan = plan;
      }
      const c = st.combat!;
      if (stop || c.phase !== 'player' || nodes >= LIMIT) return;
      const alive = livingEnemies(c);
      const tried = new Set<string>();
      // упорядочиваем: силы и дебаффы раньше, затем атаки
      const cand: { inst: CardInstance; card: ResolvedCard; target?: string; prio: number }[] = [];
      for (const inst of c.hand) {
        const card = cardOf(inst);
        if (!isPlayable(c, card) || card.type === 'curse') continue;
        if (card.cost === -1 && c.energy === 0) continue;
        const key = `${inst.defId}:${inst.upgraded}`;
        const targets = needsEnemyTarget(card) ? alive.map((e) => e.uid) : [undefined];
        for (const t of targets) {
          const k2 = `${key}>${t ?? ''}`;
          if (tried.has(k2)) continue;
          tried.add(k2);
          cand.push({ inst, card, ...(t ? { target: t } : {}), prio: card.type === 'power' ? 0 : card.type === 'skill' ? 1 : 2 });
        }
      }
      cand.sort((a, b) => a.prio - b.prio);
      for (const x of cand) {
        if (nodes >= LIMIT) return;
        const next = cloneSim(st);
        const ctx: CombatCtx = { s: next, c: next.combat!, ev: [], mods };
        const before = next.combat!.hand.length;
        try {
          playCard(ctx, x.inst.uid, x.target);
        } catch {
          continue;
        }
        const drawn = next.combat!.hand.length - before + 1;
        const drew = x.card.effects.some((e) => e.type === 'draw') && drawn > 0;
        const sig = signature(next);
        if (seen.has(sig)) continue;
        seen.add(sig);
        // Добор: новые карты ещё не видны — останавливаем ветку с бонусом за ожидаемую ценность
        // добранных карт (выше, если осталась энергия их разыграть), после розыгрыша перепланируем.
        const e = next.combat!.energy;
        const drawBonus = drew ? drawn * (e >= 2 ? 7 : e === 1 ? 5 : 2.5) : 0;
        dfs(
          next,
          [...plan, { uid: x.inst.uid, ...(x.target ? { targetUid: x.target } : {}) }],
          drew || x.card.target === 'random_enemy',
          bonus + drawBonus,
        );
      }
    };
    dfs(root, [], false, 0);
    // План исполняется до первой карты добора/случайной цели, затем перепланирование.
    return bestPlan;
  }
}

// ---------- симуляция хода для оценки ----------

function cloneCombat(c: CombatState): CombatState {
  return {
    ...c,
    hand: c.hand.slice(),
    drawPile: c.drawPile.slice(),
    discardPile: c.discardPile.slice(),
    exhaustPile: c.exhaustPile.slice(),
    player: { ...c.player, statuses: { ...c.player.statuses } },
    enemies: c.enemies.map((e) => ({
      ...e,
      statuses: { ...e.statuses },
      intent: { ...e.intent },
      moveHistory: e.moveHistory.slice(),
    })),
    counters: { ...c.counters },
  };
}

function cloneSim(s: RunState): RunState {
  return {
    ...s,
    rng: { ...s.rng },
    stats: { ...s.stats },
    combat: s.combat ? cloneCombat(s.combat) : null,
  };
}

function signature(s: RunState): string {
  const c = s.combat!;
  const hand = c.hand.map((h) => h.uid).sort().join(',');
  const en = c.enemies.map((e) => `${e.hp}/${e.block}/${JSON.stringify(e.statuses)}`).join(';');
  return `${c.energy}|${hand}|${c.player.block}|${JSON.stringify(c.player.statuses)}|${en}`;
}

interface EvalCtx {
  mods: ReturnType<typeof getAscensionMods>;
  rootEnemyHp: Map<string, number>;
  startHp: number;
  maxHp: number;
  runHpRatio: number;
}

const PERSIST: Record<string, number> = { strength: 5, dexterity: 4, plating: 3.5, thorns: 1.5, ritual: 14, regen: 0.8 };

function evaluate(st: RunState, ec: EvalCtx): number {
  const c0 = st.combat!;
  if (c0.phase === 'won') return 1e6 + c0.player.hp * 10;
  // Симулируем конец хода и ход врагов на копии.
  const sim = cloneSim(st);
  const ctx: CombatCtx = { s: sim, c: sim.combat!, ev: [], mods: ec.mods };
  endTurn(ctx);
  const c = sim.combat!;
  const hpAfter = c.player.hp;
  if (c.phase === 'lost' || hpAfter <= 0) return -1e6 + enemyProgress(c, ec) * 10;
  if (c.phase === 'won') return 1e6 + hpAfter * 10;
  const lost = ec.startHp - hpAfter;
  const lowHp = 1 - hpAfter / ec.maxHp;
  const wHp = 1.3 + lowHp * 2.5;
  let score = -lost * wHp + enemyProgress(c, ec);
  for (const [k, v] of Object.entries(c.player.statuses)) {
    if (PERSIST[k] !== undefined && v > 0) score += PERSIST[k] * v;
    if ((k === 'weak' || k === 'frail' || k === 'vulnerable') && v > 0) score -= 2 * v;
  }
  // энергию на следующий ход не переносим; неиспользованный блок бесполезен — учтено через hp
  return score;
}

function enemyProgress(c: CombatState, ec: EvalCtx): number {
  let v = 0;
  for (const e of c.enemies) {
    const start = ec.rootEnemyHp.get(e.uid) ?? e.maxHp;
    const dealt = start - e.hp;
    const threat = (e.intent.damage ?? 0) * (e.intent.times ?? 1);
    if (e.hp <= 0) {
      v += dealt + 12 + threat * 1.5;
      continue;
    }
    v += dealt * (1 + Math.min(1.5, threat / 15) * 0.3);
    const vir = getStatus(e, 'virus');
    if (vir > 0) v += Math.min(e.hp, (vir * (vir + 1)) / 2) * 0.75;
    v += getStatus(e, 'vulnerable') * 2.5 + getStatus(e, 'weak') * 2 * Math.min(1, threat / 10 + 0.3);
    v -= getStatus(e, 'strength') * 2;
  }
  return v;
}
