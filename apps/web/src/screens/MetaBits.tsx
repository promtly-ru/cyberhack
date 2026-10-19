/**
 * Общие куски UI метапрогрессии: ачивки, разблокировки, ascension, таблица недели.
 */
import { useEffect, useState } from 'react';
import type { AchievementDef, ClassId, Unlock } from '../game/engine';
import {
  ACHIEVEMENTS,
  achievementProgress,
  getAchievement,
  getAscensionDescriptions,
  getCardDef,
  getMutator,
  prevWeeklySeed,
  tryRelicDef,
  weeklyMutatorIds,
  weeklyResetAt,
  weeklyRule,
  weeklyScoreMult,
  weeklySeed,
} from '../game/engine';
import { getBackend } from '../game/backend';
import type { LeaderboardEntry, Profile } from '../net/types';
import { Icon } from '../components/Icon';
import '../styles/meta.css';

export const CLASS_NAME: Record<ClassId, string> = { netrunner: 'Нетраннер', phreaker: 'Фрикер', ghost: 'Призрак', samurai: 'Кибер-самурай', engineer: 'Инженер', biohacker: 'Биохакер', droneop: 'Оператор дронов', chrono: 'Хроно-хакер' };

export function unlockLabel(u: Unlock): string {
  if (u.kind === 'class') return `Класс «${CLASS_NAME[u.id] ?? u.id}»`;
  if (u.kind === 'relic') return `Имплант «${tryRelicDef(u.id)?.name ?? u.id}»`;
  try {
    return `Карта «${getCardDef(u.id).name}»`;
  } catch {
    return `Карта «${u.id}»`;
  }
}

function UnlockList({ unlocks }: { unlocks: readonly Unlock[] }) {
  if (unlocks.length === 0) return <span className="ach__reward muted">Трофей</span>;
  return <span className="ach__reward">Открывает: {unlocks.map(unlockLabel).join(', ')}</span>;
}

