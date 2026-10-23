import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import cardsFirmware from './content/cards-firmware.json';
import { getContent, resetContent } from './content';
import { enterCombat, setupCombat } from './__fixtures__/helpers';
import { setContentForTests } from './content';
import { fixtureContent } from './__fixtures__/content';
import {
  firmwareEffect,
  getFirmware,
  listAvailableFirmwares,
  listFirmwares,
  lockableFirmwares,
  RARITIES,
  rollableFirmwares,
  upgradableFirmwares,
  type FirmwareMeta,
} from './firmware';
import { buildCombatRewards } from './rewards';
import { getAscensionMods } from './ascension';
import { applyAction, getLegalActions, newRun } from './run';
import { getMetaAchievement } from './achievements';

beforeEach(() => resetContent());
afterAll(() => resetContent());

const EMPTY: FirmwareMeta = { unlockedFirmwares: [] };

describe('прошивки: закрытые не выпадают', () => {
  it('listAvailableFirmwares: закрытые скрыты, пока не открыты', () => {
    const locked = lockableFirmwares();
    expect(locked.length).toBeGreaterThanOrEqual(5);
    const ids = listAvailableFirmwares(EMPTY).map((f) => f.id);
    for (const id of locked) expect(ids).not.toContain(id);
    expect(listAvailableFirmwares({ unlockedFirmwares: [locked[0]!] }).map((f) => f.id)).toContain(locked[0]);
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
    // Прошивка открыта, но её карты закрыты — не выпадает; открыли карты — выпадает
    const fwOnly = newRun({ seed: 'lock', classId: 'phreaker', unlocked: { cards: [], relics: [], firmwares: ['fw_zero_hour'] } });
    expect(rollableFirmwares(fwOnly).map((f) => f.id)).not.toContain('fw_zero_hour');
    const open = newRun({ seed: 'lock', classId: 'phreaker', unlocked: { cards: getFirmware('fw_zero_hour')!.needs, relics: [], firmwares: ['fw_zero_hour'] } });
    expect(rollableFirmwares(open).map((f) => f.id)).toContain('fw_zero_hour');
    // Без опции unlocked (еженедельный вызов, тесты) открыто всё
    expect(newRun({ seed: 'lock', classId: 'phreaker' }).locked).toBeUndefined();
  });
});

describe('прошивки: нужные карты должны быть доступны', () => {
  it('прошивка с закрытой картой не выпадает; карта уже в колоде — выпадает', () => {
    const s = newRun({ seed: 'need', classId: 'netrunner', unlocked: { cards: [], relics: [], firmwares: lockableFirmwares() } });
    const fw = getFirmware('fw_overdrive')!;
    expect(fw.needs.some((id) => s.locked!.cards.includes(id))).toBe(true);
    const ids = () => rollableFirmwares(s).map((f) => f.id);
    expect(ids()).not.toContain('fw_overdrive');
    for (const f of rollableFirmwares(s)) for (const id of f.needs) expect(s.locked!.cards, `${f.id}: ${id}`).not.toContain(id);
    for (const id of fw.needs) if (s.locked!.cards.includes(id)) s.deck.push({ uid: `n_${id}`, defId: id, upgraded: false });
    expect(ids()).toContain('fw_overdrive');
  });
});

describe('прошивки: улучшение в забеге', () => {
  it('улучшенные эффекты сильнее базовых у каждой прошивки', () => {
    const sum = (es: readonly { type: string; amount?: number }[]) => es.reduce((n, e) => n + (e.amount ?? 0), 0);
    for (const f of listFirmwares()) expect(sum(firmwareEffect(f, true)), f.id).toBeGreaterThan(sum(firmwareEffect(f, false)));
  });
  it('привал: прошивку можно улучшить один раз, новый забег начинается без улучшений', () => {
    let s = newRun({ seed: 'fwup', classId: 'netrunner' });
    s.firmwares = ['fw_bloom', 'fw_miner'];
    s.screen = { kind: 'rest' };
    s = applyAction(s, { type: 'rest_upgrade' }).state;
    expect(s.screen.kind).toBe('select_deck_card');
    expect(getLegalActions(s)).toContainEqual({ type: 'upgrade_firmware', firmwareId: 'fw_bloom' });
    const r = applyAction(s, { type: 'upgrade_firmware', firmwareId: 'fw_bloom' });
    s = r.state;
    expect(r.events).toContainEqual({ type: 'firmware_upgraded', firmwareId: 'fw_bloom' });
    expect(s.upgradedFirmwares).toEqual(['fw_bloom']);
    expect(upgradableFirmwares(s)).toEqual(['fw_miner']);
    s.screen = { kind: 'rest' };
    s = applyAction(s, { type: 'rest_upgrade' }).state;
    expect(() => applyAction(s, { type: 'upgrade_firmware', firmwareId: 'fw_bloom' })).toThrow();
    expect(() => applyAction(s, { type: 'upgrade_firmware', firmwareId: 'fw_siege' })).toThrow();
    expect(newRun({ seed: 'fwup', classId: 'netrunner' }).upgradedFirmwares).toBeUndefined();
  });
});

describe('прошивки: улучшение в бою', () => {
  beforeEach(() => setContentForTests(fixtureContent()));
  it('улучшенный Биосинхронизатор лечит 3 HP вместо 2', () => {
    const f = getFirmware('fw_biosync')!;
    const run = (upgraded: boolean) => {
      const s = enterCombat();
      s.firmwares = [f.id];
      if (upgraded) s.upgradedFirmwares = [f.id];
      s.deck.push(...f.needs.map((defId, i) => ({ uid: `fw${i}`, defId, upgraded: false })));
      setupCombat(s, { hand: [], playerHp: 20 });
      return applyAction(s, { type: 'end_turn' }).state.combat!.player.hp;
    };
    expect(run(true) - run(false)).toBe(1);
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
