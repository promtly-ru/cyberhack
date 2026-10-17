import { afterAll, describe, expect, it } from 'vitest';
import { fixtureContent } from '../__fixtures__/content';
import {
  dailySeed,
  describeCard,
  getCardDef,
  getClassDef,
  getEncounterDef,
  getEnemyDef,
  getEventDef,
  getRelicDef,
  getStatusDef,
  listClasses,
} from '../index';
import { defaultContent, getContent, resetContent, setContentForTests, validateContent } from './index';

afterAll(() => resetContent());

describe('content', () => {
  it('фикстуры валидны', () => {
    expect(validateContent(fixtureContent())).toEqual([]);
  });

  it('реальный JSON загружается как массивы', () => {
    for (const v of Object.values(defaultContent)) expect(Array.isArray(v)).toBe(true);
    resetContent();
    expect(Array.isArray(validateContent())).toBe(true);
  });

  it('находит дубли и битые ссылки', () => {
    const c = fixtureContent();
    c.cards.push({ ...c.cards[0]!, effects: [{ type: 'apply_status', status: 'nope', amount: 1 }] });
    c.cards.push({
      ...c.cards[1]!,
      id: 'bad_card',
      classId: 'alien' as never,
      cost: -5,
      effects: [{ type: 'add_card', cardId: 'missing', to: 'hand' }, { type: 'boom' } as never],
      upgrade: { effects: [{ type: 'draw' } as never] },
    });
    c.enemies.push({
      id: 'bad_enemy',
      name: 'x',
      tier: 'normal',
      act: 1,
      hp: [5, 1],
      moves: [{ id: 'm', name: 'm', intent: 'attack', effects: [] }, { id: 'm', name: 'm', intent: 'attack', effects: [] }],
      ai: { kind: 'cycle', order: ['m', 'ghost_move'] },
    });
    c.enemies.push({ id: 'bad_enemy2', name: 'x', tier: 'normal', act: 1, hp: [1, 2], moves: [], ai: { kind: 'random', weights: { zzz: 0 } } });
    c.enemies.push({ id: 'bad_enemy3', name: 'x', tier: 'normal', act: 1, hp: [1, 2], moves: [{ id: 'a', name: 'a', intent: 'attack', effects: [] }], ai: { kind: 'cycle', order: [] } });
    c.enemies.push({ id: 'bad_enemy4', name: 'x', tier: 'normal', act: 1, hp: [1, 2], moves: [{ id: 'a', name: 'a', intent: 'attack', effects: [] }], ai: { kind: 'weird' } as never });
    c.relics.push({ ...c.relics[0]!, id: 'bad_relic', trigger: 'never' as never, every: 0, effects: 'x' as never });
    c.classes.push({ ...c.classes[0]!, id: 'ghost', startingDeck: ['missing_card'], startingRelic: 'missing_relic' });
    c.classes.push({ ...c.classes[0]!, id: 'pirate' as never, startingDeck: [] });
    c.events.push({ id: 'bad_event', name: 'x', text: 'x', options: [] });
    c.encounters.push({ id: 'bad_enc', act: 1, tier: 'normal', enemies: ['nobody'] });
    c.encounters.push({ id: 'empty_enc', act: 1, tier: 'normal', enemies: [] });
    c.statuses.push({ id: 'confused', name: 'x', description: '', kind: 'debuff', stacking: 'duration' });
    c.cards.push({ ...c.cards[0]!, id: '' });
    c.encounters = c.encounters.filter((e) => !(e.act === 3 && e.tier === 'boss'));

    const errors = validateContent(c).join('\n');
    expect(errors).toContain('дубль id "strike"');
    expect(errors).toContain('неизвестный статус "nope"');
    expect(errors).toContain('неизвестная карта "missing"');
    expect(errors).toContain('неизвестный тип эффекта');
    expect(errors).toContain('неизвестный classId');
    expect(errors).toContain('некорректная стоимость');
    expect(errors).toContain('amount не число');
    expect(errors).toContain('некорректный hp');
    expect(errors).toContain('неизвестный move "ghost_move"');
    expect(errors).toContain('нет moves');
    expect(errors).toContain('нет положительных ai.weights');
    expect(errors).toContain('пустой ai.order');
    expect(errors).toContain('неизвестный ai.kind');
    expect(errors).toContain('неизвестный trigger');
    expect(errors).toContain('every должен быть');
    expect(errors).toContain('effects не массив');
    expect(errors).toContain('неизвестную карту "missing_card"');
    expect(errors).toContain('неизвестная стартовая реликвия');
    expect(errors).toContain('неизвестный id класса');
    expect(errors).toContain('пустая стартовая колода');
    expect(errors).toContain('event "bad_event": нет options');
    expect(errors).toContain('неизвестный враг "nobody"');
    expect(errors).toContain('encounter "empty_enc": нет врагов');
    expect(errors).toContain('"confused" не поддерживается');
    expect(errors).toContain('элемент без id');
    expect(errors).toContain('нет встреч tier "boss" для акта 3');
  });

  it('геттеры берут данные из подменённого контента и бросают на неизвестный id', () => {
    setContentForTests(fixtureContent());
    expect(getCardDef('strike').name).toBe('strike');
    expect(getEnemyDef('a1_firewall').tier).toBe('normal');
    expect(getRelicDef('r_starter').trigger).toBe('combat_end');
    expect(getStatusDef('virus').kind).toBe('debuff');
    expect(getEventDef('ev_cache').options.length).toBe(2);
    expect(getEncounterDef('e1_boss').tier).toBe('boss');
    expect(getClassDef('netrunner').maxHp).toBe(70);
    expect(listClasses().map((c) => c.id)).toEqual(['netrunner', 'phreaker']);
    expect(() => getCardDef('nope')).toThrow(/Unknown card/);
    expect(() => getEnemyDef('nope')).toThrow();
    expect(() => getRelicDef('nope')).toThrow();
    expect(() => getStatusDef('nope')).toThrow();
    expect(() => getEventDef('nope')).toThrow();
    expect(() => getClassDef('ghost')).toThrow();
    expect(getContent().cards.size).toBeGreaterThan(10);
  });

  it('describeCard подставляет числа и берёт upgrade.description', () => {
    setContentForTests(fixtureContent());
    expect(describeCard('strike', false)).toBe('Нанести 6 урона.');
    expect(describeCard('strike', true)).toBe('Нанести 9 урона.');
    expect(describeCard('defend', true)).toBe('Получить 8 блока!');
    expect(describeCard('bash', false)).toBe('8 урона, 2 уязвимости.');
    expect(describeCard('ping_storm', false)).toBe('3×3 случайным.');
    expect(describeCard('purge', false)).toBe('4 блока, добрать 1. Сжечь.');
    expect(describeCard('battery', false)).toBe('+2 энергии.');
    expect(describeCard('cleanup', false)).toBe('Сжечь 1.');
    expect(describeCard('patch', false)).toBe('Лечение 4.');
    expect(() => describeCard('nope', false)).toThrow();
  });

  it('dailySeed', () => {
    expect(dailySeed(new Date('2026-10-18T12:00:00Z'))).toBe('daily-2026-10-18');
  });

  it('buildIndex строит индексы по id', async () => {
    const { buildIndex } = await import('./index');
    const idx = buildIndex(fixtureContent());
    expect(idx.cards.get('strike')?.id).toBe('strike');
  });
});
