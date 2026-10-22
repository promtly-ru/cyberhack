import { useGfx, type GfxPref } from './perf-mode';

const OPTIONS: { id: GfxPref; label: string }[] = [
  { id: 'auto', label: 'Авто' },
  { id: 'lite', label: 'Экономия' },
  { id: 'full', label: 'Полная' },
];

/** Переключатель «Графика» для окна настроек. */
export function PerfToggle() {
  const pref = useGfx((s) => s.pref);
  const lite = useGfx((s) => s.lite);
  const setPref = useGfx((s) => s.setPref);
  return (
    <div className="gfx-toggle" role="radiogroup" aria-label="Графика" data-testid="gfx-toggle">
      <span className="gfx-toggle__label">
        Графика{pref === 'auto' ? <span className="gfx-toggle__hint"> · сейчас {lite ? 'экономия' : 'полная'}</span> : null}
      </span>
      <div className="gfx-toggle__opts">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={pref === o.id}
            className={`gfx-toggle__opt${pref === o.id ? ' is-on' : ''}`}
            data-testid={`gfx-${o.id}`}
            onClick={() => setPref(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
