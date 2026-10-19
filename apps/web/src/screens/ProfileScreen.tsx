import { useState, type FormEvent } from 'react';
import type { ClassId } from '../game/engine';
import { dailySeed, lockableCards, lockableRelics } from '../game/engine';
import { accountAction, useGame } from '../game/store';
import type { DeviceProfile, User } from '../net/types';
import { LocalProfileError, type LocalProfileErrorCode } from '../net/errors';
import { Icon } from '../components/Icon';
import { sfx } from '../audio/sfx';
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

const isGuestUser = (u: User | null): boolean => !u || u.provider === 'guest';

const PROVIDER_NAME: Record<User['provider'], string> = {
  email: 'почта',
  google: 'Google',
  github: 'GitHub',
  local: 'это устройство',
  guest: 'гость',
};

const AVATAR_COLORS = ['#00f0ff', '#ff2bd6', '#e8ff3a', '#3dff8a', '#b48cff', '#ff9f1c'];

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

/** Кружок с первой буквой ника; у гостя — иконка. */
export function Avatar({ name, size = 40 }: { name: string | null; size?: number }) {
  const letter = name ? ([...name.trim()][0] ?? '?').toLocaleUpperCase('ru-RU') : null;
  const style: Record<string, string | number> = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.46),
  };
  if (name) style['--avatar'] = avatarColor(name);
  return (
    <span className={`avatar${letter ? '' : ' avatar--guest'}`} style={style} aria-hidden="true">
      {letter ?? <Icon name="user" size={Math.round(size * 0.55)} />}
    </span>
  );
}

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Что-то пошло не так, попробуй ещё раз';
}

type ActError = { text: string; code: LocalProfileErrorCode | null };
/** Выполнить действие; null — успех, иначе ошибка (inline — показать её у формы, а не наверху блока) */
type Act = (fn: () => Promise<unknown>, ok: string, opts?: { close?: boolean; inline?: boolean }) => Promise<ActError | null>;

