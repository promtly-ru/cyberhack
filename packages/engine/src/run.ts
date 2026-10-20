/**
 * Забег: newRun, applyAction, getLegalActions, replay.
 * applyAction — чистая функция: клонирует вход и мутирует только клон.
 */
import { applyDifficulty, clampAscension, getAscensionMods, type AscensionMods } from './ascension';
import { canUpgrade, needsEnemyTarget, resolveCard } from './cards';
import {
  canCool,
  coolDown,
  endTurn,
  isPlayable,
  livingEnemies,
  playCard,
  startCombat,
  triggerRelics,
  usePotionInCombat,
  type CombatCtx,
} from './combat';
import { getContent } from './content';
import { generateMap } from './map';
import { applyMutators, getMutatorMods, normalizeMutators, ZERO_DAY_RULE_ID } from './mutators';
import { weeklyMutatorIds } from './weekly';
import { addPotion, gainPotions, getPotion, hasFreePotionSlot, potionsOf } from './potions';
import { buildCombatRewards, buildShop, refreshShop, rollRelic, rewardCardPool, MAX_SHOP_REFRESHES, type CombatTier } from './rewards';
import { createRngStore, rngOf } from './rng';
import { computeScore } from './score';
import {
  InvalidActionError,
  SAVE_VERSION,
  type Action,
  type ActionResult,
  type CardInstance,
  type Effect,
  type EventOption,
  type EventRequires,
  type EventResult,
  type GameEvent,
  type MapNode,
  type NewRunOptions,
  type RelicTrigger,
  type RunState,
  type Screen,
} from './types';
import { lockedContent } from './unlocks';
import { makeCard } from './util';

/** Итоговые модификаторы: Ascension → режим сложности → мутаторы забега. */
export function modsOf(s: Pick<RunState, 'ascension' | 'difficulty' | 'mutators'>): AscensionMods {
  return applyMutators(applyDifficulty(getAscensionMods(s.ascension), s.difficulty), s.mutators);
}

function invalid(msg: string): never {
  throw new InvalidActionError(msg);
}

// ---------- создание забега ----------

export function newRun(opts: NewRunOptions): RunState {
  const content = getContent();
  const cls = content.classes.get(opts.classId);
  if (!cls) throw new Error(`Unknown class id: ${opts.classId}`);
  const ascension = clampAscension(opts.ascension);
  // Еженедельный вызов: мутаторы и правило недели выводятся из id недели (одинаковы для всех)
  const mutators = opts.weekly ? weeklyMutatorIds(opts.weekly) : normalizeMutators(opts.mutators);
  if (opts.difficulty === 'zero_day' && !opts.weekly) mutators.push(ZERO_DAY_RULE_ID);
  const mods = modsOf({ ascension, ...(opts.difficulty ? { difficulty: opts.difficulty } : {}), mutators });
  const maxHp = Math.max(1, cls.maxHp - Math.floor(cls.maxHp * mods.maxHpPenaltyPct));

  const s: RunState = {
    version: SAVE_VERSION,
    seed: opts.seed,
    classId: opts.classId,
    ascension,
    ...(opts.difficulty && opts.difficulty !== 'normal' ? { difficulty: opts.difficulty } : {}),
    ...(mutators.length > 0 ? { mutators } : {}),
    ...(opts.weekly ? { weekly: opts.weekly } : {}),
    ...(opts.heat ? { heat: true } : {}),
    act: 1,
    floor: 0,
    hp: Math.max(1, Math.floor(maxHp * mods.startHpPct)),
    maxHp,
    gold: cls.startingGold,
    deck: [],
    relics: [],
    firmwares: [],
    map: [],
    currentNodeId: null,
    visited: [],
    screen: { kind: 'map' },
    combat: null,
    rng: createRngStore(opts.seed),
    uidCounter: 0,
    status: 'active',
    score: 0,
    stats: { enemiesKilled: 0, elitesKilled: 0, bossesKilled: 0, damageDealt: 0, cardsPlayed: 0 },
  };

  if (opts.unlocked) s.locked = lockedContent(opts.unlocked);
  s.stats.maxGold = s.gold;

  for (const id of cls.startingDeck) {
    if (!content.cards.has(id)) throw new Error(`Unknown card id in starting deck: ${id}`);
    s.deck.push(makeCard(s, id));
  }
  if (mods.curseInDeck) {
    const curses = content.data.cards.filter((c) => c.type === 'curse');
    if (curses.length > 0) s.deck.push(makeCard(s, rngOf(s, 'cards').pick(curses).id));
  }

  const ev: GameEvent[] = [];
  if (content.relics.has(cls.startingRelic)) obtainRelic(s, cls.startingRelic, ev);
  if (getMutatorMods(mutators).bonusStartRelic) {
    const pool = content.data.relics.filter(
      (r) => (r.rarity === 'common' || r.rarity === 'uncommon') && (r.classId === 'neutral' || r.classId === opts.classId) && !s.relics.includes(r.id),
    );
    if (pool.length > 0) obtainRelic(s, rngOf(s, 'cards').pick(pool).id, ev);
  }
  startAct(s, 1, ev);
  s.score = computeScore(s);
  return s;
}

