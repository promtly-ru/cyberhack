/**
 * Бой: ход игрока, розыгрыш карт, конец хода, ходы врагов, статусы, реликвии в бою.
 * Все функции мутируют ctx.s (вызывающий код уже сделал structuredClone).
 */
import { chooseMove } from './ai';
import type { AscensionMods } from './ascension';
import { canUpgrade, COST_UNPLAYABLE, COST_X, needsEnemyTarget, resolveCard, type ResolvedCard } from './cards';
import { getContent } from './content';
import { rngOf } from './rng';
import { getActiveSynergies } from './synergies';
import { FIRMWARES, isFirmwareActive } from './firmware';
import { getMutatorMods, type MutatorMods } from './mutators';
import { gainPotions, type PotionDef } from './potions';
import { addStatus, calcAttackDamage, calcBlock, DEBUFF_STATUSES, getStatus, KNOWN_STATUSES, STATUS } from './statuses';
import {
  InvalidActionError,
  type CardInstance,
  type CombatantState,
  type CombatState,
  type Effect,
  type EnemyDef,
  type EnemyState,
  type GameEvent,
  type RelicTrigger,
  type RunState,
  type StatusId,
} from './types';
import { makeCard, nextUid } from './util';
import {
  HEAT_AFTER_MELTDOWN, HEAT_COOL_AMOUNT, HEAT_COOL_HP, HEAT_IDLE_COOL, HEAT_MAX, HEAT_MELTDOWN_HP_PCT, HEAT_PER_CARD,
  HEAT_PER_TURN, HEAT_START, heatEnemyDamageMult, heatLevel, heatPlayerDamageMult,
} from './heat';

export const BASE_ENERGY = 3;
export const DRAW_PER_TURN = 5;
export const HAND_LIMIT = 10;
/** Служебные счётчики статистики в CombatState.counters (не id реликвий) */
export const COUNTER_VIRUS = '$virus';
export const COUNTER_TURN_CARDS = '$turnCards';

export interface CombatCtx {
  s: RunState;
  c: CombatState;
  ev: GameEvent[];
  mods: AscensionMods;
}

export type Unit = 'player' | EnemyState;

// ---------- helpers ----------

/** Модификаторы мутаторов забега (без мутаторов — общий константный объект). */
function mutMods(ctx: CombatCtx): MutatorMods {
  return getMutatorMods(ctx.s.mutators);
}

function unitState(ctx: CombatCtx, u: Unit): CombatantState {
  return u === 'player' ? ctx.c.player : u;
}

function unitUid(u: Unit): string {
  return u === 'player' ? 'player' : u.uid;
}

export function isOver(ctx: CombatCtx): boolean {
  return ctx.c.phase !== 'player';
}

export function livingEnemies(c: CombatState): EnemyState[] {
  return c.enemies.filter((e) => e.hp > 0);
}

export function enemyDefOf(e: EnemyState): EnemyDef {
  const def = getContent().enemies.get(e.defId);
  if (!def) throw new Error(`Unknown enemy id: ${e.defId}`);
  return def;
}

function damageMult(mods: AscensionMods, tier: EnemyDef['tier']): number {
  return tier === 'boss' ? mods.bossDamageMult : tier === 'elite' ? mods.eliteDamageMult : mods.normalDamageMult;
}

function hpMult(mods: AscensionMods, tier: EnemyDef['tier']): number {
  return tier === 'boss' ? mods.bossHpMult : tier === 'elite' ? mods.eliteHpMult : mods.normalHpMult;
}

/** Базовый урон врага с учётом ascension (до статусов). */
export function scaledEnemyDamage(mods: AscensionMods, def: EnemyDef, amount: number): number {
  const m = damageMult(mods, def.tier);
  return m === 1 ? amount : Math.ceil(amount * m - 1e-9);
}

function randomLiving(ctx: CombatCtx): EnemyState | undefined {
  const alive = livingEnemies(ctx.c);
  if (alive.length === 0) return undefined;
  return rngOf(ctx.s, 'combat').pick(alive);
}

// ---------- базовые операции над бойцами ----------

function onDeath(ctx: CombatCtx, u: Unit): void {
  if (u === 'player') {
    ctx.c.phase = 'lost';
    return;
  }
  u.block = 0;
  ctx.ev.push({ type: 'enemy_died', enemyUid: u.uid });
  ctx.s.stats.enemiesKilled += 1;
  if (ctx.c.phase === 'player' && livingEnemies(ctx.c).length === 0) ctx.c.phase = 'won';
}

