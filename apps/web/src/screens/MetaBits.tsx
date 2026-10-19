/**
 * Общие куски UI метапрогрессии: ачивки, разблокировки, ascension, таблица дня.
 */
import { useEffect, useState } from 'react';
import type { AchievementDef, ClassId, Unlock } from '../game/engine';
import { ACHIEVEMENTS, achievementProgress, getAchievement, getAscensionDescriptions, getCardDef, tryRelicDef } from '../game/engine';
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

/** Таблица лидеров дня; reloadKey — перезапросить (например, после отправки результата). */
export function DailyBoard({ seed, limit = 10, reloadKey }: { seed: string; limit?: number; reloadKey?: unknown }) {
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    setBoard(null);
    void getBackend()
      .then((b) => {
        if (alive) setOffline(b.mode !== 'supabase');
        return b.leaderboard.getDaily(seed, limit);
      })
      .then((rows) => alive && setBoard(rows))
      .catch(() => alive && setBoard([]));
    return () => {
      alive = false;
    };
  }, [seed, limit, reloadKey]);

  if (board === null) return <p className="muted">Загрузка…</p>;
  if (board.length === 0) return <p className="muted">Пока пусто. {offline ? 'Таблица доступна онлайн.' : 'Будьте первым!'}</p>;
  return (
    <ol className="board">
      {board.map((r) => (
        <li key={`${r.rank}-${r.displayName}`}>
          <span className="mono">#{r.rank}</span>
          <span>{r.displayName}</span>
          <span className="muted">{CLASS_NAME[r.classId] ?? r.classId}</span>
          <span className="mono">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}
