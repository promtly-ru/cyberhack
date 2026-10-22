import { describe, expect, it } from 'vitest';
import { newRun } from '@cyberhack/engine';
import { defaultProfile } from '../net/profile';
import {
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
      firmwareCollection: { fw_miner: { level: 9, copies: 3.7 }, fw_zero_hour: { level: 2, copies: 1 } },
      currency: 120,
    });
    expect(m.achievements.ach_runs_1).toEqual({ completed: true, claimed: true });
    expect(m.achievements.ach_kills_1).toEqual({ completed: true, claimed: true });
    // Старая коллекция: закрываемые прошивки остаются открытыми, уровни и копии уходят
    expect(m.unlockedFirmwares).toEqual(['fw_zero_hour']);
    expect(m).not.toHaveProperty('firmwareCollection');
    expect(m.currency).toBe(120);
  });
  it('нормализация идемпотентна (сохранили → загрузили → то же самое)', () => {
    const m = normalizeMetaExtra({ achievements: { a: { completed: true }, b: { claimed: true }, c: {} }, unlockedFirmwares: ['fw_zero_hour'] });
    expect(normalizeMetaExtra(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(m.achievements).toEqual({ a: { completed: true }, b: { completed: true, claimed: true } });
  });
  it('поля v2 из профиля подхватываются; слияние берёт максимум', () => {
    expect(metaExtraFromProfile(defaultProfile())).toBeNull();
    const fromP = metaExtraFromProfile({ ...defaultProfile(), currency: 10, unlockedFirmwares: ['fw_zero_hour'] })!;
    const local = normalizeMetaExtra({ currency: 30, unlockedFirmwares: ['fw_bastion'], cosmetics: ['x'] });
    const m = mergeMetaExtra(local, fromP);
    expect(m.currency).toBe(30);
    expect(m.unlockedFirmwares).toEqual(['fw_bastion', 'fw_zero_hour']);
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
  it('опции обычного забега: закрытые прошивки закрыты, открытые передаются, улучшений нет', () => {
    setActiveMetaExtra(normalizeMetaExtra({ unlockedFirmwares: ['fw_bastion'] }));
    const o = regularRunOptions(defaultProfile(), 'engineer', 0);
    expect(o.unlocked!.firmwares).toEqual(['fw_bastion']);
    const s = newRun(o);
    expect(s.locked!.firmwares).toContain('fw_venom_lab');
    expect(s.locked!.firmwares).not.toContain('fw_bastion');
    expect(s.upgradedFirmwares).toBeUndefined();
    setActiveMetaExtra(null);
  });
  it('награды выполненных ачивок открыты в забеге ещё до «Забрать»', () => {
    const u = metaRunUnlocked({ ...defaultProfile(), lifetime: { winsBiohacker: 1 } }, null);
    expect(u.firmwares).toContain('fw_venom_lab');
  });
});
