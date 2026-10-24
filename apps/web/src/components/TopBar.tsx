import { useState } from 'react';
import type { RunState } from '../game/engine';
import { Icon } from './Icon';
import { ImplantIcon, ImplantMenuButton, ImplantQueueOverlay } from './implants';
import { FirmwareButton } from './firmware/FirmwareModal';
import { tip } from './Tooltip';
import { CardGridModal } from './CardGridModal';
import { PotionBar } from './PotionBar';
import { getMutator } from '../game/engine';
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
        <span className={`stat stat--hp${low ? ' is-low' : ''}`} data-fx-target="player-hp" data-testid="stat-hp" tabIndex={0} aria-label={`Здоровье ${hp} из ${maxHp}`} {...tip(`Здоровье ${hp} из ${maxHp}`, 'Целостность системы. Дошло до 0 — забег окончен. Восстанавливается в безопасных узлах и некоторыми картами.')}>
          <Icon name="hp" size={18} />
          <span className="stat__label">Здоровье</span>
          <span className="mono">
            {hp}
            <span className="dim">/{maxHp}</span>
          </span>
        </span>
        <span className="stat stat--gold" data-testid="stat-gold" tabIndex={0} aria-label={`Кредиты: ${run.gold}`} {...tip(`Кредиты: ${run.gold}`, 'Деньги забега. Тратятся на чёрном рынке (магазин на карте).')}>
          <Icon name="gold" size={18} />
          <span className="stat__label">Кредиты</span>
          <span className="mono">{run.gold}</span>
        </span>
        <span className="stat stat--floor" data-testid="stat-floor" tabIndex={0} aria-label={`Этаж ${run.floor}, акт ${run.act}`} {...tip(`Этаж ${run.floor} · Акт ${run.act}: ${ACT_NAMES[run.act] ?? ''}`, `Этаж — сколько узлов карты пройдено. Акт — часть забега, в конце каждого акта ждёт босс.`)}>
          <Icon name="floor" size={18} />
          <span className="stat__label">Этаж</span>
          <span className="mono">
            {run.floor}
            <span className="dim stat__act"> · Акт {run.act}</span>
          </span>
        </span>
        {run.ascension > 0 ? (
          <span className="stat stat--asc" data-testid="stat-asc" tabIndex={0} aria-label={`Сложность ${run.ascension}`} {...tip(`Сложность ${run.ascension}`, 'Каждый уровень сложности добавляет врагам силы. Следующий уровень открывается победой.')}>
            <Icon name="skull" size={16} />
            <span className="stat__label">Сложность</span>
            <span className="mono">{run.ascension}</span>
          </span>
        ) : null}
        {run.mutators?.length ? (
          <span
            className="stat stat--mutators"
            data-testid="stat-mutators"
            tabIndex={0}
            aria-label={`Мутаторы: ${run.mutators.map((id) => getMutator(id)?.name ?? id).join(', ')}`}
            {...tip(`Мутаторы забега (${run.mutators.length})`, run.mutators.map((id) => { const m = getMutator(id); return m ? `${m.name}: ${m.description}` : id; }).join(' • '))}
          >
            <Icon name="flag" size={16} />
            <span className="mono">{run.mutators.length}</span>
          </span>
        ) : null}
        {run.weekly ? (
          <span className="stat stat--weekly" tabIndex={0} aria-label="Еженедельный вызов" {...tip('Еженедельный вызов', `Одинаковый забег для всех на неделю ${run.weekly}. Мутаторы и правило недели — в значке флага.`)}>
            <Icon name="calendar" size={16} />
          </span>
        ) : null}
      </div>
      <div className="topbar__relics" aria-label="Импланты">
        {run.relics.length ? (
          <span className="topbar__relics-label" aria-hidden="true">
            Импланты
          </span>
        ) : null}
        {run.relics.map((id) => (
          <ImplantIcon key={id} id={id} run={run} size="sm" />
        ))}
      </div>
      <div className="topbar__actions">
        <PotionBar run={run} />
        <ImplantMenuButton run={run} />
        <FirmwareButton mode="run" />
        <button
          className="icon-btn icon-btn--count"
          onClick={() => {
            sfx('click');
            setDeckOpen(true);
          }}
          aria-label={`Колода: ${run.deck.length} карт`}
          {...tip(`Колода: ${run.deck.length} карт`, 'Все карты твоего забега. Нажми, чтобы посмотреть.')}
        >
          <Icon name="deck" />
          <span className="stat__label">Колода</span>
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
      <ImplantQueueOverlay run={run} />
      {deckOpen ? <CardGridModal title="Колода" cards={run.deck} onClose={() => setDeckOpen(false)} /> : null}
    </header>
  );
}