/** Нанести amount урона (блок поглощает, если не ignoreBlock). Возвращает потерю HP. */
export function hit(ctx: CombatCtx, u: Unit, amount: number, ignoreBlock = false): number {
  const t = unitState(ctx, u);
  if (t.hp <= 0) return 0;
  const amt = Math.max(0, Math.floor(amount));
  let blocked = 0;
  if (!ignoreBlock) {
    blocked = Math.min(t.block, amt);
    t.block -= blocked;
  }
  let dmg = amt - blocked;
  // Барьер: удар, пробивший блок, поглощается целиком (Вирус/Утечка/потеря HP — ignoreBlock — не поглощаются)
  if (dmg > 0 && !ignoreBlock && getStatus(t, STATUS.barrier) > 0) {
    addStatus(t, STATUS.barrier, -1);
    ctx.ev.push({ type: 'barrier_absorbed', targetUid: unitUid(u), amount: dmg });
    dmg = 0;
  }
  const before = t.hp;
  t.hp = Math.max(0, t.hp - dmg);
  ctx.ev.push({ type: 'damage', targetUid: unitUid(u), amount: dmg, blocked });
  if (u !== 'player') ctx.s.stats.damageDealt += before - t.hp;
  if (t.hp <= 0) onDeath(ctx, u);
  return before - t.hp;
}

/** Атакующий удар: strength/weak/vulnerable + thorns цели. source = null — «сырой» урон. */
function attack(ctx: CombatCtx, source: Unit | null, target: Unit, base: number, applyDefender = true): void {
  const tState = unitState(ctx, target);
  if (tState.hp <= 0) return;
  let dmg = calcAttackDamage(base, source ? unitState(ctx, source) : null, applyDefender ? tState : null);
  if (source === 'player') {
    const m = mutMods(ctx).playerDamageMult;
    if (m !== 1) dmg = Math.floor(dmg * m + 1e-9);
    const hm = heatPlayerDamageMult(ctx.c.heat ?? 0);
    if (hm !== 1) dmg = Math.floor(dmg * hm + 1e-9);
  } else if (source && target === 'player') {
    const hm = heatEnemyDamageMult(ctx.c.heat ?? 0);
    if (hm !== 1) dmg = Math.ceil(dmg * hm - 1e-9);
  }
  const lost = hit(ctx, target, dmg);
  if (source === 'player' && target !== 'player' && lost > (ctx.s.stats.maxHit ?? 0)) ctx.s.stats.maxHit = lost;
  if (source) {
    const thorns = getStatus(tState, STATUS.thorns);
    if (thorns > 0 && unitState(ctx, source).hp > 0) hit(ctx, source, thorns);
  }
}

export function gainBlock(ctx: CombatCtx, u: Unit, base: number, raw = false): void {
  const t = unitState(ctx, u);
  if (t.hp <= 0) return;
  const amount = raw ? Math.max(0, base) : calcBlock(base, t);
  t.block += amount;
  ctx.ev.push({ type: 'block_gained', targetUid: unitUid(u), amount });
  // Утечка снимается, как только носитель получает блок
  if (amount > 0 && getStatus(t, STATUS.bleed) > 0) {
    const v = getStatus(t, STATUS.bleed);
    addStatus(t, STATUS.bleed, -v);
    ctx.ev.push({ type: 'status_applied', targetUid: unitUid(u), status: STATUS.bleed, amount: -v });
  }
}

/** Дебафф ли статус: по контенту, по списку движка или отрицательные Разгон/Шифрование. */
function isDebuff(id: string, value: number): boolean {
  if ((id === STATUS.strength || id === STATUS.dexterity) && value < 0) return true;
  const def = getContent().statuses.get(id);
  return def ? def.kind === 'debuff' : DEBUFF_STATUSES.has(id);
}

/** Снять с бойца до amount разных дебаффов. */
function cleanse(ctx: CombatCtx, u: Unit, amount: number): void {
  const t = unitState(ctx, u);
  let left = amount;
  for (const [id, v] of Object.entries(t.statuses)) {
    if (left <= 0) break;
    if (v === 0 || !isDebuff(id, v)) continue;
    delete t.statuses[id];
    ctx.ev.push({ type: 'status_applied', targetUid: unitUid(u), status: id, amount: -v });
    left--;
  }
}

