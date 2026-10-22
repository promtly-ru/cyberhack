import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import cardsFirmware from './content/cards-firmware.json';
import { getContent, resetContent } from './content';
import { enterCombat, setupCombat } from './__fixtures__/helpers';
import { setContentForTests } from './content';
import { fixtureContent } from './__fixtures__/content';
import {
  addFirmwareCopy,
  canUpgrade,
  copiesForNextLevel,
  FIRMWARE_RARITY_CONFIG,
  firmwareEffect,
  firmwareRunLevels,
  getFirmware,
  listAvailableFirmwares,
  listFirmwares,
  lockableFirmwares,
  MAX_FIRMWARE_LEVEL,
  RARITIES,
  rollableFirmwares,
  rollFirmwareChoices,
  upgradeFirmware,
  type FirmwareMeta,
} from './firmware';
import { buildCombatRewards } from './rewards';
import { getAscensionMods } from './ascension';
import { mulberry32 } from './rng';
import { applyAction, newRun } from './run';
import { getMetaAchievement } from './achievements';

beforeEach(() => resetContent());
afterAll(() => resetContent());

const EMPTY: FirmwareMeta = { unlockedFirmwares: [], firmwareCollection: {} };

/** Детерминированный ГСЧ для тестов. */
function seeded(seed = 1) {
  let st = seed;
  return {
    next() {
      const [v, s] = mulberry32(st);
      st = s;
      return v;
    },
  };
}

describe('прошивки: конфиг редкостей', () => {
  it('выше редкость → больше копий и сильнее рост на каждом уровне', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const lo = FIRMWARE_RARITY_CONFIG[RARITIES[i - 1]!];
      const hi = FIRMWARE_RARITY_CONFIG[RARITIES[i]!];
      expect(hi.weight).toBeLessThan(lo.weight);
      for (let lv = 1; lv < MAX_FIRMWARE_LEVEL; lv++) {
        expect(hi.copies[lv]!).toBeGreaterThan(lo.copies[lv]!);
        expect(hi.mult[lv]!).toBeGreaterThan(lo.mult[lv]!);
      }
    }
  });
  it('у каждой прошивки MAX уровней, 1-й бесплатный, пороги растут, эффект не слабеет', () => {
    for (const f of listFirmwares()) {
      expect(f.levels).toHaveLength(MAX_FIRMWARE_LEVEL);
      expect(f.levels[0]!.copiesNeeded).toBe(0);
      expect(f.levels[0]!.effect).toBe(f.effects);
      for (let i = 1; i < f.levels.length; i++) {
        expect(f.levels[i]!.copiesNeeded).toBeGreaterThan(f.levels[i - 1]!.copiesNeeded);
        const sum = (lv: number) => firmwareEffect(f, lv).reduce((s, e) => s + ('amount' in e ? e.amount : (e as { count?: number }).count ?? 1), 0);
        expect(sum(i + 1)).toBeGreaterThanOrEqual(sum(i));
      }
      expect(f.desc).toBe(f.description);
      expect(f.icon).toBeTruthy();
    }
  });
  it('масштаб эффектов: Цветение (common) 5 → 8 Самовосстановления на 4-м уровне', () => {
    const f = getFirmware('fw_bloom')!;
    expect(firmwareEffect(f, 1)).toEqual([{ type: 'apply_status', status: 'regen', amount: 5, target: 'self' }]);
    expect(firmwareEffect(f, 4)).toEqual([{ type: 'apply_status', status: 'regen', amount: 8, target: 'self' }]);
    expect(firmwareEffect(f, 99)).toEqual(firmwareEffect(f, MAX_FIRMWARE_LEVEL));
  });
});

