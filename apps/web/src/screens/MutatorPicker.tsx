import { useState } from 'react';
import { MUTATORS, MUTATOR_SCORE_CAP, mutatorWarnings } from '../game/engine';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { sfx } from '../audio/sfx';

/** Суммарный бонус к счёту выбранных мутаторов, в процентах. */
export function mutatorBonusPct(ids: readonly string[]): number {
  const sum = ids.reduce((acc, id) => acc + (MUTATORS.find((m) => m.id === id)?.scoreBonus ?? 0), 0);
  return Math.round(Math.min(MUTATOR_SCORE_CAP, sum) * 100);
}

/** Выбор мутаторов забега (необязательно). Свёрнут по умолчанию, чтобы не перегружать экран новичку. */
export function MutatorPicker({ value, onChange, zeroDay = false }: { value: readonly string[]; onChange: (ids: string[]) => void; zeroDay?: boolean }) {
  const [open, setOpen] = useState(value.length > 0);
  const toggle = (id: string) => {
    sfx('click');
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const bonus = mutatorBonusPct(value);
  const warnings = mutatorWarnings(value, zeroDay);
  return (
    <section className="cs-asc cs-mutators" aria-label="Мутаторы забега" data-testid="mutators">
      <div className="cs-asc__head">
        <button
          className="cs-mutators__toggle"
          aria-expanded={open}
          onClick={() => {
            sfx('click');
            setOpen((o) => !o);
          }}
        >
          <h2 className="section-title">
            Мутаторы <span className="muted small">(необязательно)</span>
          </h2>
          <Icon name={open ? 'close' : 'flag'} size={16} />
        </button>
        <span className="muted small">
          {value.length
            ? `Выбрано: ${value.length}${bonus > 0 ? ` · бонус к счёту +${bonus}%` : ''}`
            : 'Особые правила для забега: испытания и необычные условия. Ежедневный взлом всегда без мутаторов.'}
        </span>
      </div>
      {open ? (
        <div className="mutator-list" role="group" aria-label="Мутаторы">
          {MUTATORS.map((m) => {
            const on = value.includes(m.id);
            return (
              <button
                key={m.id}
                role="checkbox"
                aria-checked={on}
                className={`mutator-chip${on ? ' is-selected' : ''}`}
                data-testid="mutator-chip"
                data-mutator={m.id}
                onClick={() => toggle(m.id)}
                {...tip(m.name, `${m.description}${m.scoreBonus > 0 ? ` Бонус к счёту +${Math.round(m.scoreBonus * 100)}%.` : ''}`)}
              >
                <span className="mutator-chip__check" aria-hidden="true">
                  {on ? <Icon name="check" size={14} /> : null}
                </span>
                <span className="mutator-chip__text">
                  <b>
                    {m.name}
                    {m.tag ? <i className={`mutator-chip__tag mutator-chip__tag--${m.tag}`}>{m.tag === 'risk' ? 'риск' : 'обмен'}</i> : null}
                  </b>
                  <small>{m.description}</small>
                </span>
                {m.scoreBonus > 0 ? <span className="mutator-chip__bonus mono">+{Math.round(m.scoreBonus * 100)}%</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {warnings.length ? (
        <ul className="mutator-warnings" role="status" data-testid="mutator-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