/** Последний акт = максимальный акт среди боссов контента. */
function finalAct(): number {
  let m = 1;
  for (const e of getContent().data.encounters) if (e.tier === 'boss' && e.act > m) m = e.act;
  return m;
}

function startAct(s: RunState, act: 1 | 2 | 3 | 4, ev: GameEvent[]): void {
  s.act = act;
  s.map = generateMap(act, rngOf(s, 'map'), modsOf(s).eliteWeightMult);
  s.currentNodeId = null;
  const bosses = getContent().data.encounters.filter((e) => e.tier === 'boss' && e.act === act);
  if (bosses.length > 0) s.bossEncounterId = rngOf(s, 'map').pick(bosses).id;
  else delete s.bossEncounterId;
  ev.push({ type: 'act_started', act });
  s.screen = { kind: 'map' };
}

// ---------- карта ----------

export function currentNode(s: RunState): MapNode | undefined {
  return s.currentNodeId === null ? undefined : s.map.find((n) => n.id === s.currentNodeId);
}

export function availableNodes(s: RunState): MapNode[] {
  if (s.currentNodeId === null) return s.map.filter((n) => n.row === 0);
  const cur = currentNode(s);
  if (!cur) return [];
  return cur.next.map((id) => s.map.find((n) => n.id === id)).filter((n): n is MapNode => !!n);
}

function enterNode(s: RunState, node: MapNode, ev: GameEvent[]): void {
  s.currentNodeId = node.id;
  s.visited.push(node.id);
  s.floor += 1;
  switch (node.kind) {
    case 'combat':
      startEncounter(s, 'normal', ev);
      return;
    case 'elite':
      startEncounter(s, 'elite', ev);
      return;
    case 'boss':
      startEncounter(s, 'boss', ev);
      return;
    case 'ambush':
      startEncounter(s, 'normal', ev, true);
      return;
    case 'lab':
      s.screen = { kind: 'lab' };
      return;
    case 'blackbox':
      s.screen = { kind: 'blackbox' };
      return;
    case 'relay':
      s.screen = { kind: 'relay' };
      return;
    case 'event':
      enterEvent(s, ev);
      return;
    case 'shop':
      s.screen = { kind: 'shop', items: buildShop(s, rngOf(s, 'shop'), modsOf(s)) };
      return;
    case 'rest':
      s.screen = { kind: 'rest' };
      return;
    case 'treasure': {
      const relicId = rollRelic(s, rngOf(s, 'rewards'));
      s.screen = {
        kind: 'reward',
        items: relicId
          ? [{ kind: 'relic', relicId }]
          : [{ kind: 'gold', amount: rngOf(s, 'rewards').int(25, 35) }],
      };
      return;
    }
  }
}

// ---------- бой ----------

function pickEncounterEnemies(s: RunState, tier: CombatTier, hard = false): string[] {
  const content = getContent();
  if (tier === 'boss' && s.bossEncounterId) {
    const enc = content.encounters.get(s.bossEncounterId);
    if (enc) return enc.enemies;
  }
  const rng = rngOf(s, 'map');
  const all = content.data.encounters;
  let pool = all.filter((e) => e.act === s.act && e.tier === tier);
  if (tier === 'normal' && pool.length > 0) {
    const fought = s.map.filter(
      (n) => n.kind === 'combat' && n.id !== s.currentNodeId && s.visited.includes(n.id),
    ).length;
    const early = pool.filter((e) => e.early);
    const late = pool.filter((e) => !e.early);
    if (hard && late.length > 0) pool = late;
    else if (fought < 3 && early.length > 0) pool = early;
    else if (fought >= 3 && late.length > 0) pool = late;
  }
  if (pool.length === 0) pool = all.filter((e) => e.tier === tier);
  if (pool.length > 0) return rng.pick(pool).enemies;

  // Фолбэк, если встреч нет: один враг нужного уровня.
  const enemies = content.data.enemies;
  let ep = enemies.filter((e) => e.tier === tier && e.act === s.act);
  if (ep.length === 0) ep = enemies.filter((e) => e.tier === tier);
  if (ep.length === 0) ep = [...enemies];
  if (ep.length === 0) throw new Error('Content has no enemies');
  return [rng.pick(ep).id];
}

function startEncounter(s: RunState, tier: CombatTier, ev: GameEvent[], hard = false): void {
  const enemyIds = pickEncounterEnemies(s, tier, hard);
  s.screen = { kind: 'combat' };
  const ctx = startCombat(s, enemyIds, ev, modsOf(s));
  afterCombatStep(s, ctx, ev);
}

function combatTier(ctx: CombatCtx): CombatTier {
  const enemies = getContent().enemies;
  const tiers = ctx.c.enemies.map((e) => enemies.get(e.defId)?.tier ?? 'normal');
  if (tiers.includes('boss')) return 'boss';
  if (tiers.includes('elite')) return 'elite';
  return 'normal';
}

function afterCombatStep(s: RunState, ctx: CombatCtx, ev: GameEvent[]): void {
  s.hp = ctx.c.player.hp;
  s.maxHp = ctx.c.player.maxHp;
  if (ctx.c.phase === 'won') onCombatWon(s, ctx, ev);
  else if (ctx.c.phase === 'lost') {
    ev.push({ type: 'combat_lost' });
    defeat(s);
  }
}

