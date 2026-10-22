import { useState } from 'react';
import { firmwareStateOf, getFirmwareDef, pickFirmwareChoice, skipFirmwareChoice, usePendingFirmwareChoice } from '../ui-adapter/contract';
import { FirmwareCard } from '../components/firmware/FirmwareCard';
import { Icon } from '../components/Icon';
import '../styles/firmware-ui.css';

/** Награда «выбери 1 из 3» прошивок: показывается, пока есть отложенный выбор (metaExtra.pendingFirmwareChoice). */
export function FirmwareRewardScreen() {
  const choices = usePendingFirmwareChoice();
  const [picked, setPicked] = useState<string | null>(null);
  if (!choices?.length) return null;
  const defs = choices.map(getFirmwareDef).filter((d) => d !== undefined);
  const done = (pick: boolean) => {
    if (pick && picked) pickFirmwareChoice(picked);
    else skipFirmwareChoice();
    setPicked(null);
  };
  return (
    <div className="fw-reward" role="dialog" aria-modal="true" aria-label="Награда: прошивка" data-testid="firmware-reward">
      <div className="fw-reward__inner">
        <h2 className="fw-reward__title">
          <Icon name="firmware" size={26} /> Выберите прошивку
        </h2>
        <p className="muted center">Новая прошивка или копия для улучшения уже имеющейся</p>
        <div className="fw-reward__cards" role="group" aria-label="Варианты">
          {defs.map((d) => {
            const st = firmwareStateOf(d.id);
            return (
              <div key={d.id} className="fw-reward__slot">
                <FirmwareCard def={d} st={st.level ? st : { ...st, level: 1 }} compact={!st.level} selected={picked === d.id} onClick={() => setPicked(d.id)} />
                <span className={`fw-reward__tag${st.level ? '' : ' is-new'}`}>{st.level ? '+1 копия' : 'Новая'}</span>
              </div>
            );
          })}
        </div>
        <div className="fw-reward__actions">
          <button type="button" className="btn btn--ghost" onClick={() => done(false)} data-testid="firmware-reward-skip">
            Пропустить
          </button>
          <button type="button" className="btn btn--primary" disabled={!picked} onClick={() => done(true)} data-testid="firmware-reward-take">
            Забрать
          </button>
        </div>
      </div>
    </div>
  );
}
