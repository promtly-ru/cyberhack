import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImplantColor, ImplantDuration, ImplantProgress, RelicDef, RunState } from '../game/engine';
import { IMPLANT_COLOR_NAMES, tryRelicDef } from '../game/engine';
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Modal, RelicGlyph } from './Bits';
import { tip } from './Tooltip';
import { sfx } from '../audio/sfx';

const RARITY_COLOR: Record<string, ImplantColor> = { starter: 'class', common: 'gray', uncommon: 'green', rare: 'blue', boss: 'purple', shop: 'green' };

/** Цвет импланта: явный color, иначе по редкости (старый формат) */
export function implantColor(def: RelicDef | null | undefined): ImplantColor {
  if (!def) return 'gray';
  return def.color ?? RARITY_COLOR[def.rarity] ?? 'gray';
}

const COLOR_RANK: Record<ImplantColor, number> = { class: 6, gold: 5, purple: 4, blue: 3, green: 2, gray: 1, red: 0 };

export function implantGoal(d: ImplantDuration | undefined): number {
  if (!d || d.kind !== 'task') return 0;
  const t = d.task;
  return 'n' in t ? t.n : 1;
}

/** Короткий бейдж на иконке; null — без бейджа (весь забег) */
export function implantBadge(def: RelicDef | null | undefined, st: ImplantProgress | undefined): string | null {
  const d = def?.duration;
  if (!d || d.kind === 'run') return null;
  if (d.kind === 'combats') return `${st?.combatsLeft ?? d.n}б`;
  if (d.kind === 'task') return `${st?.progress ?? 0}/${implantGoal(d)}`;
  return d.event === 'boss' ? 'босс' : d.event === 'rest' ? 'привал' : 'акт';
}

function taskText(t: { kind: string; n?: number; pct?: number }): string {
  switch (t.kind) {
    case 'win_no_damage': return 'выиграть бой, не потеряв HP';
    case 'play_attacks': return `сыграть атак: ${t.n}`;
    case 'play_skills': return `сыграть навыков: ${t.n}`;
    case 'kill_enemies': return `победить врагов: ${t.n}`;
    case 'win_combats': return `выиграть боёв: ${t.n}`;
    case 'win_elite': return 'победить элиту';
    case 'end_combat_hp_above': return `закончить бой с HP не ниже ${t.pct}%`;
    default: return 'выполнить задачу';
  }
}

const isRed = (def: RelicDef | null | undefined) => def?.kind === 'debuff' || def?.color === 'red';

/** Условие словами; красный — снимается, остальные — сгорают */
export function implantCondition(def: RelicDef | null | undefined, st?: ImplantProgress): string {
  const d = def?.duration;
  if (!d || d.kind === 'run') return 'До конца забега';
  if (d.kind === 'combats') return `Боёв осталось: ${st?.combatsLeft ?? d.n}`;
  if (d.kind === 'until') return d.event === 'boss' ? 'До босса' : d.event === 'rest' ? 'До ближайшего привала' : 'До конца акта';
  return `${isRed(def) ? 'Снимется' : 'Сгорит'}, когда ${taskText(d.task)} (${st?.progress ?? 0}/${implantGoal(d)})`;
}

export function ImplantIcon({ id, run, size = 'md', onClick, focusable = true }: { id: string; run?: Pick<RunState, 'implantState'>; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; focusable?: boolean }) {
  const def = tryRelicDef(id) ?? null;
  const color = implantColor(def);
  const st = run?.implantState?.[id];
  const badge = implantBadge(def, st);
  const title = def?.name ?? id;
  const text = `${IMPLANT_COLOR_NAMES[color]} · ${def?.description ?? ''} ${implantCondition(def, st)}`;
  return (
    <span className={`relic relic--${size} imp imp--${color}`} tabIndex={focusable ? 0 : undefined} role={onClick ? 'button' : undefined} data-fx-target={`relic-${id}`} aria-label={`${title}: ${text}`} onClick={onClick} {...tip(title, text)}>
      <RelicGlyph id={id} />
      {badge ? <span className="imp__badge mono">{badge}</span> : null}
    </span>
  );
}