function onCombatWon(s: RunState, ctx: CombatCtx, ev: GameEvent[]): void {
  triggerRelics(ctx, 'combat_end', true);
  s.hp = Math.min(ctx.c.player.hp, s.maxHp);
  ev.push({ type: 'combat_won' });
  const tier = combatTier(ctx);
  if (tier === 'elite') s.stats.elitesKilled += 1;
  if (tier === 'boss') s.stats.bossesKilled += 1;
  s.combat = null;
  if (tier === 'boss' && s.act >= finalAct()) {
    s.status = 'won';
    s.screen = { kind: 'game_over', victory: true };
    return;
  }
  const ambush = currentNode(s)?.kind === 'ambush' && tier === 'normal';
  s.screen = { kind: 'reward', items: buildCombatRewards(s, tier, modsOf(s), ambush) };
}

function defeat(s: RunState): void {
  s.hp = 0;
  s.status = 'lost';
  s.screen = { kind: 'game_over', victory: false };
}

function combatCtx(s: RunState, ev: GameEvent[]): CombatCtx {
  if (s.screen.kind !== 'combat' || !s.combat || s.combat.phase !== 'player') invalid('Not in combat');
  return { s, c: s.combat, ev, mods: modsOf(s) };
}

// ---------- вне боя ----------

function addCardToDeck(s: RunState, defId: string, ev: GameEvent[], upgraded = false): void {
  if (!getContent().cards.has(defId)) throw new Error(`Unknown card id: ${defId}`);
  s.deck.push(makeCard(s, defId, upgraded));
  ev.push({ type: 'card_obtained', defId });
}

function obtainRelic(s: RunState, relicId: string, ev: GameEvent[]): void {
  const def = getContent().relics.get(relicId);
  if (!def) throw new Error(`Unknown relic id: ${relicId}`);
  s.relics.push(relicId);
  ev.push({ type: 'relic_obtained', relicId });
  if (def.trigger === 'pickup') {
    ev.push({ type: 'relic_triggered', relicId });
    applyOutOfCombatEffects(s, def.effects, ev);
  }
}

function triggerOutOfCombatRelics(s: RunState, trigger: RelicTrigger, ev: GameEvent[]): void {
  const relics = getContent().relics;
  for (const id of s.relics) {
    const def = relics.get(id);
    if (!def || def.trigger !== trigger) continue;
    ev.push({ type: 'relic_triggered', relicId: id });
    applyOutOfCombatEffects(s, def.effects, ev);
  }
}

function healRun(s: RunState, amount: number, ev: GameEvent[]): void {
  const healed = Math.max(0, Math.min(s.maxHp - s.hp, Math.floor(amount)));
  s.hp += healed;
  ev.push({ type: 'heal', targetUid: 'player', amount: healed });
}

function applyOutOfCombatEffect(s: RunState, eff: Effect, ev: GameEvent[]): void {
  switch (eff.type) {
    case 'heal':
      healRun(s, eff.amount, ev);
      return;
    case 'lose_hp':
    case 'damage': {
      if (eff.type === 'damage' && eff.target && eff.target !== 'self' && eff.target !== 'none') return;
      const amount = Math.max(0, eff.amount * (eff.type === 'damage' ? (eff.times ?? 1) : 1));
      s.hp = Math.max(0, s.hp - amount);
      ev.push({ type: 'damage', targetUid: 'player', amount, blocked: 0 });
      return;
    }
    case 'gain_gold':
      s.gold = Math.max(0, s.gold + eff.amount);
      return;
    case 'add_card':
      for (let i = 0; i < (eff.count ?? 1); i++) addCardToDeck(s, eff.cardId, ev);
      return;
    case 'heal_pct':
      healRun(s, (s.maxHp * eff.amount) / 100, ev);
      return;
    case 'gain_max_hp': {
      const amt = Math.max(0, Math.floor(eff.amount));
      s.maxHp += amt;
      healRun(s, amt, ev);
      return;
    }
    case 'gain_potion':
      gainPotions(s, eff.amount, eff.potionId, ev);
      return;
    default:
      return; // блок, статусы, добор, энергия вне боя не действуют
  }
}

function applyOutOfCombatEffects(s: RunState, effects: readonly Effect[], ev: GameEvent[]): void {
  for (const eff of effects) {
    applyOutOfCombatEffect(s, eff, ev);
    if (s.hp <= 0) return;
  }
}

function upgradableCards(s: RunState): CardInstance[] {
  return s.deck.filter((c) => canUpgrade(c.defId, c.upgraded));
}

/** Улучшение: игроку предлагают случайные 3 карты (или меньше, если их меньше). */
const UPGRADE_OFFER_SIZE = 3;
function upgradeScreen(s: RunState): Screen {
  const pool = upgradableCards(s);
  const offer = rngOf(s, 'cards').shuffle([...pool]).slice(0, UPGRADE_OFFER_SIZE).map((c) => c.uid);
  return { kind: 'select_deck_card', purpose: 'upgrade', returnTo: 'map', offer };
}

