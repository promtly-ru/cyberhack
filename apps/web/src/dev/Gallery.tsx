import { getContent } from '@cyberhack/engine';
import type { CSSProperties } from 'react';
import { EnemyArt, accentColor, resolveArt } from '../components/EnemyArt';

const ACTS = ['Зона 1 — Корпоративный периметр', 'Зона 2 — Ядро датацентра', 'Зона 3 — Сердце ИИ', 'Зона 4 — Ядро Сингулярности'];

export default function Gallery() {
  const defs = getContent().data.enemies;
  const only = new URLSearchParams(location.search).get('act');
  return (
    <div style={{ background: '#05060f', color: '#e6f1ff', fontFamily: 'monospace', fontSize: 11 }}>
      {[1, 2, 3, 4].filter((a) => !only || Number(only) === a).map((act) => {
        const list = defs.filter((d) => d.act === act).sort((a, b) => ['normal', 'elite', 'boss'].indexOf(a.tier) - ['normal', 'elite', 'boss'].indexOf(b.tier));
        return (
          <section key={act} className="combat" data-act={act} style={{ height: 'auto', minHeight: 0, overflow: 'hidden', padding: 12 }}>
            <div className="zone-bg" aria-hidden="true" />
            <h3 style={{ position: 'relative', zIndex: 2, margin: '0 0 8px' }}>{ACTS[act - 1]}</h3>
            <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10 }}>
              {list.map((d) => {
                const r = resolveArt(d.id, d.tier);
                const sz = d.tier === 'boss' ? 170 : d.tier === 'elite' ? 140 : 110;
                return (
                  <div key={d.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: accentColor(d.id, d.tier), '--unit-color': accentColor(d.id, d.tier) } as CSSProperties}>
                    <div style={{ width: sz, height: sz }}><EnemyArt defId={d.id} tier={d.tier} /></div>
                    <div style={{ color: '#e6f1ff', textAlign: 'center' }}>{d.id}<br />{r.family} / {d.tier}</div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
