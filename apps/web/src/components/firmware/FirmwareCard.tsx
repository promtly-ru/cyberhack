import type { FirmwareDef, FirmwareRunState } from '../../ui-adapter/contract';
import { firmwareEffectText, firmwareNeeds } from '../../ui-adapter/contract';
import { Icon } from '../Icon';
import { cardName, RARITY_NAME, TYPE_ICON, TYPE_NAME, unlockHint } from './labels';
import '../../styles/firmware-ui.css';

/** Карточка прошивки в стиле карты: рамка по редкости, тип, статус в забеге. */
export function FirmwareCard({ def, st, locked, onClick, selected, compact }: { def: FirmwareDef; st: FirmwareRunState; locked?: boolean; onClick?: () => void; selected?: boolean; compact?: boolean }) {
  const status = st.upgraded ? 'Улучшена' : st.owned ? 'В забеге' : '';
  const needs = firmwareNeeds(def.id);
  const have = needs.filter((n) => n.have).length;
  return (
    <button
      type="button"
      className={`fwc fwc--${def.rarity} fwc--t-${def.type}${locked ? ' is-locked' : ''}${selected ? ' is-selected' : ''}${compact ? ' fwc--compact' : ''}`}
      onClick={onClick}
      data-testid="firmware-card"
      aria-label={`${def.name}, ${RARITY_NAME[def.rarity]}, ${TYPE_NAME[def.type]}${locked ? ', закрыта' : status ? `, ${status.toLowerCase()}` : ''}`}
    >
      <span className="fwc__head">
        <span className="fwc__type">
          <Icon name={TYPE_ICON[def.type]} size={14} />
          <span className="fwc__type-name">{TYPE_NAME[def.type]}</span>
        </span>
        {locked ? <Icon name="lock" size={16} /> : status ? <span className="fwc__lvl mono">{status}</span> : null}
      </span>
      <span className="fwc__art" aria-hidden>
        <Icon name={def.icon} size={40} strokeWidth={1.4} />
      </span>
      <b className="fwc__name">
        {def.name}
        {st.upgraded ? '+' : ''}
      </b>
      <span className="fwc__rarity">{RARITY_NAME[def.rarity]}</span>
      <span className="fwc__desc">{locked ? unlockHint(def) : firmwareEffectText(def, st.upgraded)}</span>
      {needs.length && !compact ? (
        <span className="fwc__needs" title={needs.map((n) => cardName(n.cardId)).join(', ')}>
          <Icon name="deck" size={12} /> {st.owned ? `Карты в колоде: ${have}/${needs.length}` : `Нужны карты: ${needs.map((n) => cardName(n.cardId)).join(', ')}`}
        </span>
      ) : null}
    </button>
  );
}
