import { useEffect, useState, type CSSProperties } from 'react';
import type { ClassDef, ClassId } from '../game/engine';
import { dailySeed, isMockActive, listClasses, tryRelicDef } from '../game/engine';
import { MAX_ASCENSION, useGame } from '../game/store';
import { getBackend } from '../game/backend';
import type { LeaderboardEntry } from '../net/types';
import { Icon } from '../components/Icon';
import { PlayerArt, CLASS_COLOR } from '../components/UnitArt';
import { RelicIcon } from '../components/Bits';
import { useUi } from '../ui/uiStore';
import { sfx, unlockAudio } from '../audio/sfx';

const CLASS_NAME: Record<ClassId, string> = { netrunner: 'Нетраннер', phreaker: 'Фрикер', ghost: 'Призрак' };

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
  const activeLocal = run && run.status === 'active' ? run : null;
  const cont = activeLocal ?? savedRun?.state ?? null;
  const today = dailySeed(new Date());

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
              <small className="mono">{today}</small>
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

export function ClassSelect() {
  const daily = useGame((s) => s.dailyMode);
  const profile = useGame((s) => s.profile);
  const startRun = useGame((s) => s.startRun);
  const toMenu = useGame((s) => s.toMenu);
  const error = useGame((s) => s.error);
  const classes = safeClasses();
  const [cls, setCls] = useState<ClassId>(classes[0]?.id ?? 'netrunner');
  const maxAsc = Math.min(MAX_ASCENSION, profile.maxAscension[cls] ?? 0);
  const [asc, setAsc] = useState(0);
  useEffect(() => setAsc((a) => Math.min(a, maxAsc)), [maxAsc]);
  const current = classes.find((c) => c.id === cls);
  const unlocked = (id: ClassId) => profile.unlockedClasses.includes(id);

  const start = () => {
    unlockAudio();
    sfx('select');
    const seed = daily ? dailySeed(new Date()) : Math.random().toString(36).slice(2, 10).toUpperCase();
    startRun({ seed, classId: cls, ascension: daily ? 0 : asc, daily });
  };

  return (
    <div className="screen class-select">
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
          <div className="eyebrow">{daily ? `Ежедневный взлом · ${dailySeed(new Date())}` : 'Новый взлом'}</div>
          <h1>Выберите оболочку</h1>
        </div>
      </header>
      <div className="cs-classes" role="radiogroup" aria-label="Класс">
        {classes.map((c) => {
          const locked = !unlocked(c.id);
          const relic = tryRelicDef(c.startingRelic);
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={cls === c.id}
              disabled={locked}
              className={`class-card${cls === c.id ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
              style={{ '--class-color': CLASS_COLOR[c.id] } as CSSProperties}
              onClick={() => {
                sfx('select');
                setCls(c.id);
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
                  <Icon name="lock" /> Заблокирован
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {!daily ? (
        <section className="cs-asc" aria-label="Уровень сложности">
          <div className="cs-asc__head">
            <h2 className="section-title">Ascension</h2>
            <span className="muted small">Открыто до {maxAsc}. Победа на максимальном уровне открывает следующий.</span>
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
        </section>
      ) : (
        <p className="muted center">Один сид на всех. Сложность фиксирована: A0. Результат уходит в таблицу лидеров дня.</p>
      )}
      <div className="cs-foot">
        {current ? (
          <div className="cs-summary">
            <RelicIcon id={current.startingRelic} />
            <span>
              <b>{current.name}</b>
              <small className="muted">{daily ? 'Ежедневный' : `Ascension ${asc}`}</small>
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

// ---------------- Профиль / вход ----------------

export function ProfileScreen() {
  const user = useGame((s) => s.user);
  const profile = useGame((s) => s.profile);
  const backendMode = useGame((s) => s.backendMode);
  const toMenu = useGame((s) => s.toMenu);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const today = dailySeed(new Date());

  useEffect(() => {
    let alive = true;
    void getBackend()
      .then((b) => b.leaderboard.getDaily(today, 10))
      .then((rows) => alive && setBoard(rows))
      .catch(() => alive && setBoard([]));
    return () => {
      alive = false;
    };
  }, [today]);

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
          <div className="eyebrow">{backendMode === 'supabase' ? 'Облачный профиль' : 'Гостевой режим'}</div>
          <h1>{user ? user.displayName : 'Профиль'}</h1>
        </div>
      </header>
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
            {classes.map((c) => (
              <div key={c}>
                <dt>{CLASS_NAME[c]} · макс. Ascension</dt>
                <dd className="mono">{profile.maxAscension[c] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel">
          <h2 className="section-title">Лидеры дня</h2>
          <p className="muted small mono">{today}</p>
          {board === null ? (
            <p className="muted">Загрузка…</p>
          ) : board.length ? (
            <ol className="board">
              {board.map((r) => (
                <li key={`${r.rank}-${r.displayName}`}>
                  <span className="mono">#{r.rank}</span>
                  <span>{r.displayName}</span>
                  <span className="muted">{CLASS_NAME[r.classId]}</span>
                  <span className="mono">{r.score}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Пока пусто. {backendMode !== 'supabase' ? 'Таблица доступна онлайн.' : 'Будьте первым!'}</p>
          )}
        </section>
      </div>
    </div>
  );
}
