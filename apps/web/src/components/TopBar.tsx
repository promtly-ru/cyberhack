import { useState } from 'react';
import type { RunState } from '../game/engine';
import { Icon } from './Icon';
import { RelicIcon } from './Bits';
import { tip } from './Tooltip';
import { CardGridModal } from './CardGridModal';
import { useUi, ACT_NAMES } from '../ui/uiStore';
import { sfx } from '../audio/sfx';

export function TopBar({ run }: { run: RunState }) {
  const [deckOpen, setDeckOpen] = useState(false);
  const openSettings = useUi((s) => s.openSettings);
  const hp = run.combat ? run.combat.player.hp : run.hp;
  const maxHp = run.combat ? run.combat.player.maxHp : run.maxHp;
  const low = hp / Math.max(1, maxHp) < 0.3;
  return (
    <header className="topbar">
      <div className="topbar__stats">
        <span className={`stat stat--hp${low ? ' is-low' : ''}`} data-fx-target="player-hp" tabIndex={0} {...tip('Целостность системы', `HP ${hp} из ${maxHp}. При 0 — соединение разорвано.`)}>
          <Icon name="hp" size={18} />
          <span className="mono">
            {hp}
            <span className="dim">/{maxHp}</span>
          </span>
        </span>
        <span className="stat stat--gold" tabIndex={0} {...tip('Кредиты', 'Тратятся на чёрном рынке.')}>
          <Icon name="gold" size={18} />
          <span className="mono">{run.gold}</span>
        </span>
        <span className="stat stat--floor" tabIndex={0} {...tip(`Акт ${run.act}: ${ACT_NAMES[run.act] ?? ''}`, `Пройдено узлов: ${run.floor}`)}>
          <Icon name="floor" size={18} />
          <span className="mono">
            <span className="hide-sm">Этаж </span>
            {run.floor}
            <span className="dim"> · А{run.act}</span>
          </span>
        </span>
        {run.ascension > 0 ? (
          <span className="stat stat--asc" tabIndex={0} {...tip(`Ascension ${run.ascension}`, 'Повышенная сложность забега.')}>
            <span className="mono">A{run.ascension}</span>
          </span>
        ) : null}
        {run.daily ? (
          <span className="stat stat--daily" tabIndex={0} {...tip('Ежедневный взлом', `Сид: ${run.seed}`)}>
            <Icon name="calendar" size={16} />
          </span>
        ) : null}
      </div>
      <div className="topbar__relics" aria-label="Реликвии">
        {run.relics.map((id) => (
          <RelicIcon key={id} id={id} size="sm" />
        ))}
      </div>
      <div className="topbar__actions">
        <button
          className="icon-btn icon-btn--count"
          onClick={() => {
            sfx('click');
            setDeckOpen(true);
          }}
          aria-label={`Колода: ${run.deck.length} карт`}
          {...tip('Колода', `${run.deck.length} программ`)}
        >
          <Icon name="deck" />
          <span className="count mono">{run.deck.length}</span>
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            sfx('click');
            openSettings(true);
          }}
          aria-label="Настройки"
        >
          <Icon name="gear" />
        </button>
      </div>
      {deckOpen ? <CardGridModal title="Колода" cards={run.deck} onClose={() => setDeckOpen(false)} /> : null}
    </header>
  );
}