export function applyStatus(ctx: CombatCtx, u: Unit, status: StatusId, amount: number): void {
  const t = unitState(ctx, u);
  if (t.hp <= 0 || amount === 0) return;
  addStatus(t, status, amount);
  ctx.ev.push({ type: 'status_applied', targetUid: unitUid(u), status, amount });
  if (u !== 'player' && status === STATUS.virus && amount > 0) {
    const st = ctx.s.stats;
    st.virusApplied = (st.virusApplied ?? 0) + amount;
    const inCombat = (ctx.c.counters[COUNTER_VIRUS] ?? 0) + amount;
    ctx.c.counters[COUNTER_VIRUS] = inCombat;
    if (inCombat > (st.maxVirusInCombat ?? 0)) st.maxVirusInCombat = inCombat;
  }
}

export function heal(ctx: CombatCtx, u: Unit, amount: number): void {
  const t = unitState(ctx, u);
  if (t.hp <= 0) return;
  const healed = Math.max(0, Math.min(t.maxHp - t.hp, Math.floor(amount)));
  t.hp += healed;
  ctx.ev.push({ type: 'heal', targetUid: unitUid(u), amount: healed });
}

// ---------- колода ----------

export function drawCards(ctx: CombatCtx, n: number): number {
  const c = ctx.c;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (c.hand.length >= HAND_LIMIT) break;
    if (c.drawPile.length === 0) {
      if (c.discardPile.length === 0) break;
      c.drawPile = rngOf(ctx.s, 'combat').shuffle(c.discardPile);
      c.discardPile = [];
      ctx.ev.push({ type: 'deck_shuffled', count: c.drawPile.length });
    }
    const card = c.drawPile.shift() as CardInstance;
    c.hand.push(card);
    count++;
  }
  if (count > 0) ctx.ev.push({ type: 'cards_drawn', count });
  return count;
}

function exhaustCard(ctx: CombatCtx, card: CardInstance): void {
  ctx.c.exhaustPile.push(card);
  ctx.ev.push({ type: 'card_exhausted', cardUid: card.uid });
}

function addCardToCombat(ctx: CombatCtx, defId: string, to: 'hand' | 'draw' | 'discard', count: number): void {
  const c = ctx.c;
  for (let i = 0; i < count; i++) {
    const card = makeCard(ctx.s, defId);
    if (to === 'hand' && c.hand.length < HAND_LIMIT) c.hand.push(card);
    else if (to === 'draw') {
      const pos = rngOf(ctx.s, 'combat').int(0, c.drawPile.length);
      c.drawPile.splice(pos, 0, card);
    } else c.discardPile.push(card);
  }
}

// ---------- эффекты ----------

/** Эффекты «на игрока», общие для карт и реликвий. Возвращает false, если тип не обработан. */
function applyPlayerUtilityEffect(ctx: CombatCtx, eff: Effect): boolean {
  switch (eff.type) {
    case 'draw':
      drawCards(ctx, eff.amount);
      return true;
    case 'gain_energy':
      ctx.c.energy = Math.max(0, ctx.c.energy + eff.amount);
      return true;
    case 'heal':
      heal(ctx, 'player', eff.amount);
      return true;
    case 'lose_hp':
      hit(ctx, 'player', eff.amount, true);
      return true;
    case 'add_card':
      addCardToCombat(ctx, eff.cardId, eff.to, eff.count ?? 1);
      return true;
    case 'exhaust_random_hand': {
      const rng = rngOf(ctx.s, 'combat');
      for (let i = 0; i < eff.amount && ctx.c.hand.length > 0; i++) {
        const idx = rng.int(0, ctx.c.hand.length - 1);
        const [card] = ctx.c.hand.splice(idx, 1);
        if (card) exhaustCard(ctx, card);
      }
      return true;
    }
    case 'gain_gold':
      ctx.s.gold = Math.max(0, ctx.s.gold + eff.amount);
      return true;
    case 'scry': {
      // Упрощённый «просмотр»: статусы и проклятия среди верхних карт добора уходят в сброс
      const c = ctx.c;
      const top = c.drawPile.slice(0, Math.max(0, eff.amount));
      const junk = top.filter((card) => isJunkCard(card.defId));
      if (junk.length > 0) {
        c.drawPile = c.drawPile.filter((card) => !junk.includes(card));
        c.discardPile.push(...junk);
        ctx.ev.push({ type: 'cards_discarded', count: junk.length });
      }
      return true;
    }
    case 'discard_hand_draw': {
      const c = ctx.c;
      const n = c.hand.length;
      if (n > 0) {
        c.discardPile.push(...c.hand);
        c.hand = [];
        ctx.ev.push({ type: 'cards_discarded', count: n });
      }
      drawCards(ctx, n + Math.max(0, eff.amount));
      return true;
    }
    case 'upgrade_random_hand': {
      const rng = rngOf(ctx.s, 'combat');
      const pool = ctx.c.hand.filter((card) => canUpgrade(card.defId, card.upgraded));
      for (let i = 0; i < eff.amount && pool.length > 0; i++) {
        const [card] = pool.splice(rng.int(0, pool.length - 1), 1);
        if (card) card.upgraded = true; // экземпляр боя — колода забега не меняется
      }
      return true;
    }
    case 'gain_max_hp': {
      const amt = Math.max(0, Math.floor(eff.amount));
      ctx.c.player.maxHp += amt;
      heal(ctx, 'player', amt);
      return true;
    }
    case 'heal_pct':
      heal(ctx, 'player', (ctx.c.player.maxHp * eff.amount) / 100);
      return true;
    case 'double_next':
      applyStatus(ctx, 'player', STATUS.echo, eff.amount);
      return true;
    case 'cleanse':
      cleanse(ctx, 'player', eff.amount);
      return true;
    case 'gain_potion':
      gainPotions(ctx.s, eff.amount, eff.potionId, ctx.ev);
      return true;
    default:
      return false;
  }
}

