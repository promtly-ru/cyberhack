import { useState } from 'react';
import { Modal } from '../components/Bits';
import { useSettings, type AnimSpeed, type MotionPref } from '../ui/settings';
import { useUi } from '../ui/uiStore';
import { useGame } from '../game/store';
import { sfx } from '../audio/sfx';

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => { sfx('click'); onChange(v); }}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal() {
  const s = useSettings();
  const close = () => useUi.getState().openSettings(false);
  const view = useGame((g) => g.view);
  const run = useGame((g) => g.run);
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title="Настройки" onClose={close}>
      <div className="settings">
        <label className="field">
          <span>Громкость · {Math.round(s.volume * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => s.set({ volume: Number(e.target.value) })} onPointerUp={() => sfx('hit')} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.muted} onChange={(e) => s.set({ muted: e.target.checked })} />
          <span>Без звука</span>
        </label>
        <div className="field">
          <span>Скорость анимаций</span>
          <Seg<AnimSpeed> label="Скорость" value={s.animSpeed} onChange={(v) => s.set({ animSpeed: v })} options={[[1, 'Обычная'], [1.5, 'Быстрая'], [2.5, 'Турбо']]} />
        </div>
        <div className="field">
          <span>Движение</span>
          <Seg<MotionPref> label="Движение" value={s.motion} onChange={(v) => s.set({ motion: v })} options={[['system', 'Как в системе'], ['reduced', 'Меньше'], ['full', 'Полное']]} />
        </div>
        <label className="toggle">
          <input type="checkbox" checked={s.scanlines} onChange={(e) => s.set({ scanlines: e.target.checked })} />
          <span>Сканлайны (эффект ЭЛТ)</span>
        </label>
        {view === 'run' && run?.status === 'active' ? (
          <div className="settings__run">
            <button className="btn btn--ghost" onClick={() => { close(); useGame.getState().toMenu(); }}>
              Выйти в меню
            </button>
            {confirm ? (
              <button className="btn btn--danger" onClick={() => { close(); void useGame.getState().abandonRun(); }}>
                Точно сдаться?
              </button>
            ) : (
              <button className="btn btn--danger" onClick={() => setConfirm(true)}>
                Сдаться
              </button>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