/** Блок «Аккаунт»: кто ты сейчас, вход, выход, смена профиля. */
function AccountPanel() {
  const user = useGame((s) => s.user);
  const backendMode = useGame((s) => s.backendMode);
  const accounts = useGame((s) => s.accounts);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const guest = isGuestUser(user);
  const cloud = backendMode === 'supabase';
  const cloudUser = !!user && user.provider !== 'guest' && user.provider !== 'local';
  const current = accounts?.profiles.find((p) => p.id === user?.id) ?? null;

  const act: Act = async (fn, ok, { close = true, inline = false } = {}) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      if (close) setOpen(false);
      return null;
    } catch (e) {
      sfx('error');
      const text = errorText(e);
      if (!inline) setMsg({ ok: false, text });
      return { text, code: e instanceof LocalProfileError ? e.code : null };
    } finally {
      setBusy(false);
    }
  };

  let title: string;
  let sub: string;
  if (guest || !user) {
    title = 'Гость';
    sub = cloud
      ? 'Прогресс хранится только в этом браузере. Войди, чтобы он сохранялся в облаке.'
      : 'Прогресс хранится только в этом браузере. Создай профиль — и у каждого, кто играет на этом устройстве, будет свой прогресс.';
  } else if (user.provider === 'local') {
    title = user.displayName;
    sub = `Профиль на этом устройстве · ${current?.hasPin ? 'защищён PIN' : 'без PIN'}`;
  } else {
    title = user.displayName;
    sub = `Облачный аккаунт · ${user.email ?? PROVIDER_NAME[user.provider]}`;
  }

  return (
    <section className="panel account-panel" aria-labelledby="account-title" data-testid="account-panel">
      <h2 className="section-title" id="account-title">
        Аккаунт
      </h2>
      <div className="account-who">
        <Avatar name={guest ? null : title} size={56} />
        <div className="account-who__text">
          <b data-testid="account-name">{title}</b>
          <span className="muted">{sub}</span>
        </div>
        <div className="account-who__actions">
          {guest ? (
            !open ? (
              <button className="btn btn--primary" data-testid="account-login" disabled={busy} onClick={() => setOpen(true)}>
                <Icon name="user" size={18} /> Войти
              </button>
            ) : null
          ) : (
            <>
              <button className="btn btn--ghost" data-testid="account-switch" disabled={busy} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                <Icon name="user" size={18} /> Сменить профиль
              </button>
              <button
                className="btn btn--ghost"
                data-testid="account-logout"
                disabled={busy}
                onClick={() => void act(() => accountAction((b) => b.auth.signOut()), 'Ты вышел — теперь играешь как гость')}
              >
                <Icon name="logout" size={18} /> Выйти
              </button>
            </>
          )}
        </div>
      </div>
      {msg ? (
        <p className={`account-msg ${msg.ok ? 'ok' : 'error'}`} role={msg.ok ? 'status' : 'alert'} data-testid="account-msg">
          {msg.text}
        </p>
      ) : null}
      {open ? (
        <div className={`account-login${cloud ? '' : ' account-login--solo'}`} data-testid="account-login-panel">
          {cloud ? <CloudLogin busy={busy} act={act} /> : null}
          {accounts ? (
            <DeviceProfiles
              profiles={accounts.profiles}
              currentId={user?.provider === 'local' ? user.id : null}
              canImportGuest={guest && accounts.guestHasProgress}
              cloud={cloud}
              cloudUser={cloudUser}
              busy={busy}
              act={act}
            />
          ) : (
            <p className="muted">Профили на устройстве сейчас недоступны — играй как гость.</p>
          )}
          <div className="account-login__foot">
            {!cloud ? (
              <p className="muted small" data-testid="cloud-off">
                Облачные сохранения пока не подключены — весь прогресс хранится на этом устройстве.
              </p>
            ) : null}
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Облачный вход: почта (magic link), Google, GitHub. */
function CloudLogin({ busy, act }: { busy: boolean; act: Act }) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Похоже, в адресе опечатка — проверь почту');
      return;
    }
    setEmailError(null);
    void act(() => accountAction((b) => b.auth.signInWithEmail(email)), 'Готово! Открой письмо и нажми на ссылку для входа', { close: false });
  };
  const oauth = (provider: 'google' | 'github', label: string) =>
    void act(() => accountAction((b) => b.auth.signInWithOAuth(provider)), `Переходим к ${label}…`, { close: false });
  return (
    <div className="account-block" data-testid="cloud-login">
      <h3 className="account-block__title">Облачный аккаунт</h3>
      <p className="muted small">Прогресс сохранится в облаке: продолжай с любого устройства и попадай в таблицу лидеров.</p>
      <form className="login-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Почта — пришлём ссылку для входа</span>
          <input
            className="acc-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hacker@example.com"
            aria-invalid={!!emailError}
          />
        </label>
        {emailError ? <p className="error small">{emailError}</p> : null}
        <button className="btn btn--primary" type="submit" disabled={busy}>
          <Icon name="mail" size={18} /> Получить ссылку
        </button>
      </form>
      <div className="oauth">
        <button className="btn btn--ghost" disabled={busy} onClick={() => oauth('google', 'Google')}>
          <Icon name="google" size={18} /> Google
        </button>
        <button className="btn btn--ghost" disabled={busy} onClick={() => oauth('github', 'GitHub')}>
          <Icon name="github" size={18} /> GitHub
        </button>
      </div>
    </div>
  );
}

const PIN_PROPS = {
  className: 'acc-input acc-input--pin mono',
  type: 'password',
  inputMode: 'numeric',
  pattern: '[0-9]{4}',
  maxLength: 4,
  autoComplete: 'off',
  placeholder: '••••',
} as const;

const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