function isJunkCard(defId: string): boolean {
  const t = getContent().cards.get(defId)?.type;
  return t === 'status' || t === 'curse';
}

function enemyTargets(ctx: CombatCtx, kind: string, chosen: EnemyState | undefined): EnemyState[] {
  if (kind === 'enemy') {
    if (chosen && chosen.hp > 0) return [chosen];
    const r = randomLiving(ctx);
    return r ? [r] : [];
  }
  if (kind === 'all_enemies') return livingEnemies(ctx.c);
  const r = randomLiving(ctx);
  return r ? [r] : [];
}

function applyCardEffect(ctx: CombatCtx, eff: Effect, card: ResolvedCard, chosen: EnemyState | undefined): void {
  switch (eff.type) {
    case 'damage': {
      const kind = eff.target ?? card.target;
      const times = eff.times ?? 1;
      for (let t = 0; t < times && !isOver(ctx); t++) {
        if (kind === 'self') attack(ctx, null, 'player', eff.amount, false);
        else for (const e of enemyTargets(ctx, kind, chosen)) attack(ctx, 'player', e, eff.amount);
      }
      return;
    }
    case 'block':
      gainBlock(ctx, 'player', eff.amount);
      return;
    case 'apply_status': {
      const kind = eff.target ?? card.target;
      if (kind === 'self' || kind === 'none') applyStatus(ctx, 'player', eff.status, eff.amount);
      else for (const e of enemyTargets(ctx, kind, chosen)) applyStatus(ctx, e, eff.status, eff.amount);
      return;
    }
    case 'gamble':
      for (const sub of rollGamble(ctx, eff)) {
        if (isOver(ctx)) break;
        applyCardEffect(ctx, sub, card, chosen);
      }
      return;
    default:
      applyPlayerUtilityEffect(ctx, eff);
  }
}

/** Бросок «Азарта»: детерминированно, через поток ГСЧ combat */
function rollGamble(ctx: CombatCtx, eff: Extract<Effect, { type: 'gamble' }>): Effect[] {
  const win = rngOf(ctx.s, 'combat').next() * 100 < eff.amount;
  return win ? eff.win : (eff.lose ?? []);
}

function applyRelicEffect(ctx: CombatCtx, eff: Effect): void {
  const toEnemies = (kind: string | undefined): EnemyState[] | null => {
    if (kind === 'all_enemies') return livingEnemies(ctx.c);
    if (kind === 'random_enemy' || kind === 'enemy') {
      const r = randomLiving(ctx);
      return r ? [r] : [];
    }
    return null;
  };
  switch (eff.type) {
    case 'damage': {
      const targets = toEnemies(eff.target);
      const times = eff.times ?? 1;
      for (let t = 0; t < times && !isOver(ctx); t++) {
        if (targets === null) hit(ctx, 'player', eff.amount);
        else for (const e of targets) attack(ctx, null, e, eff.amount, false);
      }
      return;
    }
    case 'block':
      gainBlock(ctx, 'player', eff.amount, true);
      return;
    case 'apply_status': {
      const targets = toEnemies(eff.target);
      if (targets === null) applyStatus(ctx, 'player', eff.status, eff.amount);
      else for (const e of targets) applyStatus(ctx, e, eff.status, eff.amount);
      return;
    }
    case 'gamble':
      for (const sub of rollGamble(ctx, eff)) {
        if (isOver(ctx)) break;
        applyRelicEffect(ctx, sub);
      }
      return;
    default:
      applyPlayerUtilityEffect(ctx, eff);
  }
}

