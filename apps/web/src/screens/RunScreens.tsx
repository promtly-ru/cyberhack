import { useMemo, useState, type ReactNode } from 'react';
import type { CardInstance, RewardItem, RunState, Screen, ShopItem } from '../game/engine';
import { getEventDef, tryRelicDef, cardStats } from '../game/engine';
import { useGame } from '../game/store';
import { TopBar } from '../components/TopBar';
import { Card, CardTerms } from '../components/Card';
import { RelicGlyph, SynergyBar } from '../components/Bits';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { sfx } from '../audio/sfx';
import { DailyBoard, RunEndUnlocks } from './MetaBits';

function cardName(id: string | undefined): string {
  if (!id) return 'программа';
  try {
    return cardStats(id, false).name;
  } catch {
    return id;
  }
}

function Shell({ run, className, eyebrow, title, hint, children, glitch }: { run: RunState; className: string; eyebrow: string; title: string; hint?: ReactNode; children: ReactNode; glitch?: boolean }) {
  return (
    <div className={`screen run-screen ${className}`} data-testid={className}>
      <TopBar run={run} />
      <div className="run-screen__body">
        <header className="panel-head">
          <div className="eyebrow">{eyebrow}</div>
          <h1 className={glitch ? 'glitch' : undefined} data-text={title}>
            {title}
          </h1>
          {hint ? (
            <p className="screen-hint" data-testid="screen-hint">
              {hint}
            </p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

// ---------------- Награды ----------------

export function RewardScreen({ run, screen }: { run: RunState; screen: Extract<Screen, { kind: 'reward' }> }) {
  const dispatch = useGame((s) => s.dispatch);
  const take = (i: number, item: RewardItem) => {
    sfx(item.kind === 'gold' ? 'buy' : 'select');
    dispatch({ type: 'take_reward', index: i });
  };
  return (
    <Shell run={run} className="reward-screen" eyebrow="Доступ получен" title="Трофеи" hint="Нажми на награду, чтобы забрать её. Когда закончишь — «Дальше»." glitch>
      <ul className="reward-list">
        {screen.items.map((item, i) => {
          let icon: ReactNode;
          let label: string;
          let sub = '';
          if (item.kind === 'gold') {
            icon = <Icon name="gold" size={26} />;
            label = `+${item.amount} кредитов`;
          } else if (item.kind === 'relic') {
            const d = tryRelicDef(item.relicId);
            icon = <RelicGlyph id={item.relicId} />;
            label = `Имплант «${d?.name ?? item.relicId}»`;
            sub = d?.description ?? '';
          } else {
            icon = <Icon name="deck" size={26} />;
            label = 'Новая карта в колоду';
            sub = `Выбери 1 из ${item.cardIds.length}`;
          }
          return (
            <li key={`${item.kind}-${i}`}>
              <button className={`reward reward--${item.kind}`} data-testid="reward-item" data-kind={item.kind} onClick={() => take(i, item)}>
                <span className="reward__icon">{icon}</span>
                <span className="reward__text">
                  <b>{label}</b>
                  {sub ? <small>{sub}</small> : null}
                </span>
                <span className="reward__cta">Забрать</span>
              </button>
            </li>
          );
        })}
        {!screen.items.length ? <li className="muted center">Всё собрано.</li> : null}
      </ul>
      <div className="actions">
        <button
          className="btn btn--primary"
          data-testid="reward-leave"
          onClick={() => {
            sfx('click');
            dispatch({ type: 'leave_reward' });
          }}
        >
          Дальше <Icon name="play" size={16} />
        </button>
      </div>
    </Shell>
  );
}

// ---------------- Выбор карты ----------------

export function CardPickScreen({ run, screen }: { run: RunState; screen: Extract<Screen, { kind: 'card_pick' }> }) {
  const dispatch = useGame((s) => s.dispatch);
  return (
    <Shell run={run} className="pick-screen" eyebrow="Новая программа" title="Выбери карту" hint="Возьми одну карту в колоду или пропусти. Подчёркнутые слова — термины, их смысл под картой.">
      <div className="pick-row">
        {screen.cardIds.map((id) => (
          <div key={id} className="pick-slot">
            <button
              className="pick-card"
              data-testid="pick-card"
              aria-label={`Взять «${cardName(id)}»`}
              onClick={() => {
                sfx('buy');
                dispatch({ type: 'pick_card', cardId: id });
              }}
            >
              <Card defId={id} />
            </button>
            <CardTerms defId={id} compact />
          </div>
        ))}
      </div>
      <div className="actions">
        <button
          className="btn btn--ghost"
          data-testid="pick-skip"
          onClick={() => {
            sfx('click');
            dispatch({ type: 'pick_card', cardId: null });
          }}
        >
          Пропустить
        </button>
      </div>
    </Shell>
  );
}

// ---------------- Магазин ----------------

export function ShopScreen({ run, screen }: { run: RunState; screen: Extract<Screen, { kind: 'shop' }> }) {
  const dispatch = useGame((s) => s.dispatch);
  const buy = (i: number, it: ShopItem) => {
    if (it.sold) return;
    if (it.price > run.gold) {
      sfx('error');
      return;
    }
    sfx('buy');
    dispatch({ type: 'shop_buy', index: i });
  };
  const indexed = screen.items.map((it, i) => ({ it, i }));
  const cards = indexed.filter((x) => x.it.kind === 'card');
  const relics = indexed.filter((x) => x.it.kind === 'relic');
  const services = indexed.filter((x) => x.it.kind === 'remove');
  const price = (it: ShopItem) => (
    <span className={`price mono${it.price > run.gold && !it.sold ? ' is-expensive' : ''}`}>
      <Icon name="gold" size={15} />
      {it.sold ? 'продано' : it.price}
    </span>
  );
  return (
    <Shell run={run} className="shop-screen" eyebrow="Даркнет-узел" title="Чёрный рынок" hint="Покупай карты и импланты за кредиты или удали лишнюю карту из колоды. Импланты — бонусы на весь забег.">
      <p className="flavor">«Всё чистое, без закладок. Почти». — брокер по кличке Ноль</p>
      <section>
        <h2 className="section-title">Карты</h2>
        <div className="shop-cards">
          {cards.map(({ it, i }) => (
            <button key={i} className={`shop-item${it.sold ? ' is-sold' : ''}`} onClick={() => buy(i, it)} disabled={it.sold} aria-label={it.sold ? `«${cardName(it.id)}» — продано` : `Купить «${cardName(it.id)}» за ${it.price}`}>
              {it.id ? <Card defId={it.id} /> : null}
              {price(it)}
            </button>
          ))}
        </div>
      </section>
      <section className="shop-lower">
        <div>
          <h2 className="section-title">Импланты</h2>
          <div className="shop-relics">
            {relics.map(({ it, i }) => {
              const d = it.id ? tryRelicDef(it.id) : null;
              return (
                <button key={i} className={`shop-relic${it.sold ? ' is-sold' : ''}`} onClick={() => buy(i, it)} disabled={it.sold} aria-label={`${d?.name ?? it.id ?? 'Имплант'}${it.sold ? ' — продано' : `, цена ${it.price}`}`} {...tip(d?.name ?? '', d?.description ?? '')}>
                  <span className="shop-relic__icon">{it.id ? <RelicGlyph id={it.id} /> : null}</span>
                  <span className="shop-relic__name">{d?.name ?? it.id}</span>
                  {price(it)}
                </button>
              );
            })}
            {!relics.length ? <p className="muted">Пусто</p> : null}
          </div>
        </div>
        <div>
          <h2 className="section-title">Услуги</h2>
          {services.map(({ it, i }) => (
            <button key={i} className={`shop-service${it.sold ? ' is-sold' : ''}`} onClick={() => buy(i, it)} disabled={it.sold}>
              <Icon name="trash" size={26} />
              <span>
                <b>Удалить карту</b>
                <small>Стереть одну карту из колоды</small>
              </span>
              {price(it)}
            </button>
          ))}
        </div>
      </section>
      <div className="actions">
        <button
          className="btn btn--primary"
          onClick={() => {
            sfx('click');
            dispatch({ type: 'leave_shop' });
          }}
        >
          Уйти <Icon name="play" size={16} />
        </button>
      </div>
    </Shell>
  );
}

// ---------------- Безопасный узел ----------------

export function RestScreen({ run }: { run: RunState }) {
  const dispatch = useGame((s) => s.dispatch);
  const heal = Math.floor(run.maxHp * 0.3);
  const canUpgrade = run.deck.some((c) => !c.upgraded);
  return (
    <Shell run={run} className="rest-screen" eyebrow="Шифрованный канал" title="Безопасный узел" hint="Выбери одно: восстановить здоровье или улучшить карту.">
      <div className="rest-core" aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="86" className="rc-ring rc-ring--1" />
          <circle cx="100" cy="100" r="66" className="rc-ring rc-ring--2" />
          <circle cx="100" cy="100" r="46" className="rc-ring rc-ring--3" />
          <path d="M100 52l34 13v24c0 22-15 38-34 46-19-8-34-24-34-46V65z" className="rc-shield" />
          <path d="M100 78v40M80 98h40" className="rc-plus" />
        </svg>
      </div>
      <p className="flavor center">Здесь трассировщики вас не найдут. Есть время на один процесс.</p>
      <div className="rest-options">
        <button
          className="choice choice--heal"
          onClick={() => {
            sfx('heal');
            dispatch({ type: 'rest_heal' });
          }}
        >
          <Icon name="hp" size={34} />
          <b>Перезагрузка</b>
          <small>
            Восстановить ≈30% здоровья (<span className="mono">+{Math.min(heal, run.maxHp - run.hp)}</span>)
          </small>
        </button>
        <button
          className="choice choice--upgrade"
          disabled={!canUpgrade}
          onClick={() => {
            sfx('select');
            dispatch({ type: 'rest_upgrade' });
          }}
        >
          <Icon name="upgrade" size={34} />
          <b>Оптимизация кода</b>
          <small>{canUpgrade ? 'Улучшить одну карту из колоды' : 'Все карты уже улучшены'}</small>
        </button>
      </div>
    </Shell>
  );
}

// ---------------- Событие ----------------

export function EventScreen({ run, screen }: { run: RunState; screen: Extract<Screen, { kind: 'event' }> }) {
  const dispatch = useGame((s) => s.dispatch);
  let ev;
  try {
    ev = getEventDef(screen.eventId);
  } catch {
    ev = null;
  }
  return (
    <Shell run={run} className="event-screen" eyebrow="Неизвестный сигнал" title={ev?.name ?? 'Помехи'} hint="Прочитай сообщение и выбери один из вариантов ниже.">
      <div className="terminal" role="log">
        <div className="terminal__bar">
          <span />
          <span />
          <span />
          <em className="mono">/dev/signal/{screen.eventId}</em>
        </div>
        <p className="terminal__text">
          <span className="prompt mono">&gt; </span>
          {ev?.text ?? 'Сигнал не расшифрован.'}
          <span className="caret" aria-hidden="true" />
        </p>
      </div>
      <ol className="event-options">
        {(ev?.options ?? []).map((o, i) => (
          <li key={i}>
            <button
              className="event-option"
              onClick={() => {
                sfx('select');
                dispatch({ type: 'event_choice', index: i });
              }}
            >
              <span className="mono opt-n">[{i + 1}]</span>
              <span>{o.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </Shell>
  );
}

// ---------------- Выбор карты из колоды ----------------

export function DeckSelectScreen({ run, screen }: { run: RunState; screen: Extract<Screen, { kind: 'select_deck_card' }> }) {
  const dispatch = useGame((s) => s.dispatch);
  const [chosen, setChosen] = useState<CardInstance | null>(null);
  const upgrade = screen.purpose === 'upgrade';
  const cards = useMemo(
    () => run.deck.filter((c) => !upgrade || (!c.upgraded && (!screen.offer || screen.offer.includes(c.uid)))),
    [run.deck, upgrade, screen.offer],
  );
  const hasUpgrade = (c: CardInstance) => {
    try {
      return !!cardStats(c.defId, false).def.upgrade;
    } catch {
      return false;
    }
  };
  return (
    <Shell
      run={run}
      className="deck-select-screen"
      eyebrow={upgrade ? 'Оптимизация' : 'Очистка'}
      title={upgrade ? 'Улучшить карту' : 'Удалить карту'}
      hint={upgrade ? `Тебе предложены ${cards.length} из колоды — выбери одну. Справа появится улучшенная версия.` : 'Выбери карту, которую навсегда уберёшь из колоды.'}
    >
      <SynergyBar deck={run.deck} />
      <div className="card-grid card-grid--select">
        {cards.map((c) => (
          <button
            key={c.uid}
            className={`select-card${chosen?.uid === c.uid ? ' is-chosen' : ''}`}
            onClick={() => {
              sfx('select');
              setChosen(c);
            }}
            aria-pressed={chosen?.uid === c.uid}
          >
            <Card defId={c.defId} upgraded={c.upgraded} />
          </button>
        ))}
      </div>
      {chosen ? (
        <div className="confirm-bar" role="dialog" aria-label="Подтверждение">
          {upgrade ? (
            <div className="upgrade-preview">
              <Card defId={chosen.defId} upgraded={false} />
              <Icon name="play" size={22} className="arrow" />
              <Card defId={chosen.defId} upgraded={hasUpgrade(chosen)} />
            </div>
          ) : (
            <div className="upgrade-preview">
              <Card defId={chosen.defId} upgraded={chosen.upgraded} className="is-doomed" />
            </div>
          )}
          <div className="actions">
            <button className="btn btn--ghost" onClick={() => setChosen(null)}>
              Назад
            </button>
            <button
              className={`btn ${upgrade ? 'btn--primary' : 'btn--danger'}`}
              onClick={() => {
                sfx(upgrade ? 'buff' : 'death');
                dispatch({ type: 'select_deck_card', cardUid: chosen.uid });
              }}
            >
              {upgrade ? 'Улучшить' : 'Удалить'}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button
            className="btn btn--ghost"
            onClick={() => {
              sfx('click');
              dispatch({ type: 'select_deck_card', cardUid: null });
            }}
          >
            Отмена
          </button>
        </div>
      )}
    </Shell>
  );
}

// ---------------- Конец забега ----------------

const CLASS_NAME: Record<string, string> = { netrunner: 'Нетраннер', phreaker: 'Фрикер', ghost: 'Призрак', samurai: 'Кибер-самурай', engineer: 'Инженер' };

export function GameOverScreen({ run, victory }: { run: RunState; victory: boolean }) {
  const toMenu = useGame((s) => s.toMenu);
  const openClassSelect = useGame((s) => s.openClassSelect);
  const dailyResult = useGame((s) => s.dailyResult);
  const runEnd = useGame((s) => s.runEnd);
  const st = run.stats;
  const rows: [string, string | number][] = [
    ['Класс', CLASS_NAME[run.classId] ?? run.classId],
    ['Сложность', `Уровень ${run.ascension}`],
    ['Этаж', run.floor],
    ['Врагов уничтожено', st.enemiesKilled],
    ['Элитных стражей', st.elitesKilled],
    ['Боссов', st.bossesKilled],
    ['Нанесено урона', st.damageDealt],
    ['Сыграно карт', st.cardsPlayed],
    ['Карт в колоде', run.deck.length],
  ];
  const title = victory ? 'Система взломана' : 'Соединение разорвано';
  return (
    <div className={`screen gameover ${victory ? 'is-victory' : 'is-defeat'}`} data-testid="gameover">
      <div className="gameover__inner">
        <div className="eyebrow">{victory ? 'Победа' : 'Поражение'} · сид {run.seed}</div>
        <h1 className="glitch gameover__title" data-text={title}>
          {title}
        </h1>
        <div className="score">
          <span className="score__label">Счёт</span>
          <span className="score__value mono">{run.score.toLocaleString('ru-RU')}</span>
        </div>
        {run.daily ? (
          <p className="muted center">
            {dailyResult === null ? 'Отправка в таблицу лидеров…' : dailyResult.accepted ? `Ежедневный рейтинг: место ${dailyResult.rank ?? '—'}` : 'Результат сохранён локально (сервер недоступен)'}
          </p>
        ) : null}
        {runEnd ? <RunEndUnlocks info={runEnd} /> : null}
        <dl className="stats">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
        {run.daily ? (
          <section className="daily-board" aria-label="Лидеры дня">
            <h2 className="section-title">Лидеры дня</h2>
            {dailyResult === null ? <p className="muted">Ожидание результата…</p> : <DailyBoard seed={run.seed} reloadKey={dailyResult} />}
          </section>
        ) : null}
        <div className="actions">
          <button
            className="btn btn--ghost"
            onClick={() => {
              sfx('click');
              toMenu();
            }}
          >
            В меню
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              sfx('click');
              openClassSelect(false);
            }}
          >
            Новый взлом
          </button>
        </div>
      </div>
    </div>
  );
}
