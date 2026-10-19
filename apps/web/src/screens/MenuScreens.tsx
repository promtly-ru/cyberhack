import { useEffect, useState, type CSSProperties } from 'react';
import type { ClassDef, ClassId, Difficulty } from '../game/engine';
import { DIFFICULTY_INFO, dailySeed, isMockActive, listClasses, tryRelicDef, unlockSource } from '../game/engine';
import { MAX_ASCENSION, useGame } from '../game/store';
import { hasPlayedDaily, todayDailyClass } from '../game/meta';
import { Icon } from '../components/Icon';
import { PlayerArt, CLASS_COLOR } from '../components/UnitArt';
import { RelicIcon } from '../components/Bits';
import { tip } from '../components/Tooltip';
import { useUi } from '../ui/uiStore';
import { sfx, unlockAudio } from '../audio/sfx';
import { AscensionInfo, CLASS_NAME, DailyBoard } from './MetaBits';
import { AccountChip } from './ProfileScreen';
import { startTutorial } from '../tutorial/Tutorial';
import { isInstalledApp } from '../download/DownloadScreen';

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={`logo${small ? ' logo--sm' : ''}`}>
      <span className="logo__word glitch" data-text="CYBERHACK">
        CYBERHACK
      </span>
      {!small ? <span className="logo__sub">протокол несанкционированного доступа</span> : null}
    </div>
  );
}

// ---------------- Главное меню ----------------

export function MainMenu() {
  const savedRun = useGame((s) => s.savedRun);
  const run = useGame((s) => s.run);
  const user = useGame((s) => s.user);
  const backendMode = useGame((s) => s.backendMode);
  const openClassSelect = useGame((s) => s.openClassSelect);
  const setView = useGame((s) => s.setView);
  const loadRun = useGame((s) => s.loadRun);
  const openSettings = useUi((s) => s.openSettings);
  const profile = useGame((s) => s.profile);
  const activeLocal = run && run.status === 'active' ? run : null;
  const cont = activeLocal ?? savedRun?.state ?? null;
  const today = dailySeed(new Date());
  const dailyCls = todayDailyClass();
  const dailyDone = hasPlayedDaily(profile, today);

  const onContinue = () => {
    sfx('click');
    if (activeLocal) setView('run');
    else if (savedRun) loadRun(savedRun.state, savedRun.options, savedRun.actions);
  };

  const click = (fn: () => void) => () => {
    unlockAudio();
    sfx('click');
    fn();
  };

  return (
    <div className="screen menu" data-testid="menu">
      <AccountChip />
      <div className="menu__inner">
        <Logo />
        <nav className="menu__nav" aria-label="Главное меню">
          <button className="menu-btn menu-btn--primary" data-testid="menu-new" onClick={click(() => openClassSelect(false))}>
            <Icon name="terminal" size={22} />
            <span>
              <b>Новый взлом</b>
              <small>Новая игра: выбрать класс и сложность</small>
            </span>
          </button>
          <button className="menu-btn" data-testid="menu-continue" onClick={onContinue} disabled={!cont}>
            <Icon name="play" size={22} />
            <span>
              <b>Продолжить</b>
              <small>{cont ? `Продолжить сохранённую игру · ${CLASS_NAME[cont.classId]}, этаж ${cont.floor}${cont.ascension > 0 ? `, сложность ${cont.ascension}` : ''}` : 'Сохранённой игры нет'}</small>
            </span>
          </button>
          <button className="menu-btn" data-testid="menu-daily" onClick={click(() => openClassSelect(true))}>
            <Icon name="calendar" size={22} />
            <span>
              <b>Ежедневный взлом</b>
              <small>
                Один забег в день, общий для всех{dailyCls ? ` · ${CLASS_NAME[dailyCls]}` : ''}
                {dailyDone ? ' · сыгран' : ''}
              </small>
            </span>
          </button>
          <button className="menu-btn" data-testid="menu-tutorial" onClick={click(() => startTutorial())}>
            <Icon name="graduation" size={22} />
            <span>
              <b>Обучение</b>
              <small>Пробный бой с подсказками</small>
            </span>
          </button>
          <button className="menu-btn" data-testid="menu-howto" onClick={click(() => setView('howto'))}>
            <Icon name="book" size={22} />
            <span>
              <b>Как играть</b>
              <small>Правила и словарь терминов</small>
            </span>
          </button>
          {isInstalledApp() ? null : (
            <button className="menu-btn" data-testid="menu-download" onClick={click(() => setView('download'))}>
              <Icon name="upgrade" size={22} />
              <span>
                <b>Скачать игру</b>
                <small>Windows, macOS, Linux, Android, iPhone</small>
              </span>
            </button>
          )}
          <button className="menu-btn" data-testid="menu-profile" onClick={click(() => setView('profile'))}>
            <Icon name="user" size={22} />
            <span>
              <b>{user ? 'Профиль' : 'Профиль / Вход'}</b>
              <small>{user ? `${user.displayName} · достижения и рекорды` : 'Гость · достижения и рекорды'}</small>
            </span>
          </button>
          <button className="menu-btn menu-btn--quiet" data-testid="menu-settings" onClick={click(() => openSettings(true))}>
            <Icon name="gear" size={22} />
            <span>
              <b>Настройки</b>
              <small>Звук, скорость, анимации</small>
            </span>
          </button>
        </nav>
        <footer className="menu__foot">
          <span className={`badge${backendMode === 'supabase' ? ' badge--ok' : ''}`}>{backendMode === 'loading' ? 'подключение…' : backendMode === 'supabase' ? 'онлайн' : 'офлайн: прогресс на этом устройстве'}</span>
          {isMockActive() ? <span className="badge badge--warn">DEV · мок движка</span> : null}
          <span className="muted mono">v0.1</span>
        </footer>
      </div>
    </div>
  );
}