function applyEnemyEffect(ctx: CombatCtx, enemy: EnemyState, def: EnemyDef, eff: Effect): void {
  switch (eff.type) {
    case 'damage': {
      const target: Unit = eff.target === 'self' ? enemy : 'player';
      const base = scaledEnemyDamage(ctx.mods, def, eff.amount);
      const times = eff.times ?? 1;
      for (let t = 0; t < times && !isOver(ctx) && enemy.hp > 0; t++) attack(ctx, enemy, target, base);
      return;
    }
    case 'block':
      gainBlock(ctx, enemy, eff.amount);
      return;
    case 'apply_status':
      applyStatus(ctx, eff.target === 'self' ? enemy : 'player', eff.status, eff.amount);
      return;
    case 'heal':
      heal(ctx, enemy, eff.amount);
      return;
    case 'heal_pct':
      heal(ctx, enemy, (enemy.maxHp * eff.amount) / 100);
      return;
    case 'gain_max_hp': {
      const amt = Math.max(0, Math.floor(eff.amount));
      enemy.maxHp += amt;
      heal(ctx, enemy, amt);
      return;
    }
    case 'cleanse':
      cleanse(ctx, enemy, eff.amount);
      return;
    case 'lose_hp':
      hit(ctx, 'player', eff.amount, true);
      return;
    case 'add_card':
      addCardToCombat(ctx, eff.cardId, eff.to, eff.count ?? 1);
      return;
    default:
      // draw / gain_energy / exhaust_random_hand / gain_gold / scry / echo и пр. у врагов игнорируются
      return;
  }
}

// ---------- реликвии ----------

export function triggerRelics(ctx: CombatCtx, trigger: RelicTrigger, force = false): void {
  const relics = getContent().relics;
  for (const id of ctx.s.relics) {
    const def = relics.get(id);
    if (!def || def.trigger !== trigger) continue;
    if (!force && isOver(ctx)) return;
    if (def.every !== undefined && def.every > 1) {
      const n = (ctx.c.counters[id] ?? 0) + 1;
      ctx.c.counters[id] = n;
      if (n % def.every !== 0) continue;
    }
    ctx.ev.push({ type: 'relic_triggered', relicId: id });
    for (const eff of def.effects) {
      if (!force && isOver(ctx)) break;
      applyRelicEffect(ctx, eff);
    }
  }
}

// ---------- статусы по ходам ----------

function tickVirus(ctx: CombatCtx, u: Unit): void {
  const t = unitState(ctx, u);
  const v = getStatus(t, STATUS.virus);
  if (v <= 0 || t.hp <= 0) return;
  hit(ctx, u, v, true);
  addStatus(t, STATUS.virus, -1);
}

/** Утечка: в начале хода носителя −N HP мимо блока; не тает (снимается блоком, см. gainBlock). */
function tickBleed(ctx: CombatCtx, u: Unit): void {
  const t = unitState(ctx, u);
  const b = getStatus(t, STATUS.bleed);
  if (b <= 0 || t.hp <= 0) return;
  hit(ctx, u, b, true);
}

function endOfTurnStatuses(ctx: CombatCtx, u: Unit): void {
  const t = unitState(ctx, u);
  if (t.hp <= 0) return;
  const plating = getStatus(t, STATUS.plating);
  if (plating > 0) gainBlock(ctx, u, plating, true);
  const regen = getStatus(t, STATUS.regen);
  if (regen > 0) {
    heal(ctx, u, regen);
    addStatus(t, STATUS.regen, -1);
  }
  const ritual = getStatus(t, STATUS.ritual);
  if (ritual !== 0) applyStatus(ctx, u, STATUS.strength, ritual);
  const statusDefs = getContent().statuses;
  for (const id of Object.keys(t.statuses)) {
    const known = KNOWN_STATUSES[id];
    const isDuration = known ? known === 'duration' : statusDefs.get(id)?.stacking === 'duration';
    if (isDuration && getStatus(t, id) > 0) addStatus(t, id, -1);
  }
}

// ---------- намерения ----------

export function refreshIntent(ctx: CombatCtx, e: EnemyState): void {
  const def = enemyDefOf(e);
  const move = def.moves.find((m) => m.id === e.intent.moveId) ?? def.moves[0];
  if (!move) return;
  // Мутатор «Туман войны»: намерения обычных врагов скрыты
  if (def.tier === 'normal' && mutMods(ctx).hideNormalIntents) {
    e.intent = { kind: 'unknown', moveId: move.id };
    return;
  }
  const dmg = move.effects.find((f) => f.type === 'damage' && f.target !== 'self');
  e.intent = { kind: move.intent, moveId: move.id };
  if (dmg && dmg.type === 'damage') {
    e.intent.damage = calcAttackDamage(scaledEnemyDamage(ctx.mods, def, dmg.amount), e, ctx.c.player);
    e.intent.times = dmg.times ?? 1;
  }
}