function enterEvent(s: RunState, ev: GameEvent[]): void {
  const flags = s.flags ?? [];
  const events = getContent().data.events.filter(
    (e) =>
      (e.act === undefined || e.act === s.act) &&
      e.options.length > 0 &&
      (!e.requiresFlag || flags.includes(e.requiresFlag)) &&
      (!e.excludesFlag || !flags.includes(e.excludesFlag)),
  );
  const seen = s.seenEvents ?? [];
  const fresh = events.filter((e) => !seen.includes(e.id));
  const pool = fresh.length > 0 ? fresh : events;
  if (pool.length === 0) {
    startEncounter(s, 'normal', ev); // контента событий нет — обычный бой
    return;
  }
  const picked = rngOf(s, 'events').pick(pool);
  s.seenEvents = [...seen, picked.id];
  s.screen = { kind: 'event', eventId: picked.id };
}

function eventOptionCost(opt: EventOption): number {
  return opt.effects.reduce((sum, e) => (e.type === 'gain_gold' && e.amount < 0 ? sum - e.amount : sum), 0);
}

/** Выполнены ли условия варианта события. */
export function meetsRequires(s: RunState, r: EventRequires | undefined): boolean {
  if (!r) return true;
  if (r.gold !== undefined && s.gold < r.gold) return false;
  if (r.hp !== undefined && s.hp <= r.hp) return false;
  if (r.potion && potionsOf(s).length === 0) return false;
  if (r.cardType && !s.deck.some((c) => resolveCard(c.defId, c.upgraded).type === r.cardType)) return false;
  if (r.upgradable && upgradableCards(s).length === 0) return false;
  if (r.flag && !(s.flags ?? []).includes(r.flag)) return false;
  if (r.noFlag && (s.flags ?? []).includes(r.noFlag)) return false;
  return true;
}

/** Индексы доступных вариантов; если недоступно ничего — смягчаем условия (без тупиков). */
function legalEventOptions(s: RunState, eventId: string): number[] {
  const def = getContent().events.get(eventId);
  if (!def) return [];
  const idx = (f: (o: EventOption) => boolean) => def.options.map((o, i) => (f(o) ? i : -1)).filter((i) => i >= 0);
  const full = idx((o) => s.gold >= eventOptionCost(o) && meetsRequires(s, o.requires));
  if (full.length > 0) return full;
  const noGold = idx((o) => meetsRequires(s, o.requires));
  return noGold.length > 0 ? noGold : def.options.map((_, i) => i);
}

function goToMap(s: RunState): void {
  s.screen = { kind: 'map' };
}

function returnFromDeckSelect(s: RunState, returnTo: 'map' | 'shop'): void {
  if (returnTo === 'shop' && s.savedShop) {
    s.screen = { kind: 'shop', items: s.savedShop };
    delete s.savedShop;
  } else goToMap(s);
}

// ---------- applyAction ----------