describe('прошивки: копии и улучшения', () => {
  it('первая копия — в коллекцию уровнем 1, дубликат — +1 копия; исходный объект не мутируется', () => {
    const a = addFirmwareCopy(EMPTY, 'fw_bloom');
    expect(a.firmwareCollection.fw_bloom).toEqual({ id: 'fw_bloom', level: 1, copies: 0 });
    expect(EMPTY.firmwareCollection).toEqual({});
    const b = addFirmwareCopy(a, 'fw_bloom');
    expect(b.firmwareCollection.fw_bloom!.copies).toBe(1);
    expect(addFirmwareCopy(a, 'nope')).toBe(a);
  });
  it('порог: улучшение только при достаточных копиях, копии списываются', () => {
    const need = FIRMWARE_RARITY_CONFIG.common.copies[1]!;
    let s = addFirmwareCopy(EMPTY, 'fw_bloom');
    for (let i = 0; i < need - 1; i++) s = addFirmwareCopy(s, 'fw_bloom');
    expect(canUpgrade(s, 'fw_bloom')).toBe(false);
    expect(upgradeFirmware(s, 'fw_bloom')).toBe(s);
    s = addFirmwareCopy(s, 'fw_bloom', 2);
    expect(canUpgrade(s, 'fw_bloom')).toBe(true);
    const up = upgradeFirmware(s, 'fw_bloom');
    expect(up.firmwareCollection.fw_bloom).toEqual({ id: 'fw_bloom', level: 2, copies: 1 });
    expect(copiesForNextLevel(up, 'fw_bloom')).toBe(FIRMWARE_RARITY_CONFIG.common.copies[2]);
  });
  it('легендарная требует больше копий, чем обычная; на максимуме копии не копятся', () => {
    expect(copiesForNextLevel(addFirmwareCopy(EMPTY, 'fw_stolen_time'), 'fw_stolen_time')!).toBeGreaterThan(
      copiesForNextLevel(addFirmwareCopy(EMPTY, 'fw_bloom'), 'fw_bloom')!,
    );
    const max: FirmwareMeta = { unlockedFirmwares: [], firmwareCollection: { fw_bloom: { id: 'fw_bloom', level: MAX_FIRMWARE_LEVEL, copies: 0 } } };
    expect(addFirmwareCopy(max, 'fw_bloom')).toBe(max);
    expect(canUpgrade(max, 'fw_bloom')).toBe(false);
  });
  it('копия закрытой прошивки открывает её; уровни для забега — только > 1', () => {
    const s = addFirmwareCopy(EMPTY, 'fw_zero_hour');
    expect(s.unlockedFirmwares).toContain('fw_zero_hour');
    expect(firmwareRunLevels(s)).toEqual({});
    const lv = { ...s, firmwareCollection: { ...s.firmwareCollection, fw_zero_hour: { id: 'fw_zero_hour', level: 3, copies: 0 } } };
    expect(firmwareRunLevels(lv)).toEqual({ fw_zero_hour: 3 });
  });
});

