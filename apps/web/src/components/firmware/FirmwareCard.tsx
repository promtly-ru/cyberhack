import type { FirmwareDef, FirmwareState } from '../../ui-adapter/contract';
import { copiesForNext, firmwareEffectText } from '../../ui-adapter/contract';
import { Icon } from '../Icon';
import { RARITY_NAME, TYPE_ICON, TYPE_NAME, unlockHint } from './labels';
import '../../styles/firmware-ui.css';

/** Шкала копий до следующего уровня. */
export function CopiesBar({ def, st }: { def: FirmwareDef; st: FirmwareState }) {
  const need = copiesForNext(def, st);
  if (need === null) return <span className="fwc__copies is-max">Максимум</span>;
  const pct = Math.min(100, Math.round((st.copies / need) * 100));
  return (
    <span className={`fwc__copies${st.copies >= need ? ' is-ready' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={st.copies} aria-label={`Копии: ${st.copies} из ${need}`}>
      <span className="fwc__copies-fill" style={{ width: `${pct}%` }} />
      <em>
        {st.copies}/{need}
      </em>
    </span>
  );
}

/** Карточка прошивки в стиле карты: рамка по редкости, тип, уровень, копии. */
export function FirmwareCard({ def, st, locked, onClick, selected, compact }: { def: FirmwareDef; st: FirmwareState; locked?: boolean; onClick?: () => void; selected?: boolean; compact?: boolean }) {
  const max = def.levels.length;
  return (
    <button
      type="button"
      className={`fwc fwc--${def.rarity} fwc--t-${def.type}${locked ? ' is-locked' : ''}${selected ? ' is-selected' : ''}${compact ? ' fwc--compact' : ''}`}
      onClick={onClick}
      data-testid="firmware-card"
      aria-label={`${def.name}, ${RARITY_NAME[def.rarity]}, ${TYPE_NAME[def.type]}${locked ? ', закрыта' : `, уровень ${st.level} из ${max}`}`}
    >
      <span className="fwc__head">
        <span className="fwc__type">
          <Icon name={TYPE_ICON[def.type]} size={14} />
          <span className="fwc__type-name">{TYPE_NAME[def.type]}</span>
        </span>
        {locked ? <Icon name="lock" size={16} /> : <span className="fwc__lvl mono">{st.level ? `Ур. ${st.level}/${max}` : 'Не собрана'}</span>}
      </span>
      <span className="fwc__art" aria-hidden>
        <Icon name={def.icon} size={40} strokeWidth={1.4} />
      </span>
      <b className="fwc__name">{def.name}</b>
      <span className="fwc__rarity">{RARITY_NAME[def.rarity]}</span>
      <span className="fwc__desc">{locked ? unlockHint(def) : firmwareEffectText(def, Math.max(1, st.level))}</span>
      {!locked && st.level > 0 && !compact ? <CopiesBar def={def} st={st} /> : null}
    </button>
  );
}