// ---------------- Выбор класса ----------------

function safeClasses(): ClassDef[] {
  try {
    return listClasses();
  } catch {
    return [];
  }
}

function lockHint(id: ClassId): string {
  const a = unlockSource('class', id);
  return a ? `${a.name}: ${a.description.toLowerCase()}` : 'Откроется позже';
}

/** Стиль класса простыми словами. */
const CLASS_STYLE: Record<string, string> = {
  netrunner: 'прямой урон — сильные атаки и наращивание Разгона.',
  phreaker: 'яды и ослабления — враги слабеют и теряют здоровье каждый ход.',
  ghost: 'защита и много карт — блок, дешёвые карты, постоянный добор.',
  samurai: 'ближний бой — Разгон, серии ударов и Шипы.',
  engineer: 'крепкая броня — Броня-патчи, Шипы и тяжёлые орудия.',
};

function ClassCard({ c, selected, locked, onSelect, hint }: { c: ClassDef; selected: boolean; locked: boolean; onSelect: () => void; hint?: string }) {
  const relic = tryRelicDef(c.startingRelic);
  return (
    <button
      role="radio"
      aria-checked={selected}
      data-testid={`class-${c.id}`}
      disabled={locked}
      title={locked ? hint : undefined}
      className={`class-card${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
      style={{ '--class-color': CLASS_COLOR[c.id] } as CSSProperties}
      onClick={() => {
        sfx('select');
        onSelect();
      }}
    >
      <span className="class-card__art">
        <PlayerArt classId={c.id} />
      </span>
      <span className="class-card__body">
        <b className="class-card__name">{c.name}</b>
        {CLASS_STYLE[c.id] ? (
          <span className="class-card__style">
            <b>Стиль:</b> {CLASS_STYLE[c.id]}
          </span>
        ) : null}
        <span className="class-card__desc">{c.description}</span>
        <span className="class-card__meta mono">
          <span {...tip('Здоровье', 'Максимум здоровья в начале забега.')}>
            <Icon name="hp" size={14} /> {c.maxHp} HP
          </span>
          <span {...tip('Кредиты', 'Стартовые деньги для чёрного рынка.')}>
            <Icon name="gold" size={14} /> {c.startingGold} кр.
          </span>
          <span {...tip('Колода', 'Сколько карт в стартовой колоде.')}>
            <Icon name="deck" size={14} /> {c.startingDeck.length} карт
          </span>
        </span>
        {relic ? (
          <span className="class-card__relic" {...tip(relic.name, `Стартовый имплант — бонус на весь забег. ${relic.description}`)}>
            Стартовый имплант: {relic.name}
          </span>
        ) : null}
      </span>
      {locked ? (
        <span className="class-card__lock">
          <span>
            <Icon name="lock" /> Заблокирован
          </span>
          {hint ? <small>{hint}</small> : null}
        </span>
      ) : null}
    </button>
  );
}

export function ClassSelect() {
  const daily = useGame((s) => s.dailyMode);
  return daily ? <DailySelect /> : <RegularSelect />;
}

export function SelectHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  const toMenu = useGame((s) => s.toMenu);
  return (
    <header className="cs-head">
      <button
        className="icon-btn"
        onClick={() => {
          sfx('click');
          toMenu();
        }}
        aria-label="Назад"
      >
        <Icon name="back" />
      </button>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function RegularSelect() {
  const profile = useGame((s) => s.profile);
  const startRegular = useGame((s) => s.startRegular);
  const error = useGame((s) => s.error);
  const classes = safeClasses();
  const unlocked = (id: ClassId) => profile.unlockedClasses.includes(id);
  const [cls, setCls] = useState<ClassId>(() => classes.find((c) => unlocked(c.id))?.id ?? classes[0]?.id ?? 'netrunner');
  const maxAsc = Math.min(MAX_ASCENSION, profile.maxAscension[cls] ?? 0);
  const [asc, setAsc] = useState(0);
  const [diff, setDiff] = useState<Difficulty>('normal');
  useEffect(() => setAsc((a) => Math.min(a, maxAsc)), [maxAsc]);
  const current = classes.find((c) => c.id === cls);

  const start = () => {
    unlockAudio();
    sfx('select');
    startRegular(cls, asc, diff);
  };

  return (
    <div className="screen class-select" data-testid="class-select">
      <SelectHead eyebrow="Новый взлом" title="Выбери класс" />
      <div className="cs-classes" role="radiogroup" aria-label="Класс">
        {classes.map((c) => (
          <ClassCard key={c.id} c={c} selected={cls === c.id} locked={!unlocked(c.id)} hint={lockHint(c.id)} onSelect={() => setCls(c.id)} />
        ))}
      </div>
      <section className="cs-asc" aria-label="Режим сложности">
        <div className="cs-asc__head">
          <h2 className="section-title">Режим</h2>
          <span className="muted small">{DIFFICULTY_INFO[diff].description}</span>
        </div>
        <div className="asc-chips" role="radiogroup" aria-label="Режим">
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={diff === d}
              className={`asc-chip${diff === d ? ' is-selected' : ''}`}
              style={{ width: 'auto', padding: '0 16px' }}
              onClick={() => {
                sfx('click');
                setDiff(d);
              }}
            >
              {DIFFICULTY_INFO[d].name}
            </button>
          ))}
        </div>
      </section>
      <section className="cs-asc" aria-label="Уровень сложности">
        <div className="cs-asc__head">
          <h2 className="section-title">Ascension (открывается победами)</h2>
          <span className="muted small">
            Каждый уровень добавляет врагам силы. Следующий уровень открывается победой на текущем максимальном. {current ? `${current.name}: открыто до ${maxAsc}.` : `Открыто до ${maxAsc}.`}
          </span>
        </div>
        <div className="asc-chips" role="radiogroup" aria-label="Сложность">
          {Array.from({ length: MAX_ASCENSION + 1 }, (_, i) => {
            const locked = i > maxAsc;
            return (
              <button
                key={i}
                role="radio"
                aria-checked={asc === i}
                disabled={locked}
                className={`asc-chip mono${asc === i ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
                onClick={() => {
                  sfx('click');
                  setAsc(i);
                }}
                aria-label={locked ? `Сложность ${i}, закрыта` : `Сложность ${i}`}
              >
                {locked ? <Icon name="lock" size={12} /> : i}
              </button>
            );
          })}
        </div>
        <AscensionInfo level={asc} />
      </section>
      <div className="cs-foot">
        {current ? (
          <div className="cs-summary">
            <RelicIcon id={current.startingRelic} />
            <span>
              <b>{current.name}</b>
              <small className="muted">{`${DIFFICULTY_INFO[diff].name}${asc > 0 ? ` · Ascension ${asc}` : ''}`}</small>
            </span>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn--primary btn--lg" data-testid="start-run" onClick={start} disabled={!current || !unlocked(cls)}>
          Начать взлом <Icon name="play" size={18} />
        </button>
      </div>
    </div>
  );
}

