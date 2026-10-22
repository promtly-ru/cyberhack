import { useMemo, useState } from 'react';
import type { AchievementDef, AchievementState, AchievementTier } from '../ui-adapter/contract';
import { claimAchievement, listAchievements, useAchievementStates, useUnclaimedCount } from '../ui-adapter/contract';
import { useOverlays } from '../ui-adapter/overlays';
import { Modal } from '../components/Bits';
import { Icon } from '../components/Icon';
import { categoryName, REWARD_ICON, rewardLabel, TIER_NAME } from '../components/firmware/labels';
import '../styles/firmware-ui.css';
import '../styles/achievements-ui.css';

type Status = 'all' | 'claim' | 'progress' | 'done';
const STATUS_NAME: Record<Status, string> = { all: 'Все', claim: 'Забрать', progress: 'В процессе', done: 'Получены' };
const TIERS: AchievementTier[] = ['bronze', 'silver', 'gold'];

function statusOf(st: AchievementState): Exclude<Status, 'all'> {
  return st.claimed ? 'done' : st.completed ? 'claim' : 'progress';
}

function AchievementItem({ a, st }: { a: AchievementDef; st: AchievementState }) {
  const pct = Math.min(100, Math.round((st.progress / a.goal) * 100));
  const s = statusOf(st);
  return (
    <li className={`achx achx--${a.tier} is-${s}`} data-testid="achievement">
      <span className="achx__medal" aria-label={TIER_NAME[a.tier]}>
        <Icon name={st.completed ? 'trophy' : 'lock'} size={22} />
      </span>
      <span className="achx__body">
        <span className="achx__top">
          <b className="achx__title">{a.title}</b>
          <span className="achx__tier">{TIER_NAME[a.tier]}</span>
        </span>
        <span className="achx__desc">{a.desc}</span>
        <span className="achx__bar" role="progressbar" aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={st.progress} aria-label={`Прогресс: ${st.progress} из ${a.goal}`}>
          <span style={{ width: `${pct}%` }} />
          <em className="mono">
            {st.progress.toLocaleString('ru-RU')} / {a.goal.toLocaleString('ru-RU')}
          </em>
        </span>
        <span className="achx__foot">
          <span className="achx__reward">
            <Icon name={REWARD_ICON[a.reward.kind]} size={16} />
            {rewardLabel(a.reward)}
          </span>
          {s === 'claim' ? (
            <button type="button" className="btn btn--primary achx__claim" onClick={() => claimAchievement(a.id)} data-testid="achievement-claim">
              Забрать
            </button>
          ) : s === 'done' ? (
            <span className="achx__got">
              <Icon name="check" size={16} /> Получено
            </span>
          ) : null}
        </span>
      </span>
    </li>
  );
}

/** Меню достижений: категории, тиры, прогресс, награды, «забрать», фильтры, поиск, счётчик. */
export function AchievementsScreen() {
  const open = useOverlays((s) => s.achievements);
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const [tier, setTier] = useState<AchievementTier | 'all'>('all');
  const [q, setQ] = useState('');

  const all = listAchievements();
  const stateList = useAchievementStates();
  const states = useMemo(() => Object.fromEntries(stateList.map((s) => [s.id, s])) as Record<string, AchievementState>, [stateList]);
  const toClaim = useUnclaimedCount();
  const cats = useMemo(() => [...new Set(all.map((a) => a.category))], [all]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank = { claim: 0, progress: 1, done: 2 } as const;
    return all
      .filter((a) => {
        const st = states[a.id];
        if (!st) return false;
        if (cat !== 'all' && a.category !== cat) return false;
        if (tier !== 'all' && a.tier !== tier) return false;
        if (status !== 'all' && statusOf(st) !== status) return false;
        return !needle || a.title.toLowerCase().includes(needle) || a.desc.toLowerCase().includes(needle);
      })
      .sort((x, y) => rank[statusOf(states[x.id]!)] - rank[statusOf(states[y.id]!)] || states[y.id]!.progress / y.goal - states[x.id]!.progress / x.goal);
  }, [all, states, cat, tier, status, q]);

  if (!open) return null;
  const done = all.filter((a) => states[a.id]?.completed).length;
  const claimAll = () => all.forEach((a) => states[a.id] && statusOf(states[a.id]!) === 'claim' && claimAchievement(a.id));

  return (
    <Modal title="Достижения" onClose={() => useOverlays.getState().openAchievements(false)} wide>
      <div className="achx-screen" data-testid="achievements-screen">
        <div className="achx-summary">
          <span className="achx-count" data-testid="achievements-count">
            <Icon name="trophy" size={20} />
            <b>{done}</b> / {all.length}
          </span>
          {toClaim ? (
            <button type="button" className="btn btn--primary" onClick={claimAll} data-testid="achievements-claim-all">
              Забрать все ({toClaim})
            </button>
          ) : null}
        </div>
        <div className="achx-tabs" role="tablist" aria-label="Категории">
          {['all', ...cats].map((c) => (
            <button type="button" key={c} role="tab" aria-selected={cat === c} className="fw-chip" onClick={() => setCat(c)}>
              {c === 'all' ? 'Все' : categoryName(c)}
            </button>
          ))}
        </div>
        <div className="achx-filters">
          <label className="achx-search">
            <Icon name="eye" size={18} />
            <input type="search" placeholder="Поиск достижений" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск достижений" />
          </label>
          <label className="fw-select">
            <span>Статус</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {(Object.keys(STATUS_NAME) as Status[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_NAME[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="fw-select">
            <span>Тир</span>
            <select value={tier} onChange={(e) => setTier(e.target.value as AchievementTier | 'all')}>
              <option value="all">Любой</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_NAME[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {list.length ? (
          <ul className="achx-list">
            {list.map((a) => (
              <AchievementItem key={a.id} a={a} st={states[a.id]!} />
            ))}
          </ul>
        ) : (
          <p className="muted center">Ничего не найдено</p>
        )}
      </div>
    </Modal>
  );
}

/** Кнопка меню «Достижения» с индикатором невзятых наград. */
export function AchievementsMenuButton({ className = 'menu-tool' }: { className?: string }) {
  const n = useUnclaimedCount();
  return (
    <button type="button" className={`${className} achx-menu-btn`} data-testid="menu-achievements" onClick={() => useOverlays.getState().openAchievements(true)} aria-label={n ? `Достижения, наград к получению: ${n}` : 'Достижения'}>
      <Icon name="trophy" size={20} />
      <span>Награды</span>
      {n ? (
        <span className="achx-badge" aria-hidden>
          {n}
        </span>
      ) : null}
    </button>
  );
}