describe('прошивки: закрытые не выпадают', () => {
  it('listAvailableFirmwares: закрытые скрыты, пока не открыты', () => {
    const locked = lockableFirmwares();
    expect(locked.length).toBeGreaterThanOrEqual(5);
    const ids = listAvailableFirmwares(EMPTY).map((f) => f.id);
    for (const id of locked) expect(ids).not.toContain(id);
    expect(listAvailableFirmwares({ unlockedFirmwares: [locked[0]!], firmwareCollection: {} }).map((f) => f.id)).toContain(locked[0]);
  });
  it('rollFirmwareChoices: 3 разные, только открытые, без максимальных, детерминированно', () => {
    for (let seed = 1; seed < 200; seed++) {
      const ch = rollFirmwareChoices(EMPTY, seeded(seed));
      expect(ch).toHaveLength(3);
      expect(new Set(ch).size).toBe(3);
      for (const id of ch) expect(getFirmware(id)!.unlock).toBeUndefined();
    }
    expect(rollFirmwareChoices(EMPTY, seeded(7))).toEqual(rollFirmwareChoices(EMPTY, seeded(7)));
    const avail = listAvailableFirmwares(EMPTY);
    const allMaxedButTwo: FirmwareMeta = {
      unlockedFirmwares: [],
      firmwareCollection: Object.fromEntries(avail.slice(2).map((f) => [f.id, { id: f.id, level: MAX_FIRMWARE_LEVEL, copies: 0 }])),
    };
    expect(rollFirmwareChoices(allMaxedButTwo, seeded(3)).sort()).toEqual(avail.slice(0, 2).map((f) => f.id).sort());
  });
  it('шансы по редкости: обычные выпадают чаще редких, легендарные — реже всех', () => {
    const all: FirmwareMeta = { unlockedFirmwares: lockableFirmwares(), firmwareCollection: {} };
    const rng = seeded(42);
    const n: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const id = rollFirmwareChoices(all, rng, 1)[0]!;
      const r = getFirmware(id)!.rarity;
      n[r] = (n[r] ?? 0) + 1;
    }
    expect(n.common!).toBeGreaterThan(n.uncommon!);
    expect(n.uncommon!).toBeGreaterThan(n.rare!);
    expect(n.rare!).toBeGreaterThan(n.legendary ?? 0);
    expect(n.epic!).toBeGreaterThan(n.legendary ?? 0);
  });
  it('забег: без открытия закрытые прошивки в locked и не попадают в награды', () => {
    const s = newRun({ seed: 'lock', classId: 'phreaker', unlocked: { cards: [], relics: [] } });
    expect(s.locked!.firmwares).toContain('fw_zero_hour');
    expect(rollableFirmwares(s).map((f) => f.id)).not.toContain('fw_zero_hour');
    const mods = getAscensionMods(0);
    for (let i = 0; i < 60; i++) {
      const r = newRun({ seed: `lock${i}`, classId: 'phreaker', unlocked: { cards: [], relics: [] } });
      for (const it of buildCombatRewards(r, 'elite', mods)) if (it.kind === 'firmware') expect(r.locked!.firmwares).not.toContain(it.firmwareId);
    }
    const open = newRun({ seed: 'lock', classId: 'phreaker', unlocked: { firmwares: ['fw_zero_hour'] } });
    expect(rollableFirmwares(open).map((f) => f.id)).toContain('fw_zero_hour');
    // Без опции unlocked (еженедельный вызов, тесты) открыто всё
    expect(newRun({ seed: 'lock', classId: 'phreaker' }).locked).toBeUndefined();
  });
  it('мета-уровни передаются в забег: неизвестные id и уровень 1 отбрасываются', () => {
    const s = newRun({ seed: 'lv', classId: 'netrunner', firmwareLevels: { fw_bloom: 3, fw_miner: 1, nope: 4, fw_ronin: 99 } });
    expect(s.firmwareLevels).toEqual({ fw_bloom: 3, fw_ronin: MAX_FIRMWARE_LEVEL });
    expect(newRun({ seed: 'lv', classId: 'netrunner' }).firmwareLevels).toBeUndefined();
  });
});

describe('прошивки: мета-уровень в бою', () => {
  beforeEach(() => setContentForTests(fixtureContent()));
  it('Биосинхронизатор 4-го уровня лечит 3 HP вместо 2', () => {
    const f = getFirmware('fw_biosync')!;
    const run = (level?: number) => {
      const s = enterCombat();
      s.firmwares = [f.id];
      if (level) s.firmwareLevels = { [f.id]: level };
      s.deck.push(...f.needs.map((defId, i) => ({ uid: `fw${i}`, defId, upgraded: false })));
      setupCombat(s, { hand: [], playerHp: 20 });
      return applyAction(s, { type: 'end_turn' }).state.combat!.player.hp;
    };
    expect(run(4) - run()).toBe(1);
  });
});

describe('контент прошивок', () => {
  it('15–25 новых прошивок, все карты из needs существуют, все редкости представлены', () => {
    const cards = getContent().cards;
    const all = listFirmwares();
    const fresh = all.slice(all.findIndex((f) => f.id === 'fw_vent_cycle'));
    expect(fresh.length).toBeGreaterThanOrEqual(15);
    expect(fresh.length).toBeLessThanOrEqual(25);
    for (const f of all) for (const id of f.needs) expect(cards.has(id), `${f.id}: ${id}`).toBe(true);
    for (const r of RARITIES) expect(all.some((f) => f.rarity === r), r).toBe(true);
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  });
  it('20–30 новых карт, каждая нужна какой-то прошивке', () => {
    const list = cardsFirmware as { id: string }[];
    expect(list.length).toBeGreaterThanOrEqual(20);
    expect(list.length).toBeLessThanOrEqual(30);
    const needed = new Set(listFirmwares().flatMap((f) => f.needs));
    for (const c of list) expect(needed.has(c.id), c.id).toBe(true);
  });
  it('unlock ссылается на ачивку, которая выдаёт эту прошивку', () => {
    for (const f of listFirmwares()) {
      if (!f.unlock) continue;
      const a = getMetaAchievement(f.unlock);
      expect(a, f.id).toBeDefined();
      expect(a!.reward).toEqual({ kind: 'firmware', id: f.id });
    }
  });
});