export function applyAction(state: RunState, action: Action): ActionResult {
  const s = structuredClone(state);
  const ev: GameEvent[] = [];
  if (s.status !== 'active') invalid('Run is over');
  if (!action || typeof action !== 'object') invalid('Malformed action');
  const prevScreen = s.screen.kind;
  const prevGold = s.gold;

  switch (action.type) {
    case 'choose_node': {
      if (s.screen.kind !== 'map') invalid('choose_node is only allowed on the map');
      const node = availableNodes(s).find((n) => n.id === action.nodeId);
      if (!node) invalid(`Node ${action.nodeId} is not reachable`);
      delete s.eventResult;
      enterNode(s, node, ev);
      break;
    }
    case 'play_card': {
      const ctx = combatCtx(s, ev);
      playCard(ctx, action.cardUid, action.targetUid);
      afterCombatStep(s, ctx, ev);
      break;
    }
    case 'end_turn': {
      const ctx = combatCtx(s, ev);
      endTurn(ctx);
      afterCombatStep(s, ctx, ev);
      break;
    }
    case 'cool': {
      const ctx = combatCtx(s, ev);
      coolDown(ctx);
      afterCombatStep(s, ctx, ev);
      break;
    }
    case 'take_reward': {
      if (s.screen.kind !== 'reward') invalid('Not on reward screen');
      const items = s.screen.items;
      const item = items[action.index];
      if (!item) invalid(`No reward at index ${action.index}`);
      if (item.kind === 'gold') {
        s.gold += item.amount;
        items.splice(action.index, 1);
      } else if (item.kind === 'firmware') {
        items.splice(action.index, 1);
        (s.firmwares ??= []).push(item.firmwareId);
        ev.push({ type: 'firmware_obtained', firmwareId: item.firmwareId });
      } else if (item.kind === 'relic') {
        items.splice(action.index, 1);
        obtainRelic(s, item.relicId, ev);
      } else if (item.kind === 'potion') {
        if (!hasFreePotionSlot(s)) invalid('No free potion slot');
        items.splice(action.index, 1);
        addPotion(s, item.potionId, ev);
      } else {
        s.pendingRewards = items;
        s.screen = { kind: 'card_pick', cardIds: item.cardIds, rewardIndex: action.index };
      }
      if (s.hp <= 0) defeat(s);
      break;
    }
    case 'pick_card': {
      if (s.screen.kind !== 'card_pick') invalid('Not on card pick screen');
      const { cardIds, rewardIndex } = s.screen;
      if (action.cardId !== null && !cardIds.includes(action.cardId)) invalid(`Card ${action.cardId} is not offered`);
      if (action.cardId !== null) addCardToDeck(s, action.cardId, ev);
      const items = s.pendingRewards ?? [];
      items.splice(rewardIndex, 1);
      delete s.pendingRewards;
      s.screen = { kind: 'reward', items };
      break;
    }
    case 'leave_reward': {
      if (s.screen.kind !== 'reward') invalid('Not on reward screen');
      if (currentNode(s)?.kind === 'boss' && s.act < finalAct()) {
        healRun(s, (s.maxHp - s.hp) * modsOf(s).actHealPct, ev);
        startAct(s, (s.act + 1) as 2 | 3 | 4, ev);
      } else goToMap(s);
      break;
    }
    case 'shop_buy': {
      if (s.screen.kind !== 'shop') invalid('Not in shop');
      const items = s.screen.items;
      const item = items[action.index];
      if (!item || item.sold) invalid(`Shop item ${action.index} is not available`);
      if (s.gold < item.price) invalid('Not enough gold');
      if (item.kind === 'card' && item.id) {
        s.gold -= item.price;
        item.sold = true;
        addCardToDeck(s, item.id, ev);
      } else if (item.kind === 'relic' && item.id) {
        s.gold -= item.price;
        item.sold = true;
        obtainRelic(s, item.id, ev);
        if (s.hp <= 0) defeat(s);
      } else if (item.kind === 'potion' && item.id) {
        if (!hasFreePotionSlot(s)) invalid('No free potion slot');
        s.gold -= item.price;
        item.sold = true;
        addPotion(s, item.id, ev);
      } else if (item.kind === 'remove') {
        if (s.deck.length === 0) invalid('Deck is empty');
        s.savedShop = items;
        s.screen = { kind: 'select_deck_card', purpose: 'remove', returnTo: 'shop' };
      } else if (item.kind === 'upgrade') {
        if (upgradableCards(s).length === 0) invalid('No cards to upgrade');
        s.savedShop = items;
        s.screen = { ...(upgradeScreen(s) as Extract<Screen, { kind: 'select_deck_card' }>), returnTo: 'shop' };
      } else if (item.kind === 'refresh') {
        if ((item.n ?? 0) >= MAX_SHOP_REFRESHES) invalid('Refresh limit reached');
        s.gold -= item.price;
        s.screen = { kind: 'shop', items: refreshShop(s, items, rngOf(s, 'shop'), modsOf(s)) };
      } else invalid('Malformed shop item');
      break;
    }
    case 'leave_shop':
      if (s.screen.kind !== 'shop') invalid('Not in shop');
      goToMap(s);
      break;
    case 'rest_heal':
      if (s.screen.kind !== 'rest') invalid('Not at rest site');
      healRun(s, s.maxHp * modsOf(s).restHealPct, ev);
      triggerOutOfCombatRelics(s, 'rest', ev);
      if (s.hp <= 0) defeat(s);
      else goToMap(s);
      break;
    case 'rest_upgrade':
      if (s.screen.kind !== 'rest') invalid('Not at rest site');
      if (upgradableCards(s).length === 0) invalid('No cards to upgrade');
      s.screen = upgradeScreen(s);
      break;
    case 'select_deck_card':
      selectDeckCard(s, action.cardUid, ev);
      break;
    case 'event_choice': {
      if (s.screen.kind !== 'event') invalid('Not in event');
      const def = getContent().events.get(s.screen.eventId);
      if (!def) throw new Error(`Unknown event id: ${s.screen.eventId}`);
      const opt = def.options[action.index];
      if (!opt) invalid(`No event option ${action.index}`);
      if (!legalEventOptions(s, def.id).includes(action.index)) invalid('Not enough gold for this option');
      applyEventOption(s, opt, ev);
      break;
    }
    case 'node_choice':
      nodeChoice(s, action.index, ev);
      break;
    case 'leave_node':
      if (s.screen.kind !== 'lab' && s.screen.kind !== 'blackbox' && s.screen.kind !== 'relay') invalid('Nothing to leave');
      goToMap(s);
      break;
    case 'use_potion':
      usePotion(s, action.slot, action.targetUid, ev);
      break;
    case 'discard_potion': {
      const id = potionsOf(s)[action.slot];
      if (id === undefined) invalid(`No potion in slot ${action.slot}`);
      s.potions = potionsOf(s).filter((_, i) => i !== action.slot);
      ev.push({ type: 'potion_discarded', potionId: id, slot: action.slot });
      break;
    }
    default:
      invalid(`Unknown action type: ${(action as { type?: unknown }).type}`);
  }

  if (s.gold !== prevGold) ev.push({ type: 'gold_changed', amount: s.gold - prevGold });
  if (s.gold > (s.stats.maxGold ?? 0)) s.stats.maxGold = s.gold;
  if (s.screen.kind !== prevScreen) ev.push({ type: 'screen_changed', screen: s.screen.kind });
  s.score = computeScore(s);
  return { state: s, events: ev };
}

