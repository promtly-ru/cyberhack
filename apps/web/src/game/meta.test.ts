import { describe, expect, it } from 'vitest';
import { newRun } from '@cyberhack/engine';
import { defaultProfile } from '../net/profile';
import {
  applyRunToMetaExtra,
  defaultMetaExtra,
  loadMetaExtra,
  mergeMetaExtra,
  metaExtraFromProfile,
  metaRunUnlocked,
  normalizeMetaExtra,
  regularRunOptions,
  setActiveMetaExtra,
  syncMetaAchievements,
} from './meta';

const rng = (v = 0.1) => ({ next: () => v });

describe('мета v2: миграция сохранений', () => {
  it('нет данных или мусор → значения по умолчанию', () => {
    expect(normalizeMetaExtra(undefined)).toEqual(defaultMetaExtra());
    expect(normalizeMetaExtra('garbage')).toEqual(defaultMetaExtra());
    expect(normalizeMetaExtra({ currency: -5, cosmetics: [1, 'x'], firmwareCollection: { a: 'bad' } })).toEqual({
      ...defaultMetaExtra(),
      cosmetics: ['x'],
    });
    // Без localStorage (node) — не падает
    expect(loadMetaExtra('u1')).toEqual(defaultMetaExtra());
  });
  it('старый формат (v0) переносится без потерь', () => {
    const m = normalizeMetaExtra({
      achievements: ['ach_runs_1'],
      claimedAchievements: ['ach_kills_1'],
      firmwares: ['fw_bloom'],
      firmwareCollection: { fw_miner: { level: 9, copies: 3.7 }, fw_removed: { level: 2, copies: 1 } },
      currency: 120,
    });
    expect(m.achievements.ach_runs_1).toEqual({ completed: true, claimed: true });
    expect(m.achievements.ach_kills_1).toEqual({ completed: true, claimed: true });
    expect(m.firmwareCollection.fw_bloom).toEqual({ id: 'fw_bloom', level: 1, copies: 0 });
    expect(m.firmwareCollection.fw_miner).toEqual({ id: 'fw_miner', level: 4, copies: 3 });
    expect(m.firmwareCollection.fw_removed).toEqual({ id: 'fw_removed', level: 2, copies: 1 });
    expect(m.currency).toBe(120);
  });
  it('нормализация идемпотентна (сохранили → загрузили → то же самое)', () => {
    const m = normalizeMetaExtra({ achievements: { a: { completed: true }, b: { claimed: true }, c: {} }, pendingFirmwareChoice: ['fw_bloom'] });
    expect(normalizeMetaExtra(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(m.achievements).toEqual({ a: { completed: true }, b: { completed: true, claimed: true } });
  });
  it('поля v2 из профиля подхватываются; слияние берёт максимум', () => {
    expect(metaExtraFromProfile(defaultProfile())).toBeNull();
    const fromP = metaExtraFromProfile({ ...defaultProfile(), currency: 10, firmwareCollection: { fw_bloom: { level: 2, copies: 0 } } })!;
    const local = normalizeMetaExtra({ currency: 30, firmwareCollection: { fw_bloom: { level: 1, copies: 5 } }, cosmetics: ['x'] });
    const m = mergeMetaExtra(local, fromP);
    expect(m.currency).toBe(30);
    expect(m.firmwareCollection.fw_bloom).toEqual({ id: 'fw_bloom', level: 2, copies: 0 });
    expect(m.cosmetics).toEqual(['x']);
    expect(mergeMetaExtra(fromP, local)).toEqual(m);
  });
  it('старый профиль: классические достижения не трогаются, выполненное по статистике отмечается', () => {
    const p = { ...defaultProfile(), achievements: ['first_blood'], totalRuns: 3, lifetime: { enemiesKilled: 40 } };
    const { extra, newlyCompleted } = syncMetaAchievements(p, defaultMetaExtra());
    expect(newlyCompleted).toEqual(expect.arrayContaining(['ach_runs_1', 'ach_kills_1']));
    expect(extra.achievements.ach_runs_1).toEqual({ completed: true });
    expect(p.achievements).toEqual(['first_blood']);
  });
});

describe('мета v2: забег', () => {
  it('опции обычного забега: закрытые прошивки закрыты, уровни коллекции передаются', () => {
    setActiveMetaExtra(normalizeMetaExtra({ firmwareCollection: { fw_bloom: { level: 3, copies: 0 } } }));
    const o = regularRunOptions(defaultProfile(), 'biohacker', 0);
    expect(o.unlocked!.firmwares).toEqual(['fw_bloom']);
    expect(o.firmwareLevels).toEqual({ fw_bloom: 3 });
    const s = newRun(o);
    expect(s.locked!.firmwares).toContain('fw_venom_lab');
    expect(s.firmwareLevels).toEqual({ fw_bloom: 3 });
    setActiveMetaExtra(null);
    expect(regularRunOptions(defaultProfile(), 'biohacker', 0).firmwareLevels).toBeUndefined();
  });
  it('награды выполненных ачивок открыты в забеге ещё до «Забрать»', () => {
    const u = metaRunUnlocked({ ...defaultProfile(), lifetime: { winsBiohacker: 1 } }, null);
    expect(u.firmwares).toContain('fw_venom_lab');
  });
  it('конец забега: копии прошивок, «1 из 3» за босса, повтор не засчитывается', () => {
    const s = newRun({ seed: 'meta', classId: 'netrunner' });
    s.firmwares = ['fw_miner', 'fw_bloom'];
    s.status = 'lost';
    const base = normalizeMetaExtra({ firmwareCollection: { fw_miner: { level: 1, copies: 0 } } });
    const a = applyRunToMetaExtra(base, s, rng());
    expect(a.firmwareCollection.fw_miner!.copies).toBe(1);
    expect(a.firmwareCollection.fw_bloom).toEqual({ id: 'fw_bloom', level: 1, copies: 0 });
    expect(a.pendingFirmwareChoice).toBeNull();
    expect(applyRunToMetaExtra(a, s, rng())).toBe(a);
    const won = { ...s, seed: 'meta2', status: 'won' as const };
    const b = applyRunToMetaExtra(a, won, rng());
    expect(b.pendingFirmwareChoice).toHaveLength(3);
  });
});