export function refreshIntents(ctx: CombatCtx): void {
  for (const e of ctx.c.enemies) if (e.hp > 0) refreshIntent(ctx, e);
}

function planNextMove(ctx: CombatCtx, e: EnemyState): void {
  const def = enemyDefOf(e);
  const moveId = chooseMove(def, e.moveHistory, rngOf(ctx.s, 'ai'));
  e.intent = { kind: def.moves.find((m) => m.id === moveId)?.intent ?? 'unknown', moveId };
  refreshIntent(ctx, e);
}

// ---------- фазы боя ----------

export function startCombat(s: RunState, enemyIds: readonly string[], ev: GameEvent[], mods: AscensionMods): CombatCtx {
  const content = getContent();
  const rng = rngOf(s, 'combat');
  const enemies: EnemyState[] = enemyIds.map((id) => {
    const def = content.enemies.get(id);
    if (!def) throw new Error(`Unknown enemy id: ${id}`);
    const hp = Math.max(1, Math.floor(rng.int(def.hp[0], def.hp[1]) * hpMult(mods, def.tier) + 1e-9));
    return {
      uid: nextUid(s, 'e'),
      defId: id,
      hp,
      maxHp: hp,
      block: 0,
      statuses: {},
      intent: { kind: 'unknown', moveId: '' },
      moveHistory: [],
    };
  });
  const mm = getMutatorMods(s.mutators);
  const shuffled = rng.shuffle(s.deck.map((card) => ({ ...card })));
  // Врождённые карты — наверх добора (порядок среди них сохраняется), чтобы попасть в стартовую руку
  const isInnate = (card: CardInstance): boolean => resolveCard(card.defId, card.upgraded).innate;
  const c: CombatState = {
    turn: 0,
    energy: 0,
    maxEnergy: BASE_ENERGY + mm.bonusEnergy,
    hand: [],
    drawPile: [...shuffled.filter(isInnate), ...shuffled.filter((card) => !isInnate(card))],
    discardPile: [],
    exhaustPile: [],
    player: { hp: s.hp, maxHp: s.maxHp, block: 0, statuses: {} },
    enemies,
    phase: 'player',
    counters: {},
    ...(s.heat ? { heat: HEAT_START } : {}),
  };
  s.combat = c;
  const ctx: CombatCtx = { s, c, ev, mods };
  // Мутаторы: стартовые статусы врагов и игрока
  for (const [id, n] of Object.entries(mm.enemyCombatStatuses)) for (const e of enemies) applyStatus(ctx, e, id, n);
  for (const [id, n] of Object.entries(mm.playerCombatStatuses)) applyStatus(ctx, 'player', id, n);
  for (const e of enemies) planNextMove(ctx, e);
  startPlayerTurn(ctx);
  return ctx;
}

function applyFirmwares(ctx: CombatCtx, trigger: 'combat_start' | 'turn_start'): void {
  const owned = ctx.s.firmwares ?? [];
  if (owned.length === 0) return;
  const deck = ctx.s.deck.map((c) => c.defId);
  for (const fw of FIRMWARES) {
    if (fw.trigger !== trigger || !owned.includes(fw.id) || !isFirmwareActive(fw, deck)) continue;
    for (const eff of fw.effects) {
      if (isOver(ctx)) return;
      applyRelicEffect(ctx, eff);
    }
  }
}

function applySynergies(ctx: CombatCtx): void {
  for (const syn of getActiveSynergies(ctx.s.deck.map((c) => c.defId))) {
    for (const eff of syn.effects) {
      if (isOver(ctx)) return;
      applyRelicEffect(ctx, eff);
    }
  }
}

