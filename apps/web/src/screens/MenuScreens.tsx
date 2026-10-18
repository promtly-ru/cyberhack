import { useEffect, useState, type CSSProperties } from 'react';
import type { ClassDef, ClassId } from '../game/engine';
import { dailySeed, isMockActive, listClasses, lockableCards, lockableRelics, tryRelicDef, unlockSource } from '../game/engine';
import { MAX_ASCENSION, useGame } from '../game/store';
import { getBackend } from '../game/backend';
import { hasPlayedDaily, todayDailyClass } from '../game/meta';
import { Icon } from '../components/Icon';
import { PlayerArt, CLASS_COLOR } from '../components/UnitArt';
import { RelicIcon } from '../components/Bits';
import { useUi } from '../ui/uiStore';
import { sfx, unlockAudio } from '../audio/sfx';
import { AchievementsPanel, AscensionInfo, CLASS_NAME, DailyBoard } from './MetaBits';

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
    <div className="screen menu">
      <div className="menu__inner">
        <Logo />
        <nav className="menu__nav" aria-label="Главное меню">
          <button className="menu-btn menu-btn--primary" onClick={click(() => openClassSelect(false))}>
            <Icon name="terminal" size={22} />
            <span>
              <b>Новый взлом</b>
              <small>Выбрать класс и сложность</small>
            </span>
          </button>
          <button className="menu-btn" onClick={onContinue} disabled={!cont}>
            <Icon name="play" size={22} />
            <span>
              <b>Продолжить</b>
              <small>{cont ? `${CLASS_NAME[cont.classId]} · этаж ${cont.floor} · A${cont.ascension}` : 'Нет активного забега'}</small>
            </span>
          </button>
          <button className="menu-btn" onClick={click(() => openClassSelect(true))}>
            <Icon name="calendar" size={22} />
            <span>
              <b>Ежедневный взлом</b>
              <small className="mono">
                {today}
                {dailyCls ? ` · ${CLASS_NAME[dailyCls]}` : ''}
                {dailyDone ? ' · сыгран' : ''}
              </small>
            </span>
          </button>
          <button className="menu-btn" onClick={click(() => setView('profile'))}>
            <Icon name="user" size={22} />
            <span>
              <b>{user ? 'Профиль' : 'Профиль / Вход'}</b>
              <small>{user ? user.displayName : 'Гость'}</small>
            </span>
          </button>
          <button className="menu-btn menu-btn--quiet" onClick={click(() => openSettings(true))}>
            <Icon name="gear" size={22} />
            <span>
              <b>Настройки</b>
              <small>Звук, скорость, анимации</small>
            </span>
          </button>
        </nav>
        <footer className="menu__foot">
          <span className={`badge${backendMode === 'supabase' ? ' badge--ok' : ''}`}>{backendMode === 'loading' ? 'подключение…' : backendMode === 'supabase' ? 'онлайн' : 'гостевой режим'}</span>
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