function DailySelect() {
  const profile = useGame((s) => s.profile);
  const startDaily = useGame((s) => s.startDaily);
  const error = useGame((s) => s.error);
  const today = dailySeed(new Date());
  const clsId = todayDailyClass();
  const current = safeClasses().find((c) => c.id === clsId);
  const played = hasPlayedDaily(profile, today);

  const start = () => {
    unlockAudio();
    sfx('select');
    startDaily();
  };

  return (
    <div className="screen class-select" data-testid="daily-select">
      <SelectHead eyebrow={`Ежедневный взлом · ${today}`} title="Взлом дня" />
      {current ? (
        <div className="cs-classes" role="radiogroup" aria-label="Класс дня">
          <ClassCard c={current} selected locked={false} onSelect={() => undefined} />
        </div>
      ) : null}
      <div className="daily-info">
        <p className="muted">
          Один и тот же забег для всех игроков: одинаковые карта и класс, базовая сложность, все карты и импланты открыты. Одна попытка в день — результат попадает в таблицу лидеров.
        </p>
        {played ? (
          <p className="ok">
            <Icon name="check" size={16} /> Сегодняшняя попытка уже использована. Новый взлом — завтра (00:00 UTC).
          </p>
        ) : null}
      </div>
      <section className="panel daily-board">
        <h2 className="section-title">Лидеры дня</h2>
        <DailyBoard seed={today} />
      </section>
      <div className="cs-foot">
        {current ? (
          <div className="cs-summary">
            <RelicIcon id={current.startingRelic} />
            <span>
              <b>{current.name}</b>
              <small className="muted">Ежедневный · базовая сложность</small>
            </span>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn--primary btn--lg" data-testid="start-daily" onClick={start} disabled={!current || played}>
          {played ? 'Попытка использована' : 'Начать взлом'} <Icon name={played ? 'lock' : 'play'} size={18} />
        </button>
      </div>
    </div>
  );
}