export function startPlayerTurn(ctx: CombatCtx): void {
  const c = ctx.c;
  c.turn += 1;
  c.counters[COUNTER_TURN_CARDS] = 0;
  ctx.ev.push({ type: 'turn_started', turn: c.turn });
  c.player.block = 0;
  tickVirus(ctx, 'player');
  if (isOver(ctx)) return;
  tickBleed(ctx, 'player');
  if (isOver(ctx)) return;
  c.energy = c.maxEnergy;
  if (c.heat !== undefined) {
    c.heatCooled = false;
    addHeat(ctx, HEAT_PER_TURN);
    if (isOver(ctx)) return;
  }
  if (mutMods(ctx).turnEcho && getStatus(c.player, STATUS.echo) < 1) applyStatus(ctx, 'player', STATUS.echo, 1);
  triggerRelics(ctx, 'turn_start');
  if (isOver(ctx)) return;
  applyFirmwares(ctx, 'turn_start');
  if (isOver(ctx)) return;
  // Ход 1: все врождённые карты (они наверху добора) попадают в руку, даже если их больше 5
  const innate = c.turn === 1 ? c.drawPile.filter((card) => resolveCard(card.defId, card.upgraded).innate).length : 0;
  const heatDraw = c.heat !== undefined && heatLevel(c.heat) >= 2 ? 1 : 0;
  drawCards(ctx, Math.max(DRAW_PER_TURN + getMutatorMods(ctx.s.mutators).bonusDraw, innate) + heatDraw);
  if (c.turn === 1) {
    triggerRelics(ctx, 'combat_start');
    applySynergies(ctx);
    applyFirmwares(ctx, 'combat_start');
  }
  refreshIntents(ctx);
}

/** Можно ли разыграть карту сейчас (энергия, неиграбельность). */
export function isPlayable(c: CombatState, card: ResolvedCard): boolean {
  if (card.cost === COST_UNPLAYABLE || card.cost < COST_X) return false;
  if (card.cost === COST_X) return true;
  return c.energy >= effectiveCost(c, card);
}

/** «Критическая масса» (Heat ≥ 75): первая карта хода бесплатна. */
export function effectiveCost(c: CombatState, card: ResolvedCard): number {
  if (card.cost > 0 && c.heat !== undefined && heatLevel(c.heat) >= 3 && (c.counters[COUNTER_TURN_CARDS] ?? 0) === 0) return 0;
  return card.cost;
}

/** Прибавить Heat; при 100 — «Расплавление»: урон 15% макс HP игроку, Heat падает до 40. */
export function addHeat(ctx: CombatCtx, n: number): void {
  const c = ctx.c;
  if (c.heat === undefined) return;
  c.heat = Math.max(0, Math.min(HEAT_MAX, c.heat + n));
  if (c.heat >= HEAT_MAX) {
    c.heat = HEAT_AFTER_MELTDOWN;
    hit(ctx, 'player', Math.max(1, Math.floor(c.player.maxHp * HEAT_MELTDOWN_HP_PCT)), true);
  }
}

export function canCool(c: CombatState): boolean {
  return c.phase === 'player' && c.heat !== undefined && !c.heatCooled && c.heat > 0 && c.player.hp > HEAT_COOL_HP;
}

/** Кнопка «Охладить»: −30 Heat, −6 HP, раз в ход. */
export function coolDown(ctx: CombatCtx): void {
  if (!canCool(ctx.c)) throw new InvalidActionError('Cannot cool down now');
  ctx.c.heatCooled = true;
  hit(ctx, 'player', HEAT_COOL_HP, true);
  if (!isOver(ctx)) addHeat(ctx, -HEAT_COOL_AMOUNT);
}

export function playCard(ctx: CombatCtx, cardUid: string, targetUid: string | undefined): void {
  const c = ctx.c;
  const idx = c.hand.findIndex((h) => h.uid === cardUid);
  const inst = c.hand[idx];
  if (!inst) throw new InvalidActionError(`Card ${cardUid} is not in hand`);
  const card = resolveCard(inst.defId, inst.upgraded);
  if (card.cost === COST_UNPLAYABLE) throw new InvalidActionError(`Card ${card.def.id} is unplayable`);
  if (!isPlayable(c, card)) throw new InvalidActionError(`Not enough energy for ${card.def.id}`);
  let chosen: EnemyState | undefined;
  if (needsEnemyTarget(card)) {
    chosen = c.enemies.find((e) => e.uid === targetUid && e.hp > 0);
    if (!chosen) throw new InvalidActionError(`Card ${card.def.id} needs a living enemy target`);
  }

  c.hand.splice(idx, 1);
  let repeats = 1;
  if (card.cost === COST_X) {
    repeats = c.energy;
    c.energy = 0;
  } else c.energy -= effectiveCost(c, card);

  ctx.ev.push({ type: 'card_played', cardUid: inst.uid, defId: inst.defId });
  ctx.s.stats.cardsPlayed += 1;
  const inTurn = (c.counters[COUNTER_TURN_CARDS] ?? 0) + 1;
  c.counters[COUNTER_TURN_CARDS] = inTurn;
  if (inTurn > (ctx.s.stats.maxCardsInTurn ?? 0)) ctx.s.stats.maxCardsInTurn = inTurn;

  // Эхо: карта срабатывает дважды, снимается 1 Эхо (проверяется до эффектов — Эхо от самой карты не тратится)
  let passes = 1;
  if (getStatus(c.player, STATUS.echo) > 0) {
    addStatus(c.player, STATUS.echo, -1);
    passes = 2;
  }
  for (let p = 0; p < passes && !isOver(ctx); p++) {
    if (p > 0) ctx.ev.push({ type: 'card_echoed', cardUid: inst.uid });
    for (let r = 0; r < repeats && !isOver(ctx); r++) {
      for (const eff of card.effects) {
        if (isOver(ctx)) break;
        applyCardEffect(ctx, eff, card, chosen);
      }
    }
  }

  // Силы (power) уходят из боя; exhaust — в сброшенные навсегда; остальное — в сброс.
  if (card.type !== 'power') {
    if (card.exhaust) exhaustCard(ctx, inst);
    else c.discardPile.push(inst);
  }

  if (!isOver(ctx)) addHeat(ctx, HEAT_PER_CARD);
  triggerRelics(ctx, 'card_played');
  if (card.type === 'attack') triggerRelics(ctx, 'attack_played');
  if (!isOver(ctx)) refreshIntents(ctx);
}