/** Куда вернуться при отмене выбора карты (узлы с собственным экраном). */
function backScreen(s: RunState, returnTo: 'map' | 'shop'): Screen | null {
  if (returnTo !== 'map') return null;
  const k = currentNode(s)?.kind;
  return k === 'rest' ? { kind: 'rest' } : k === 'lab' ? { kind: 'lab' } : null;
}

const TRANSFORM_OFFER_SIZE = 3;
function transformScreen(s: RunState): Screen {
  const offer = rngOf(s, 'cards').shuffle([...s.deck]).slice(0, TRANSFORM_OFFER_SIZE).map((c) => c.uid);
  return { kind: 'select_deck_card', purpose: 'transform', returnTo: 'map', offer };
}

/** Превратить карту в случайную другой редкости (пул класса; для проклятий — любая). */
function transformCard(s: RunState, card: CardInstance, ev: GameEvent[]): void {
  const rng = rngOf(s, 'cards');
  const oldRarity = getContent().cards.get(card.defId)?.rarity;
  const pool = rewardCardPool(s.classId, s);
  const other = pool.filter((c) => c.rarity !== oldRarity && c.id !== card.defId);
  const cands = other.length > 0 ? other : pool.filter((c) => c.id !== card.defId);
  ev.push({ type: 'card_removed', cardUid: card.uid, defId: card.defId });
  s.deck.splice(s.deck.findIndex((c) => c.uid === card.uid), 1);
  if (cands.length > 0) addCardToDeck(s, rng.pick(cands).id, ev);
}

function selectDeckCard(s: RunState, cardUid: string | null, ev: GameEvent[]): void {
  if (s.screen.kind !== 'select_deck_card') invalid('Not selecting a deck card');
  const { purpose, returnTo } = s.screen;
  const back = backScreen(s, returnTo);
  const fromRest = purpose === 'upgrade' && back?.kind === 'rest';
  if (cardUid === null) {
    if (back) s.screen = back;
    else returnFromDeckSelect(s, returnTo);
    return;
  }
  const idx = s.deck.findIndex((c) => c.uid === cardUid);
  const card = s.deck[idx];
  if (!card) invalid(`Card ${cardUid} is not in deck`);
  if (s.screen.offer && purpose !== 'remove' && !s.screen.offer.includes(cardUid)) invalid(`Card ${cardUid} is not offered`);
  if (purpose === 'transform') {
    transformCard(s, card, ev);
    goToMap(s);
    return;
  }
  if (purpose === 'upgrade') {
    if (!canUpgrade(card.defId, card.upgraded)) invalid(`Card ${cardUid} cannot be upgraded`);
    if (returnTo === 'shop' && s.savedShop) {
      const item = s.savedShop.find((i) => i.kind === 'upgrade' && !i.sold);
      if (!item || s.gold < item.price) invalid('Card upgrade is not available');
      s.gold -= item.price;
      item.sold = true;
      s.shopUpgrades = (s.shopUpgrades ?? 0) + 1;
    }
    card.upgraded = true;
    ev.push({ type: 'card_upgraded', cardUid, defId: card.defId });
    if (fromRest) triggerOutOfCombatRelics(s, 'rest', ev);
    if (s.hp <= 0) return defeat(s);
    returnFromDeckSelect(s, returnTo);
    return;
  }
  // remove
  if (returnTo === 'shop' && s.savedShop) {
    const removeItem = s.savedShop.find((i) => i.kind === 'remove' && !i.sold);
    if (!removeItem || s.gold < removeItem.price) invalid('Card removal is not available');
    s.gold -= removeItem.price;
    removeItem.sold = true;
    s.cardRemovals = (s.cardRemovals ?? 0) + 1;
  }
  s.deck.splice(idx, 1);
  ev.push({ type: 'card_removed', cardUid, defId: card.defId });
  returnFromDeckSelect(s, returnTo);
}

// ---------- узлы: лаборатория, чёрный ящик, ретранслятор ----------

export const BLACKBOX_FORCE_HP_PCT = 0.15;
export const BLACKBOX_HACK_HP_PCT = 0.08;
export const RELAY_HEAL_PCT = 0.15;

export function blackboxForceCost(s: Pick<RunState, 'maxHp'>): number {
  return Math.max(6, Math.round(s.maxHp * BLACKBOX_FORCE_HP_PCT));
}
export function blackboxHackCost(s: Pick<RunState, 'maxHp'>): number {
  return Math.max(4, Math.round(s.maxHp * BLACKBOX_HACK_HP_PCT));
}

function giveRelicOrGold(s: RunState, ev: GameEvent[]): string {
  const relicId = rollRelic(s, rngOf(s, 'events'));
  if (relicId) {
    obtainRelic(s, relicId, ev);
    return 'Реликвия получена.';
  }
  s.gold += 60;
  return 'Реликвий не осталось: +60 кредитов.';
}

