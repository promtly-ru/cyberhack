import { useState } from 'react';
import type { ClassId } from '../game/engine';
import { dailySeed, lockableCards, lockableRelics } from '../game/engine';
import { useGame } from '../game/store';
import { getBackend } from '../game/backend';
import { Icon } from '../components/Icon';
import { AchievementsPanel, CLASS_NAME, DailyBoard } from './MetaBits';
import { SelectHead } from './MenuScreens';

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
  const [loginOpen, setLoginOpen] = useState(false);
  // Локальный бэкенд отдаёт «гостя» как пользователя — это не вход
  const isGuest = !user || user.provider === 'guest';
  const cloudOff = backendMode === 'local';
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
    <div className="screen profile" data-testid="profile">
      <SelectHead eyebrow={isGuest ? 'Гостевой режим' : 'Облачный профиль'} title={isGuest ? 'Профиль' : user.displayName} />
      <div className="profile__grid">
        <section className="panel">
          <h2 className="section-title">Доступ</h2>
          {isGuest && !loginOpen ? (
            <>
              <p>
                <b>Гостевой режим</b>
                <span className="muted"> · прогресс хранится только на этом устройстве</span>
              </p>
              {cloudOff ? (
                <p className="muted" data-testid="cloud-off">
                  Облачные сохранения в этой сборке не настроены — вход недоступен, игра работает офлайн.
                </p>
              ) : null}
              <button className="btn btn--primary" data-testid="profile-login" disabled={busy || cloudOff} onClick={() => setLoginOpen(true)}>
                <Icon name="mail" size={18} /> Войти
              </button>
            </>
          ) : !isGuest ? (
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

/** Плашка аккаунта в углу главного меню. ЗАГОТОВКА — реализацию делает агент «Аккаунты». */
export function AccountChip() {
  return null;
}