/** Крупная карточка; action — «Принять» или «Закрыть» */
export function ImplantCardView({ id, run, action, label, flying }: { id: string; run: RunState; action: () => void; label: string; flying?: boolean }) {
  const def = tryRelicDef(id) ?? null;
  const color = implantColor(def);
  const st = run.implantState?.[id];
  return createPortal(
    <div className="imp-overlay" role="dialog" aria-modal="true" aria-label={def?.name ?? id}>
      <div className={`imp-card imp-card--${color}${flying ? ' is-flying' : ''}`} data-testid="implant-card">
        <div className={`imp-card__glyph imp imp--${color}`}>
          <RelicGlyph id={id} />
        </div>
        <span className={`imp-card__color imp-text--${color}`}>
          {IMPLANT_COLOR_NAMES[color]} · {isRed(def) ? 'Дебафф' : 'Бафф'}
        </span>
        <h2 className="imp-card__name">{def?.name ?? id}</h2>
        <p className="imp-card__desc">{def?.description}</p>
        <p className="imp-card__cond">
          <Icon name="floor" size={14} /> {implantCondition(def, st)}
        </p>
        <button className="btn btn--primary" autoFocus onClick={action} data-testid="implant-ack">
          {label}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Очередь полученных: крупная карточка, «Принять» → ack_implant */
export function ImplantQueueOverlay({ run }: { run: RunState }) {
  const dispatch = useGame((s) => s.dispatch);
  const [flying, setFlying] = useState(false);
  const id = run.implantQueue?.[0];
  useEffect(() => setFlying(false), [id]);
  if (!id) return null;
  const accept = () => {
    sfx('select');
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      dispatch({ type: 'ack_implant' });
      return;
    }
    // Карточка летит в ряд имплантов на топбаре (data-fx-target="implant-menu")
    const target = document.querySelector('[data-fx-target="implant-menu"]')?.getBoundingClientRect();
    if (target) {
      document.documentElement.style.setProperty('--imp-fly-x', `${Math.round(target.left + target.width / 2 - innerWidth / 2)}px`);
      document.documentElement.style.setProperty('--imp-fly-y', `${Math.round(target.top + target.height / 2 - innerHeight / 2)}px`);
    }
    setFlying(true);
    window.setTimeout(() => dispatch({ type: 'ack_implant' }), 420);
  };
  return <ImplantCardView id={id} run={run} action={accept} label="Принять" flying={flying} />;
}

/** Ряд имплантов на топбаре — единственная кнопка меню имплантов. ПК: тултипы на иконках (hover); тап/клик — меню. */
export function ImplantRow({ run }: { run: RunState }) {
  const [open, setOpen] = useState(false);
  const n = run.relics.length;
  const reds = run.relics.filter((id) => implantColor(tryRelicDef(id) ?? null) === 'red').length;
  const show = () => {
    sfx('click');
    setOpen(true);
  };
  return (
    <>
      <button
        className="icon-btn icon-btn--count implant-btn"
        data-fx-target="implant-menu"
        data-testid="implant-menu-btn"
        aria-label={`Импланты: ${n}${reds ? `, красных: ${reds}` : ''}. Открыть меню имплантов`}
        onClick={show}
        {...tip(`Импланты: ${n}`, 'Все твои импланты: цвет, описание и сколько ещё действует.')}
      >
        <Icon name="crown" />
        <span className="stat__label">Импланты</span>
        <span className="count mono">{n}</span>
        {reds ? <span className="implant-btn__red mono" aria-hidden="true">{reds}</span> : null}
      </button>
      {open ? <ImplantMenu run={run} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImplantMenu({ run, onClose }: { run: RunState; onClose: () => void }) {
  const [view, setView] = useState<string | null>(null);
  const items = run.relics.map((id) => {
    const def = tryRelicDef(id) ?? null;
    return { id, def, color: implantColor(def) };
  });
  const sorted = [...items].sort((a, b) => COLOR_RANK[b.color] - COLOR_RANK[a.color]);
  const good = sorted.filter((x) => x.color !== 'red');
  const red = sorted.filter((x) => x.color === 'red');
  const chance = Math.round((run.classFullChance ?? 0.01) * 1000) / 10;
  const row = (x: (typeof items)[number]) => (
    <li key={x.id}>
      <button className={`imp-row imp-row--${x.color}`} onClick={() => setView(x.id)}>
        <ImplantIcon id={x.id} run={run} size="md" />
        <span className="imp-row__body">
          <b>{x.def?.name ?? x.id}</b>
          <small>
            {IMPLANT_COLOR_NAMES[x.color]} · {x.def?.description}
          </small>
          <small className="imp-row__cond">{implantCondition(x.def, run.implantState?.[x.id])}</small>
        </span>
      </button>
    </li>
  );
  return (
    <>
      <Modal title={`Импланты · ${items.length}`} onClose={onClose} wide>
        <div className="imp-menu">
          <p className="imp-menu__chance" data-testid="class-chance">
            Шанс полного Классового: {chance}%
          </p>
          {!items.length ? <p className="muted">Пока пусто</p> : null}
          <ul className="imp-list">{good.map(row)}</ul>
          {red.length ? (
            <>
              <h3 className="section-title imp-menu__red">Красные (вред)</h3>
              <ul className="imp-list">{red.map(row)}</ul>
            </>
          ) : null}
        </div>
      </Modal>
      {view ? <ImplantCardView id={view} run={run} action={() => setView(null)} label="Закрыть" /> : null}
    </>
  );
}