function ClassCard({ c, selected, locked, onSelect, hint }: { c: ClassDef; selected: boolean; locked: boolean; onSelect: () => void; hint?: string }) {
  const relic = tryRelicDef(c.startingRelic);
  return (
    <button
      role="radio"
      aria-checked={selected}
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
        <span className="class-card__desc">{c.description}</span>
        <span className="class-card__meta mono">
          <span>
            <Icon name="hp" size={14} /> {c.maxHp}
          </span>
          <span>
            <Icon name="gold" size={14} /> {c.startingGold}
          </span>
          <span>
            <Icon name="deck" size={14} /> {c.startingDeck.length}
          </span>
        </span>
        {relic ? <span className="class-card__relic">Имплант: {relic.name}</span> : null}
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

function SelectHead({ eyebrow, title }: { eyebrow: string; title: string }) {
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
  useEffect(() => setAsc((a) => Math.min(a, maxAsc)), [maxAsc]);
  const current = classes.find((c) => c.id === cls);

  const start = () => {
    unlockAudio();
    sfx('select');
    startRegular(cls, asc);
  };

  return (
    <div className="screen class-select">
      <SelectHead eyebrow="Новый взлом" title="Выберите оболочку" />
      <div className="cs-classes" role="radiogroup" aria-label="Класс">
        {classes.map((c) => (
          <ClassCard key={c.id} c={c} selected={cls === c.id} locked={!unlocked(c.id)} hint={lockHint(c.id)} onSelect={() => setCls(c.id)} />
        ))}
      </div>
      <section className="cs-asc" aria-label="Уровень сложности">
        <div className="cs-asc__head">
          <h2 className="section-title">Ascension</h2>
          <span className="muted small">
            {current ? `${current.name}: открыто до ${maxAsc}.` : `Открыто до ${maxAsc}.`} Победа на максимальном уровне открывает следующий.
          </span>
        </div>
        <div className="asc-chips" role="radiogroup" aria-label="Ascension">
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
                aria-label={locked ? `Ascension ${i}, заблокирован` : `Ascension ${i}`}
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
              <small className="muted">Ascension {asc}</small>
            </span>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn--primary btn--lg" onClick={start} disabled={!current || !unlocked(cls)}>
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
    <div className="screen class-select">
      <SelectHead eyebrow={`Ежедневный взлом · ${today}`} title="Взлом дня" />
      {current ? (
        <div className="cs-classes" role="radiogroup" aria-label="Класс дня">
          <ClassCard c={current} selected locked={false} onSelect={() => undefined} />
        </div>
      ) : null}
      <div className="daily-info">
        <p className="muted">
          Один сид и один класс на всех, сложность A0, все карты и импланты открыты. Одна попытка в день — результат уходит в таблицу лидеров.
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
              <small className="muted">Ежедневный · A0</small>
            </span>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn--primary btn--lg" onClick={start} disabled={!current || played}>
          {played ? 'Попытка использована' : 'Начать взлом'} <Icon name={played ? 'lock' : 'play'} size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------------- Профиль / вход ----------------

function safeCount(fn: () => string[]): number {
  try {
    return fn().length;
  } catch {
    return 0;
  }
}

export function ProfileScreen() {
  const user = useGame((s) => s.user);
  const profile = useGame((s) => s.profile);
  const backendMode = useGame((s) => s.backendMode);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dailySeed(new Date());
  const totalCards = safeCount(lockableCards);
  const totalRelics = safeCount(lockableRelics);
  const lifetime = profile.lifetime ?? {};
  const openCards = profile.unlockedCards.filter((id) => lockableCards().includes(id)).length;
  const openRelics = profile.unlockedRelics.filter((id) => lockableRelics().includes(id)).length;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Ошибка' });
    } finally {
      setBusy(false);
    }
  };

  const classes: ClassId[] = ['netrunner', 'phreaker', 'ghost'];
  return (
    <div className="screen profile">
      <SelectHead eyebrow={backendMode === 'supabase' ? 'Облачный профиль' : 'Гостевой режим'} title={user ? user.displayName : 'Профиль'} />
      <div className="profile__grid">
        <section className="panel">
          <h2 className="section-title">Доступ</h2>
          {user ? (
            <>
              <p>
                Вы вошли как <b>{user.displayName}</b>
                {user.email ? <span className="muted"> · {user.email}</span> : null}
              </p>
              <button className="btn btn--ghost" disabled={busy} onClick={() => run(async () => (await getBackend()).auth.signOut(), 'Вы вышли')}>
                <Icon name="logout" size={18} /> Выйти
              </button>
            </>
          ) : (
            <>
              <p className="muted">Войдите, чтобы сохранять забеги в облаке и попасть в таблицу лидеров.</p>
              <form
                className="login-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!email.includes('@')) {
                    setMsg({ ok: false, text: 'Введите корректный email' });
                    return;
                  }
                  void run(async () => (await getBackend()).auth.signInWithEmail(email), 'Ссылка для входа отправлена на почту');
                }}
              >
                <label className="field">
                  <span>Email</span>
                  <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hacker@example.com" />
                </label>
                <button className="btn btn--primary" type="submit" disabled={busy}>
                  <Icon name="mail" size={18} /> Получить ссылку
                </button>
              </form>
              <div className="oauth">
                <button className="btn btn--ghost" disabled={busy} onClick={() => run(async () => (await getBackend()).auth.signInWithOAuth('google'), 'Переход к Google…')}>
                  <Icon name="google" size={18} /> Google
                </button>
                <button className="btn btn--ghost" disabled={busy} onClick={() => run(async () => (await getBackend()).auth.signInWithOAuth('github'), 'Переход к GitHub…')}>
                  <Icon name="github" size={18} /> GitHub
                </button>
              </div>
            </>
          )}
          {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
        </section>
        <section className="panel">
          <h2 className="section-title">Статистика</h2>
          <dl className="stats stats--compact">
            <div>
              <dt>Забегов</dt>
              <dd className="mono">{profile.totalRuns}</dd>
            </div>
            <div>
              <dt>Побед</dt>
              <dd className="mono">{profile.totalWins}</dd>
            </div>
            <div>
              <dt>Сыграно карт</dt>
              <dd className="mono">{(lifetime.cardsPlayed ?? 0).toLocaleString('ru-RU')}</dd>
            </div>
            <div>
              <dt>Уничтожено врагов</dt>
              <dd className="mono">{(lifetime.enemiesKilled ?? 0).toLocaleString('ru-RU')}</dd>
            </div>
            <div>
              <dt>Открыто классов</dt>
              <dd className="mono">
                {profile.unlockedClasses.length} / {classes.length}
              </dd>
            </div>
            <div>
              <dt>Открыто карт</dt>
              <dd className="mono">
                {openCards} / {totalCards}
              </dd>
            </div>
            <div>
              <dt>Открыто имплантов</dt>
              <dd className="mono">
                {openRelics} / {totalRelics}
              </dd>
            </div>
            {classes.map((c) => (
              <div key={c}>
                <dt>{CLASS_NAME[c]} · макс. Ascension</dt>
                <dd className="mono">{profile.unlockedClasses.includes(c) ? (profile.maxAscension[c] ?? 0) : <Icon name="lock" size={14} />}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel">
          <h2 className="section-title">Лидеры дня</h2>
          <p className="muted small mono">{today}</p>
          <DailyBoard seed={today} />
        </section>
        <AchievementsPanel profile={profile} />
      </div>
    </div>
  );
}