/** Офлайн-профили: список на устройстве, вход по PIN, удаление, создание нового. */
function DeviceProfiles({
  profiles,
  currentId,
  canImportGuest,
  cloud,
  cloudUser,
  busy,
  act,
}: {
  profiles: DeviceProfile[];
  currentId: string | null;
  canImportGuest: boolean;
  cloud: boolean;
  cloudUser: boolean;
  busy: boolean;
  act: Act;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [importGuest, setImportGuest] = useState(true);
  /** Ошибка у конкретной формы: 'create' или id профиля */
  const [error, setError] = useState<{
    at: string;
    text: string;
    existing?: DeviceProfile;
  } | null>(null);

  const signIn = async (p: DeviceProfile, withPin?: string) => {
    const err = await act(() => accountAction((b) => b.profiles!.signIn(p.id, withPin)), `Привет, ${p.name}! Твой прогресс загружен`, { inline: true });
    if (err) {
      setPin('');
      setError({ at: p.id, text: err.text });
    }
  };

  const pick = (p: DeviceProfile) => {
    setDeleting(null);
    setPin('');
    setError(null);
    if (p.hasPin) {
      setSelected(p.id === selected ? null : p.id);
      return;
    }
    setSelected(null);
    void signIn(p);
  };

  const remove = async (e: FormEvent, p: DeviceProfile) => {
    e.preventDefault();
    const err = await act(() => accountAction((b) => b.profiles!.remove(p.id, pin)), `Профиль «${p.name}» удалён`, { close: false, inline: true });
    setPin('');
    if (err) setError({ at: p.id, text: err.text });
    else setDeleting(null);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const doImport = canImportGuest && importGuest;
    const err = await act(
      () => accountAction((b) => b.profiles!.create({ name, pin: newPin, importGuest: doImport })),
      doImport ? 'Профиль создан, прогресс гостя перенесён в него' : 'Профиль создан — ты вошёл',
      { inline: true },
    );
    if (!err) {
      setName('');
      setNewPin('');
      return;
    }
    const key = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
    const existing = err.code === 'name_taken' ? profiles.find((p) => p.name.toLocaleLowerCase('ru-RU') === key) : undefined;
    setError({
      at: 'create',
      text: err.text,
      ...(existing ? { existing } : {}),
    });
  };

  const errorFor = (at: string) =>
    error?.at === at ? (
      <p className="error small" role="alert" data-testid="account-error">
        {error.text}
      </p>
    ) : null;

  return (
    <div className="account-block" data-testid="device-profiles">
      <h3 className="account-block__title">{cloud ? 'Или профиль на этом устройстве' : 'Профили на этом устройстве'}</h3>
      {cloud ? (
        <p className="muted small">
          Без почты и интернета: прогресс останется в этом браузере.
          {cloudUser ? ' Вход в такой профиль выведет тебя из облачного аккаунта на этом устройстве.' : ''}
        </p>
      ) : null}
      <div className={`dp-body${profiles.length > 0 ? '' : ' dp-body--empty'}`}>
        {profiles.length > 0 ? (
          <ul className="dp-list" aria-label="Профили на этом устройстве">
            {profiles.map((p) => {
              const isCurrent = p.id === currentId;
              return (
                <li key={p.id} className={`dp-item${isCurrent ? ' is-current' : ''}`} data-testid="device-profile" data-name={p.name}>
                  <div className="dp-row">
                    <button
                      className="dp-pick"
                      data-testid="device-profile-pick"
                      disabled={busy || isCurrent}
                      onClick={() => pick(p)}
                      aria-expanded={p.hasPin && !isCurrent ? selected === p.id : undefined}
                    >
                      <Avatar name={p.name} size={34} />
                      <span className="dp-name">{p.name}</span>
                      {p.hasPin ? (
                        <span className="dp-lock" title="Защищён PIN">
                          <Icon name="lock" size={14} />
                          <span className="acc-sr">защищён PIN</span>
                        </span>
                      ) : null}
                      {isCurrent ? <span className="badge badge--ok">это ты</span> : null}
                    </button>
                    <button
                      className="icon-btn dp-del"
                      aria-label={`Удалить профиль ${p.name}`}
                      data-testid="device-profile-delete"
                      disabled={busy}
                      onClick={() => {
                        setSelected(null);
                        setPin('');
                        setError(null);
                        setDeleting(deleting === p.id ? null : p.id);
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                  {!p.hasPin && deleting !== p.id ? errorFor(p.id) : null}
                  {selected === p.id && !isCurrent ? (
                    <form
                      className="dp-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void signIn(p, pin);
                      }}
                    >
                      <label className="field">
                        <span>PIN профиля «{p.name}»</span>
                        <input {...PIN_PROPS} autoFocus value={pin} onChange={(e) => setPin(onlyDigits(e.target.value))} data-testid="signin-pin" />
                      </label>
                      <button className="btn btn--primary" type="submit" disabled={busy || pin.length !== 4} data-testid="signin-submit">
                        Войти
                      </button>
                      {errorFor(p.id)}
                    </form>
                  ) : null}
                  {deleting === p.id ? (
                    <form className="dp-form dp-form--danger" onSubmit={(e) => void remove(e, p)} data-testid="delete-confirm">
                      <p>
                        Удалить профиль <b>«{p.name}»</b> и весь его прогресс? Отменить это нельзя.
                      </p>
                      {p.hasPin ? (
                        <label className="field">
                          <span>Введи PIN, чтобы подтвердить</span>
                          <input {...PIN_PROPS} autoFocus value={pin} onChange={(e) => setPin(onlyDigits(e.target.value))} data-testid="delete-pin" />
                        </label>
                      ) : null}
                      {errorFor(p.id)}
                      <div className="dp-form__actions">
                        <button className="btn btn--danger" type="submit" disabled={busy || (p.hasPin && pin.length !== 4)} data-testid="delete-submit">
                          <Icon name="trash" size={16} /> Удалить
                        </button>
                        <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => setDeleting(null)}>
                          Оставить
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <form className="dp-create" onSubmit={(e) => void create(e)} noValidate data-testid="create-profile">
          <h4 className="dp-create__title">Новый профиль</h4>
          <div className="dp-create__fields">
            <label className="field">
              <span>Ник (2–20 символов)</span>
              <input
                className="acc-input"
                type="text"
                autoComplete="nickname"
                maxLength={20}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error?.at === 'create') setError(null);
                }}
                placeholder="например, Нео"
                data-testid="create-name"
              />
            </label>
            <label className="field">
              <span>PIN (необязательно)</span>
              <input {...PIN_PROPS} value={newPin} onChange={(e) => setNewPin(onlyDigits(e.target.value))} data-testid="create-pin" />
            </label>
          </div>
          <p className="muted small">PIN не даст брату или сестре случайно зайти в твой профиль. Это не настоящий пароль — не ставь PIN от банковской карты.</p>
          {canImportGuest ? (
            <label className="acc-check">
              <input type="checkbox" checked={importGuest} onChange={(e) => setImportGuest(e.target.checked)} data-testid="create-import" />
              <span>Перенести прогресс гостя в новый профиль</span>
            </label>
          ) : null}
          {error?.at === 'create' ? (
            <p className="error small" role="alert" data-testid="account-error">
              {error.text}
              {error.existing ? (
                <>
                  {' '}
                  <button type="button" className="acc-link" onClick={() => pick(error.existing!)}>
                    Войти в «{error.existing.name}»
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          <button className="btn btn--primary" type="submit" disabled={busy} data-testid="create-submit">
            Создать и войти
          </button>
        </form>
      </div>
    </div>
  );
}

export function ProfileScreen() {
  const user = useGame((s) => s.user);
  const profile = useGame((s) => s.profile);
  const guest = isGuestUser(user);
  const today = dailySeed(new Date());
  const totalCards = safeCount(lockableCards);
  const totalRelics = safeCount(lockableRelics);
  const lifetime = profile.lifetime ?? {};
  const openCards = profile.unlockedCards.filter((id) => lockableCards().includes(id)).length;
  const openRelics = profile.unlockedRelics.filter((id) => lockableRelics().includes(id)).length;

  const classes: ClassId[] = ['netrunner', 'phreaker', 'ghost', 'samurai', 'engineer'];
  return (
    <div className="screen profile" data-testid="profile">
      <SelectHead eyebrow="Профиль" title={guest || !user ? 'Гость' : user.displayName} />
      <div className="profile__grid">
        <AccountPanel />
        <section className="panel">
          <h2 className="section-title">Статистика</h2>
          <dl className="stats stats--compact">
            <div>
              <dt>Забегов</dt>
              <dd className="mono" data-testid="stat-runs">
                {profile.totalRuns}
              </dd>
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

/** Плашка аккаунта в углу главного меню: аватар + имя; клик — экран профиля. */
export function AccountChip() {
  const user = useGame((s) => s.user);
  const setView = useGame((s) => s.setView);
  const guest = isGuestUser(user);
  const name = guest || !user ? 'Гость' : user.displayName;
  const sub = guest ? 'Войти' : user?.provider === 'local' ? 'Профиль' : 'Облако';
  return (
    <button
      type="button"
      className={`account-chip${guest ? ' account-chip--guest' : ''}`}
      data-testid="account-chip"
      data-state={guest ? 'guest' : 'user'}
      aria-label={guest ? 'Гость — войти в профиль' : `Профиль ${name} — открыть`}
      onClick={() => {
        sfx('click');
        setView('profile');
      }}
    >
      <Avatar name={guest ? null : name} size={34} />
      <span className="account-chip__text">
        <b data-testid="account-chip-name">{name}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}