function AchievementCard({ a, profile }: { a: AchievementDef; profile: Profile }) {
  const pr = achievementProgress(profile, a.id);
  const pct = Math.round((pr.value / pr.target) * 100);
  return (
    <li className={`ach${pr.done ? ' is-done' : ''}`} data-testid="achievement">
      <span className="ach__icon" aria-hidden>
        <Icon name={pr.done ? 'trophy' : 'lock'} size={20} />
      </span>
      <span className="ach__body">
        <b className="ach__name">{a.name}</b>
        <span className="ach__desc">{a.description}</span>
        <UnlockList unlocks={a.unlocks} />
        {!pr.done ? (
          <span className="ach__bar" role="progressbar" aria-valuemin={0} aria-valuemax={pr.target} aria-valuenow={pr.value} aria-label={`Прогресс: ${pr.value} из ${pr.target}`}>
            <span style={{ width: `${pct}%` }} />
            <em className="mono">
              {pr.value.toLocaleString('ru-RU')} / {pr.target.toLocaleString('ru-RU')}
            </em>
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function AchievementsPanel({ profile }: { profile: Profile }) {
  const done = ACHIEVEMENTS.filter((a) => achievementProgress(profile, a.id).done).length;
  const sorted = [...ACHIEVEMENTS].sort((x, y) => {
    const dx = achievementProgress(profile, x.id);
    const dy = achievementProgress(profile, y.id);
    if (dx.done !== dy.done) return dx.done ? -1 : 1;
    return dy.value / dy.target - dx.value / dx.target;
  });
  return (
    <section className="panel panel--wide" data-testid="achievements" aria-label="Достижения">
      <div className="cs-asc__head">
        <h2 className="section-title">Достижения</h2>
        <span className="muted small mono">
          {done} / {ACHIEVEMENTS.length}
        </span>
      </div>
      <ul className="ach-list">
        {sorted.map((a) => (
          <AchievementCard key={a.id} a={a} profile={profile} />
        ))}
      </ul>
    </section>
  );
}

/** Новые ачивки и разблокировки — для экрана конца забега. */
export function RunEndUnlocks({
  info,
}: {
  info: { newAchievements: string[]; unlocked: { classes: ClassId[]; cards: string[]; relics: string[] }; ascensionUnlocked?: { classId: ClassId; level: number } };
}) {
  const unlocks: Unlock[] = [
    ...info.unlocked.classes.map((id): Unlock => ({ kind: 'class', id })),
    ...info.unlocked.cards.map((id): Unlock => ({ kind: 'card', id })),
    ...info.unlocked.relics.map((id): Unlock => ({ kind: 'relic', id })),
  ];
  if (info.newAchievements.length === 0 && unlocks.length === 0 && !info.ascensionUnlocked) return null;
  return (
    <section className="run-unlocks" aria-label="Новые достижения">
      {info.newAchievements.length > 0 ? (
        <>
          <h2 className="section-title">Новые достижения</h2>
          <ul className="ach-list ach-list--compact">
            {info.newAchievements.map((id) => {
              const a = getAchievement(id);
              return a ? (
                <li key={id} className="ach is-done is-new">
                  <span className="ach__icon" aria-hidden>
                    <Icon name="trophy" size={20} />
                  </span>
                  <span className="ach__body">
                    <b className="ach__name">{a.name}</b>
                    <span className="ach__desc">{a.description}</span>
                  </span>
                </li>
              ) : null;
            })}
          </ul>
        </>
      ) : null}
      {unlocks.length > 0 || info.ascensionUnlocked ? (
        <ul className="unlock-list">
          {info.ascensionUnlocked ? (
            <li>
              <Icon name="upgrade" size={16} /> {CLASS_NAME[info.ascensionUnlocked.classId]}: открыта сложность {info.ascensionUnlocked.level}
            </li>
          ) : null}
          {unlocks.map((u) => (
            <li key={`${u.kind}:${u.id}`}>
              <Icon name="check" size={16} /> Открыто: {unlockLabel(u)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Описание уровней ascension: выбранный уровень и все действующие модификаторы. */
export function AscensionInfo({ level }: { level: number }) {
  const rows = getAscensionDescriptions();
  if (level === 0) return <p className="asc-info muted small">Уровень 0 — базовая сложность, враги без усилений.</p>;
  return (
    <ol className="asc-info" aria-label={`Что меняет сложность ${level}`}>
      {rows
        .filter((r) => r.level <= level)
        .map((r) => (
          <li key={r.level} className={r.level === level ? 'is-current' : undefined}>
            <span className="mono">Ур. {r.level}</span> {r.description}
          </li>
        ))}
    </ol>
  );
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** '2д 03:15:09' до момента сброса. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${d > 0 ? `${d}д ` : ''}${hh}:${mm}:${ss}`;
}

/** Время забега: '12:05' или '1:02:05'. */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Номер недели из id: '2026-W43' -> 'W43'. */
export function weekLabel(seed: string): string {
  return `W${seed.split('-W')[1] ?? seed}`;
}

/** Мутаторы, правило недели и множитель очков. */
export function WeeklyRules({ seed }: { seed: string }) {
  const ids = weeklyMutatorIds(seed);
  const rule = weeklyRule(seed);
  const mult = weeklyScoreMult(seed);
  const items = ids.slice(0, -1).map((id) => getMutator(id)).filter((m): m is NonNullable<typeof m> => !!m);
  return (
    <ul className="weekly-rules" aria-label="Правила недели">
      <li className="weekly-rules__rule" data-testid="weekly-rule">
        <b>Правило недели: {rule.name}</b>
        <small>{rule.description}</small>
      </li>
      {items.map((m) => (
        <li key={m.id}>
          <b>{m.name}</b>
          <small>{m.description}</small>
        </li>
      ))}
      <li>
        <b>Множитель очков ×{mult.toFixed(2)}</b>
        <small>Применяется к очкам вызова вместе с бонусами мутаторов.</small>
      </li>
    </ul>
  );
}

/** Таймер до сброса недели. */
export function WeeklyTimer({ seed }: { seed: string }) {
  const now = useNow(1000);
  const reset = weeklyResetAt(now);
  return (
    <span className="weekly-timer mono" data-testid="weekly-timer" title={`Неделя ${seed} закончится в понедельник 00:00 UTC`}>
      <Icon name="calendar" size={14} /> до сброса {formatCountdown(reset.getTime() - now.getTime())}
    </span>
  );
}

function Row({ r, mine }: { r: LeaderboardEntry; mine?: boolean }) {
  return (
    <li className={`wb-row${mine ? ' is-mine' : ''}`} data-testid={mine ? 'wb-mine' : undefined}>
      <span className={`wb-rank mono${r.rank <= 3 ? ` medal medal--${r.rank}` : ''}`}>{r.rank <= 3 ? r.rank : `#${r.rank}`}</span>
      <span className="wb-name">{mine ? `${r.displayName} (вы)` : r.displayName}</span>
      <span className="wb-class muted">{CLASS_NAME[r.classId] ?? r.classId}</span>
      <span className="wb-score mono">{r.score}</span>
      <span className="wb-floor mono muted">{r.floor}</span>
      <span className="wb-time mono muted">{formatDuration(r.durationS)}</span>
    </li>
  );
}

/**
 * Таблица недели: топ-50, медали, своя строка (внизу, если вне топа), вкладки «Эта / Прошлая неделя».
 * reloadKey — перезапросить (например, после отправки результата).
 */
export function WeeklyBoard({ limit = 50, reloadKey, showRules = true }: { limit?: number; reloadKey?: unknown; showRules?: boolean }) {
  const now = new Date();
  const thisWeek = weeklySeed(now);
  const [tab, setTab] = useState<'this' | 'prev'>('this');
  const seed = tab === 'this' ? thisWeek : prevWeeklySeed(now);
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [mine, setMine] = useState<LeaderboardEntry | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    setBoard(null);
    setMine(null);
    void getBackend()
      .then(async (b) => {
        if (alive) setOffline(b.mode !== 'supabase');
        const [rows, me] = await Promise.all([b.leaderboard.getWeekly(seed, limit), b.leaderboard.getWeeklyMine(seed).catch(() => null)]);
        if (alive) {
          setBoard(rows);
          setMine(me);
        }
      })
      .catch(() => alive && setBoard([]));
    return () => {
      alive = false;
    };
  }, [seed, limit, reloadKey]);

  const isMine = (r: LeaderboardEntry): boolean => !!mine && r.rank === mine.rank && r.displayName === mine.displayName;
  const inTop = (board ?? []).some(isMine);
  return (
    <section className="weekly-board" data-testid="weekly-board" aria-label="Рейтинг недели">
      <header className="weekly-board__head">
        <h3 className="weekly-board__title">
          Неделя {weekLabel(seed)} <small className="muted">{seed}</small>
        </h3>
        {tab === 'this' ? <WeeklyTimer seed={seed} /> : <span className="weekly-timer muted">неделя завершена</span>}
      </header>
      <div className="weekly-tabs" role="tablist" aria-label="Неделя">
        <button role="tab" aria-selected={tab === 'this'} className={tab === 'this' ? 'is-active' : undefined} data-testid="wb-tab-this" onClick={() => setTab('this')}>
          Эта неделя
        </button>
        <button role="tab" aria-selected={tab === 'prev'} className={tab === 'prev' ? 'is-active' : undefined} data-testid="wb-tab-prev" onClick={() => setTab('prev')}>
          Прошлая неделя
        </button>
      </div>
      {showRules ? <WeeklyRules seed={seed} /> : null}
      {board === null ? (
        <p className="muted">Загрузка…</p>
      ) : board.length === 0 ? (
        <p className="muted">Пока пусто. {offline ? 'Общая таблица доступна онлайн.' : 'Будьте первым!'}</p>
      ) : (
        <>
          <div className="wb-head" aria-hidden="true">
            <span>№</span>
            <span>Ник</span>
            <span className="wb-class">Класс</span>
            <span className="wb-score">Очки</span>
            <span className="wb-floor">Этаж</span>
            <span className="wb-time">Время</span>
          </div>
          <ol className="wb-list">
            {board.map((r) => (
              <Row key={`${r.rank}-${r.displayName}`} r={r} mine={isMine(r)} />
            ))}
          </ol>
          {mine && !inTop ? (
            <ol className="wb-list wb-list--mine" aria-label="Ваше место">
              <li className="wb-gap muted" aria-hidden="true">...</li>
              <Row r={mine} mine />
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}
