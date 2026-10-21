import { describe, expect, it } from 'vitest';
import { enterCombat, setupCombat, useContent } from './__fixtures__/helpers';
import { FIRMWARES, firmwareEffects, firmwareLevel, getFirmware, partialEffects } from './firmware';
import { applyAction } from './run';

useContent();

describe('прошивки: уровни', () => {
  const fw = getFirmware('fw_overdrive')!;
  it('уровень по числу карт', () => {
    expect(firmwareLevel(fw, [])).toBe(0);
    expect(firmwareLevel(fw, [fw.needs[0]!])).toBe(0);
    expect(firmwareLevel(fw, fw.needs.slice(0, 2))).toBe(1);
    expect(firmwareLevel(fw, fw.needs)).toBe(2);
  });
  it('частичный бонус слабее и не содержит энергии/добора', () => {
    for (const f of FIRMWARES) {
      const p = partialEffects(f);
      expect(p.length).toBeGreaterThan(0);
      expect(p.some((e) => e.type === 'gain_energy' || e.type === 'draw' || e.type === 'add_card')).toBe(false);
      expect(firmwareEffects(f, 0)).toHaveLength(0);
      expect(firmwareEffects(f, 2)).toBe(f.effects);
    }
    expect(partialEffects(getFirmware('fw_plague')!)).toEqual([{ type: 'apply_status', status: 'virus', amount: 4, target: 'all_enemies' }]);
  });
  it('turn_end: био-синхронизатор лечит в конце хода (на 2 HP больше, чем без него)', () => {
    const f = getFirmware('fw_biosync')!;
    const run = (withFw: boolean) => {
      const s = enterCombat();
      if (withFw) {
        s.firmwares = [f.id];
        s.deck.push(...f.needs.map((defId, i) => ({ uid: `fw${i}`, defId, upgraded: false })));
      }
      setupCombat(s, { hand: [], playerHp: 20 });
      const r = applyAction(s, { type: 'end_turn' }).state;
      return r.combat!.player.hp;
    };
    expect(run(true) - run(false)).toBe(2);
  });
});