function nodeChoice(s: RunState, index: number, ev: GameEvent[]): void {
  switch (s.screen.kind) {
    case 'lab':
      if (index === 0) {
        if (upgradableCards(s).length === 0) invalid('No cards to upgrade');
        s.screen = upgradeScreen(s);
      } else if (index === 1) {
        if (s.deck.length === 0) invalid('Deck is empty');
        s.screen = transformScreen(s);
      } else invalid(`No lab option ${index}`);
      return;
    case 'blackbox': {
      if (index === 0) {
        const cost = blackboxForceCost(s);
        if (s.hp <= cost) invalid('Not enough HP');
        applyOutOfCombatEffects(s, [{ type: 'lose_hp', amount: cost }], ev);
        s.eventResult = `Ящик вскрыт силой (−${cost} HP). ${giveRelicOrGold(s, ev)}`;
      } else if (index === 1) {
        if (rngOf(s, 'events').next() < 0.5) {
          s.eventResult = `Взлом удался без потерь. ${giveRelicOrGold(s, ev)}`;
        } else {
          const cost = blackboxHackCost(s);
          if (s.hp > cost) applyOutOfCombatEffects(s, [{ type: 'lose_hp', amount: cost }], ev);
          const before = potionsOf(s).length;
          gainPotions(s, 1, undefined, ev);
          if (potionsOf(s).length === before) s.gold += 40;
          s.eventResult = `Защита ящика ударила током (−${cost} HP). В обломках нашёлся расходник.`;
        }
      } else invalid(`No blackbox option ${index}`);
      if (s.hp <= 0) return defeat(s);
      goToMap(s);
      return;
    }
    case 'relay': {
      if (index !== 0) invalid(`No relay option ${index}`);
      healRun(s, s.maxHp * RELAY_HEAL_PCT, ev);
      const before = potionsOf(s).length;
      gainPotions(s, 1, undefined, ev);
      if (potionsOf(s).length === before) s.gold += 25;
      s.eventResult = 'Ретранслятор подзарядил тебя и выдал расходник.';
      goToMap(s);
      return;
    }
    default:
      invalid('No node choice here');
  }
}

// ---------- расходники ----------

/** Можно ли выпить этот расходник на текущем экране (без учёта цели): в бою — любой, вне боя — только outOfCombat. */
export function canUsePotionNow(s: RunState, potionId: string): boolean {
  const p = getPotion(potionId);
  if (!p || s.status !== 'active') return false;
  if (s.screen.kind === 'combat') return !!s.combat && s.combat.phase === 'player';
  if (s.screen.kind === 'game_over') return false;
  return !!p.outOfCombat;
}

function usePotion(s: RunState, slot: number, targetUid: string | undefined, ev: GameEvent[]): void {
  const id = potionsOf(s)[slot];
  if (id === undefined) invalid(`No potion in slot ${slot}`);
  const potion = getPotion(id);
  if (!potion) invalid(`Unknown potion id: ${id}`);
  // Слот освобождается до эффектов (эффект может выдать новый расходник)
  const consume = (): void => {
    s.potions = potionsOf(s).filter((_, i) => i !== slot);
    ev.push({ type: 'potion_used', potionId: id, slot });
  };
  if (s.screen.kind === 'combat') {
    const ctx = combatCtx(s, ev);
    consume();
    usePotionInCombat(ctx, potion, targetUid);
    afterCombatStep(s, ctx, ev);
    return;
  }
  if (!canUsePotionNow(s, id)) invalid(`Potion ${id} can only be used in combat`);
  consume();
  applyOutOfCombatEffects(s, potion.effects, ev);
  if (s.hp <= 0) defeat(s);
}

function applyEventOption(s: RunState, opt: EventOption, ev: GameEvent[]): void {
  let res: EventResult = opt;
  if (opt.outcomes && opt.outcomes.length > 0) {
    res = rngOf(s, 'events').weighted(opt.outcomes.map((o) => [o, o.weight] as [EventResult, number]));
  }
  if (res.setFlag) s.flags = [...(s.flags ?? []).filter((f) => f !== res.setFlag), res.setFlag];
  if (res.text) s.eventResult = res.text;
  applyOutOfCombatEffects(s, res.effects, ev);
  if (s.hp <= 0) return defeat(s);
  switch (res.special) {
    case 'remove_card':
      if (s.deck.length > 0) s.screen = { kind: 'select_deck_card', purpose: 'remove', returnTo: 'map' };
      else goToMap(s);
      return;
    case 'upgrade_card':
      if (upgradableCards(s).length > 0) s.screen = upgradeScreen(s);
      else goToMap(s);
      return;
    case 'transform_card':
      if (s.deck.length > 0) s.screen = transformScreen(s);
      else goToMap(s);
      return;
    case 'lose_potion': {
      const p = potionsOf(s)[0];
      if (p !== undefined) {
        s.potions = potionsOf(s).slice(1);
        ev.push({ type: 'potion_discarded', potionId: p, slot: 0 });
      }
      goToMap(s);
      return;
    }
    case 'remove_curse': {
      const i = s.deck.findIndex((c) => resolveCard(c.defId, c.upgraded).type === 'curse');
      const c = s.deck[i];
      if (c) {
        s.deck.splice(i, 1);
        ev.push({ type: 'card_removed', cardUid: c.uid, defId: c.defId });
      }
      goToMap(s);
      return;
    }
    case 'random_relic': {
      const relicId = rollRelic(s, rngOf(s, 'events'));
      if (relicId) obtainRelic(s, relicId, ev);
      if (s.hp <= 0) return defeat(s);
      goToMap(s);
      return;
    }
    case 'random_card': {
      const pool = rewardCardPool(s.classId, s);
      if (pool.length > 0) addCardToDeck(s, rngOf(s, 'events').pick(pool).id, ev);
      goToMap(s);
      return;
    }
    case 'fight':
      startEncounter(s, 'normal', ev);
      return;
    case 'fight_elite':
      startEncounter(s, 'elite', ev);
      return;
    default:
      goToMap(s);
  }
}