export function endTurn(ctx: CombatCtx): void {
  const c = ctx.c;
  if (c.heat !== undefined && (c.counters[COUNTER_TURN_CARDS] ?? 0) === 0) addHeat(ctx, -HEAT_IDLE_COOL);
  triggerRelics(ctx, 'turn_end');
  if (isOver(ctx)) return;

  const hand = c.hand;
  const kept: CardInstance[] = [];
  c.hand = [];
  for (const inst of hand) {
    const rc = resolveCard(inst.defId, inst.upgraded);
    if (rc.retain) kept.push(inst); // Удержание: остаётся в руке
    else if (rc.ethereal) exhaustCard(ctx, inst);
    else c.discardPile.push(inst);
  }
  c.hand = kept;

  endOfTurnStatuses(ctx, 'player');
  if (isOver(ctx)) return;

  for (const e of c.enemies) {
    if (e.hp <= 0) continue;
    e.block = 0;
    tickVirus(ctx, e);
    if (isOver(ctx)) return;
    tickBleed(ctx, e);
    if (isOver(ctx)) return;
    if (e.hp <= 0) continue;
    const def = enemyDefOf(e);
    const move = def.moves.find((m) => m.id === e.intent.moveId) ?? def.moves[0];
    if (move) {
      ctx.ev.push({ type: 'enemy_move', enemyUid: e.uid, moveId: move.id });
      for (const eff of move.effects) {
        if (isOver(ctx) || e.hp <= 0) break;
        applyEnemyEffect(ctx, e, def, eff);
      }
      e.moveHistory.push(move.id);
    }
    if (isOver(ctx)) return;
    if (e.hp > 0) {
      endOfTurnStatuses(ctx, e);
      if (isOver(ctx)) return;
      planNextMove(ctx, e);
    }
  }
  startPlayerTurn(ctx);
}

// ---------- расходники ----------

/**
 * Выпить расходник в бою. Урон расходников «сырой» (без Разгона/Лага игрока), но Брешь и Метка цели учитываются.
 * Эффекты с target 'enemy' бьют по выбранной цели (targetUid обязателен у potion.target === 'enemy').
 */
export function usePotionInCombat(ctx: CombatCtx, potion: PotionDef, targetUid: string | undefined): void {
  let chosen: EnemyState | undefined;
  if (potion.target === 'enemy') {
    chosen = ctx.c.enemies.find((e) => e.uid === targetUid && e.hp > 0);
    if (!chosen) throw new InvalidActionError(`Potion ${potion.id} needs a living enemy target`);
  }
  for (const eff of potion.effects) {
    if (isOver(ctx)) break;
    const kind = 'target' in eff ? eff.target : undefined;
    const enemyKind = kind === 'enemy' || kind === 'all_enemies' || kind === 'random_enemy';
    if (eff.type === 'damage' && enemyKind) {
      for (let t = 0; t < (eff.times ?? 1) && !isOver(ctx); t++) {
        for (const e of enemyTargets(ctx, kind, chosen)) attack(ctx, null, e, eff.amount, true);
      }
    } else if (eff.type === 'apply_status' && enemyKind) {
      for (const e of enemyTargets(ctx, kind, chosen)) applyStatus(ctx, e, eff.status, eff.amount);
    } else applyRelicEffect(ctx, eff);
  }
  if (!isOver(ctx)) refreshIntents(ctx);
}
