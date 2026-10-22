import { useState } from 'react';
import { addFirmwareCopy, firmwareStateOf } from '../ui-adapter/contract';
import { useOverlays } from '../ui-adapter/overlays';
import { FirmwareCard } from '../components/firmware/FirmwareCard';
import { Icon } from '../components/Icon';
import '../styles/firmware-ui.css';

/** Награда «выбери 1 из 3» прошивок. Открывается через useOverlays.openFirmwareReward(choices, onPick). */
export function FirmwareRewardScreen() {
  const reward = useOverlays((s) => s.reward);
  const [picked, setPicked] = useState<string | null>(null);
  if (!reward) return null;
  const close = () => {
    setPicked(null);
    useOverlays.getState().openFirmwareReward(null);
  };
  const confirm = () => {
    if (!picked) return;
    addFirmwareCopy(picked);
    reward.onPick?.(picked);
    close();
  };
  return (
    <div className="fw-reward" role="dialog" aria-modal="true" aria-label="Награда: прошивка" data-testid="firmware-reward">
      <div className="fw-reward__inner">
        <h2 className="fw-reward__title">
          <Icon name="firmware" size={26} /> Выберите прошивку
        </h2>
        <p className="muted center">Новая прошивка или копия для улучшения уже имеющейся</p>
        <div className="fw-reward__cards" role="radiogroup" aria-label="Варианты">
          {reward.choices.map((d) => {
            const st = firmwareStateOf(d.id);
            return (
              <div key={d.id} className="fw-reward__slot">
                <FirmwareCard def={d} st={st.level ? st : { ...st, level: 1 }} selected={picked === d.id} onClick={() => setPicked(d.id)} />
                <span className={`fw-reward__tag${st.level ? '' : ' is-new'}`}>{st.level ? '+1 копия' : 'Новая'}</span>
              </div>
            );
          })}
        </div>
        <div className="fw-reward__actions">
          <button type="button" className="btn btn--ghost" onClick={close} data-testid="firmware-reward-skip">
            Пропустить
          </button>
          <button type="button" className="btn btn--primary" disabled={!picked} onClick={confirm} data-testid="firmware-reward-take">
            Забрать
          </button>
        </div>
      </div>
    </div>
  );
}