// ---------- легальные действия ----------

export function getLegalActions(state: RunState): Action[] {
  const s = state;
  if (s.status !== 'active') return [];
  const actions: Action[] = [];
  const screen: Screen = s.screen;
  switch (screen.kind) {
    case 'map':
      for (const n of availableNodes(s)) actions.push({ type: 'choose_node', nodeId: n.id });
      break;
    case 'combat': {
      const c = s.combat;
      if (!c || c.phase !== 'player') break;
      const alive = livingEnemies(c);
      for (const inst of c.hand) {
        const card = resolveCard(inst.defId, inst.upgraded);
        if (!isPlayable(c, card)) continue;
        if (needsEnemyTarget(card)) {
          for (const e of alive) actions.push({ type: 'play_card', cardUid: inst.uid, targetUid: e.uid });
        } else actions.push({ type: 'play_card', cardUid: inst.uid });
      }
      if (canCool(c)) actions.push({ type: 'cool' });
      actions.push({ type: 'end_turn' });
      break;
    }
    case 'reward':
      screen.items.forEach((item, index) => {
        if (item.kind === 'potion' && !hasFreePotionSlot(s)) return; // слоты заняты — сначала выпей/выброси
        actions.push({ type: 'take_reward', index });
      });
      actions.push({ type: 'leave_reward' });
      break;
    case 'card_pick':
      for (const cardId of screen.cardIds) actions.push({ type: 'pick_card', cardId });
      actions.push({ type: 'pick_card', cardId: null });
      break;
    case 'shop':
      screen.items.forEach((item, index) => {
        if (item.sold || s.gold < item.price) return;
        if (item.kind === 'remove' && s.deck.length === 0) return;
        if (item.kind === 'upgrade' && upgradableCards(s).length === 0) return;
        if (item.kind === 'potion' && !hasFreePotionSlot(s)) return;
        actions.push({ type: 'shop_buy', index });
      });
      actions.push({ type: 'leave_shop' });
      break;
    case 'lab':
      if (upgradableCards(s).length > 0) actions.push({ type: 'node_choice', index: 0 });
      if (s.deck.length > 0) actions.push({ type: 'node_choice', index: 1 });
      actions.push({ type: 'leave_node' });
      break;
    case 'blackbox':
      if (s.hp > blackboxForceCost(s)) actions.push({ type: 'node_choice', index: 0 });
      actions.push({ type: 'node_choice', index: 1 });
      actions.push({ type: 'leave_node' });
      break;
    case 'relay':
      actions.push({ type: 'node_choice', index: 0 }, { type: 'leave_node' });
      break;
    case 'rest':
      actions.push({ type: 'rest_heal' });
      if (upgradableCards(s).length > 0) actions.push({ type: 'rest_upgrade' });
      break;
    case 'event':
      for (const index of legalEventOptions(s, screen.eventId)) actions.push({ type: 'event_choice', index });
      break;
    case 'select_deck_card': {
      const base = screen.purpose === 'upgrade' ? upgradableCards(s) : s.deck;
      const cards = screen.purpose === 'remove' ? base : base.filter((c) => !screen.offer || screen.offer.includes(c.uid));
      for (const c of cards) actions.push({ type: 'select_deck_card', cardUid: c.uid });
      actions.push({ type: 'select_deck_card', cardUid: null });
      break;
    }
    case 'game_over':
      break;
  }
  pushPotionActions(s, actions);
  return actions;
}

/** use_potion (в бою — любые, с целью для каждого живого врага; вне боя — лечебные) и discard_potion. */
function pushPotionActions(s: RunState, actions: Action[]): void {
  const potions = potionsOf(s);
  if (potions.length === 0 || s.screen.kind === 'game_over') return;
  const inCombat = s.screen.kind === 'combat';
  if (inCombat && (!s.combat || s.combat.phase !== 'player')) return;
  potions.forEach((id, slot) => {
    const p = getPotion(id);
    if (!p || !canUsePotionNow(s, id)) return;
    if (inCombat && p.target === 'enemy') {
      for (const e of livingEnemies(s.combat!)) actions.push({ type: 'use_potion', slot, targetUid: e.uid });
    } else actions.push({ type: 'use_potion', slot });
  });
  potions.forEach((_, slot) => actions.push({ type: 'discard_potion', slot }));
}

export function replay(opts: NewRunOptions, actions: readonly Action[]): RunState {
  let s = newRun(opts);
  for (const a of actions) s = applyAction(s, a).state;
  return s;
}
