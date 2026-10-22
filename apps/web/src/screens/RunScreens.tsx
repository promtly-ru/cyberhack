import { useMemo, useState, type ReactNode } from 'react';
import type { CardInstance, RewardItem, RunState, Screen, ShopItem } from '../game/engine';
import { getEventDef, getFirmware, upgradableFirmwares, describeFirmwareEffects, tryRelicDef, cardStats, getLegalActions, blackboxForceCost, blackboxHackCost, RELAY_HEAL_PCT, MAX_SHOP_REFRESHES } from '../game/engine';
import { useGame } from '../game/store';
import { TopBar } from '../components/TopBar';
import { Card, CardTerms } from '../components/Card';
import { RelicGlyph, SynergyBar, FirmwareChecklist } from '../components/Bits';
import { PotionGlyph } from '../components/PotionBar';
import { getMutator, getPotion, POTION_SLOTS, weeklyTitle } from '../game/engine';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { sfx } from '../audio/sfx';
import { RunEndUnlocks, WeeklyBoard, weekLabel } from './MetaBits';

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
  const slotsFull = (run.potions?.length ?? 0) >= POTION_SLOTS;
  // Дальше — только когда всё, что можно забрать, забрано (расходник при полных слотах не блокирует)
  const unclaimed = screen.items.filter((it) => !(it.kind === 'potion' && slotsFull)).length;
  return (
    <Shell run={run} className="reward-screen" eyebrow="Доступ получен" title="Трофеи" hint="Нажми на награду, чтобы забрать её. Когда закончишь — «Дальше»." glitch>
      <ul className="reward-list">
        {screen.items.map((item, i) => {
          let icon: ReactNode;
          let label: string;
          let sub = '';
          let extra: ReactNode = null;
          if (item.kind === 'gold') {
            icon = <Icon name="gold" size={26} />;
            label = `+${item.amount} кредитов`;
          } else if (item.kind === 'relic') {
            const d = tryRelicDef(item.relicId);
            icon = <RelicGlyph id={item.relicId} />;
            label = `Имплант «${d?.name ?? item.relicId}»`;
            sub = d?.description ?? '';
          } else if (item.kind === 'firmware') {
            const fw = getFirmware(item.firmwareId);
            icon = <span className="reward__fw"><Icon name="firmware" size={26} /></span>;
            label = `Прошивка «${fw?.name ?? item.firmwareId}»`;
            sub = fw?.description ?? '';
            extra = <FirmwareChecklist firmwareId={item.firmwareId} deck={run.deck} />;
          } else if (item.kind === 'potion') {
            const p = getPotion(item.potionId);
            icon = <PotionGlyph id={item.potionId} size={26} />;
            label = `Расходник «${p?.name ?? item.potionId}»`;
            sub = slotsFull ? 'Слоты заняты — выпей или выброси расходник на панели сверху' : (p?.description ?? '');
          } else {
            icon = <Icon name="deck" size={26} />;
            label = 'Новая карта в колоду';
            sub = `Выбери 1 из ${item.cardIds.length}`;
          }
          return (
            <li key={`${item.kind}-${i}`}>
              <button className={`reward reward--${item.kind}${item.kind === 'potion' && slotsFull ? ' is-blocked' : ''}`} data-testid="reward-item" data-kind={item.kind} disabled={item.kind === 'potion' && slotsFull} onClick={() => take(i, item)}>
                <span className="reward__icon">{icon}</span>
                <span className="reward__text">
                  <b>{label}</b>
                  {sub ? <small>{sub}</small> : null}
                  {extra}
                </span>
                <span className="reward__cta">{item.kind === 'potion' && slotsFull ? 'Нет места' : 'Забрать'}</span>
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
          disabled={unclaimed > 0}
          onClick={() => {
            sfx('click');
            dispatch({ type: 'leave_reward' });
          }}
        >
          {unclaimed > 0 ? `Сначала забери награды (${unclaimed})` : 'Дальше'} <Icon name="play" size={16} />
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
            {(run.firmwares ?? []).filter((f) => getFirmware(f)?.needs.includes(id) && !run.deck.some((c) => c.defId === id)).map((f) => (
              <span key={f} className="fw-hint">⚡ для прошивки «{getFirmware(f)?.name}»</span>
            ))}
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
  const potionItems = indexed.filter((x) => x.it.kind === 'potion');
  const potionsFull = (run.potions?.length ?? 0) >= POTION_SLOTS;
  const price = (it: ShopItem) => (
    <span className={`price mono${it.price > run.gold && !it.sold ? ' is-expensive' : ''}${it.sale && !it.sold ? ' is-sale' : ''}`}>
      <Icon name="gold" size={15} />
      {it.sold ? 'продано' : it.sale && it.basePrice ? (
        <>
          <s className="price__old">{it.basePrice}</s> {it.price}
        </>
      ) : it.price}
    </span>
  );
  const saleTag = (it: ShopItem) => (it.sale && !it.sold ? <span className="sale-tag" data-testid="sale-tag"><Icon name="sale" size={13} /> −30%</span> : null);
  const upgrades = indexed.filter((x) => x.it.kind === 'upgrade');
  const refreshes = indexed.filter((x) => x.it.kind === 'refresh');
  const canUpgrade = run.deck.some((c) => !c.upgraded) || upgradableFirmwares(run).length > 0;
  const quote = TRADER_QUOTES[Math.min(run.act, 4) - 1] ?? TRADER_QUOTES[0]!;
  return (
    <Shell run={run} className="shop-screen" eyebrow="Даркнет-узел" title="Чёрный рынок" hint="Покупай карты, импланты и расходники за кредиты или удали лишнюю карту из колоды. Импланты — бонусы на весь забег, расходники — разовые.">
      <p className="flavor" data-testid="trader-quote">{quote}</p>
      <section>
        <h2 className="section-title">Карты</h2>
        <div className="shop-cards">
          {cards.map(({ it, i }) => (
            <button key={i} className={`shop-item${it.sold ? ' is-sold' : ''}${it.sale ? ' is-sale' : ''}`} onClick={() => buy(i, it)} disabled={it.sold} aria-label={it.sold ? `«${cardName(it.id)}» — продано` : `Купить «${cardName(it.id)}» за ${it.price}${it.sale ? ' (распродажа)' : ''}`}>
              {saleTag(it)}
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
                <button key={i} className={`shop-relic${it.sold ? ' is-sold' : ''}${it.sale ? ' is-sale' : ''}`} onClick={() => buy(i, it)} disabled={it.sold} aria-label={`${d?.name ?? it.id ?? 'Имплант'}${it.sold ? ' — продано' : `, цена ${it.price}`}`} {...tip(d?.name ?? '', d?.description ?? '')}>
                  <span className="shop-relic__icon">{it.id ? <RelicGlyph id={it.id} /> : null}</span>
                  <span className="shop-relic__name">{d?.name ?? it.id}</span>
                  {saleTag(it)}
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
          {upgrades.map(({ it, i }) => (
            <button key={i} className={`shop-service shop-service--up${it.sold ? ' is-sold' : ''}`} data-testid="shop-upgrade" onClick={() => buy(i, it)} disabled={it.sold || !canUpgrade}>
              <Icon name="upgrade" size={26} />
              <span>
                <b>Улучшить карту</b>
                <small>{canUpgrade ? (upgradableFirmwares(run).length ? 'Карта (1 из 3) или прошивка' : 'Выбрать 1 из 3 случайных карт') : 'Всё уже улучшено'}</small>
              </span>
              {price(it)}
            </button>
          ))}
          {refreshes.map(({ it, i }) => (
            <button key={i} className={`shop-service shop-service--refresh${it.sold ? ' is-sold' : ''}`} data-testid="shop-refresh" onClick={() => buy(i, it)} disabled={it.sold}>
              <Icon name="refresh" size={26} />
              <span>
                <b>Обновить ассортимент</b>
                <small>{it.sold ? 'Лимит обновлений исчерпан' : `Новые товары. Обновлений: ${it.n ?? 0} из ${MAX_SHOP_REFRESHES}`}</small>
              </span>
              <span className={`price mono${it.price > run.gold && !it.sold ? ' is-expensive' : ''}`}>
                <Icon name="gold" size={15} />
                {it.sold ? 'лимит' : it.price}
              </span>
            </button>
          ))}
          {potionItems.length ? (
            <>
              <h2 className="section-title shop-potions__title">Расходники</h2>
              <div className="shop-potions">
                {potionItems.map(({ it, i }) => {
                  const p = it.id ? getPotion(it.id) : undefined;
                  const blocked = !it.sold && potionsFull;
                  return (
                    <button
                      key={i}
                      className={`shop-potion${it.sold ? ' is-sold' : ''}${blocked ? ' is-blocked' : ''}${it.sale ? ' is-sale' : ''}`}
                      data-testid="shop-potion"
                      onClick={() => buy(i, it)}
                      disabled={it.sold || blocked}
                      aria-label={`${p?.name ?? 'Расходник'}${it.sold ? ' — продано' : blocked ? ' — нет свободного слота' : `, цена ${it.price}`}`}
                      {...tip(p?.name ?? '', `${p?.description ?? ''}${blocked ? ' Слоты заняты.' : ''}`)}
                    >
                      {it.id ? <PotionGlyph id={it.id} size={24} /> : null}
                      <span className="shop-potion__text">
                        <b>{p?.name ?? it.id} {saleTag(it)}</b>
                        <small>{p?.description ?? ''}</small>
                      </span>
                      {price(it)}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
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

const TRADER_QUOTES = [
  '«Всё чистое, без закладок. Почти». — брокер по кличке Ноль',
  '«Здесь, в глубине сети, цены выше. Зато и товар без пломб». — торговец Мираж',
  '«Ядро близко, а значит, и моя скидка тоже. Выбирай быстрее». — торговка Эхо',
  '«За последней дверью берут всё. Что берёшь с собой — решай сейчас». — безымянный скупщик',
];

// ---------------- Узлы: лаборатория, чёрный ящик, ретранслятор ----------------

export function NodeScreen({ run, kind }: { run: RunState; kind: 'lab' | 'blackbox' | 'relay' }) {
  const dispatch = useGame((s) => s.dispatch);
  const legal = getLegalActions(run);
  const can = (i: number) => legal.some((a) => a.type === 'node_choice' && a.index === i);
  const choose = (i: number, snd: 'select' | 'heal' | 'buff' = 'select') => {
    sfx(snd);
    dispatch({ type: 'node_choice', index: i });
  };
  const leave = (
    <div className="actions">
      <button className="btn btn--ghost" data-testid="leave-node" onClick={() => { sfx('click'); dispatch({ type: 'leave_node' }); }}>
        Уйти
      </button>
    </div>
  );
  if (kind === 'lab') {
    return (
      <Shell run={run} className="lab-screen" eyebrow="Исследовательский сектор" title="Лаборатория" hint="Выбери одно: улучшить карту (1 из 3 случайных) или трансформировать карту в случайную другой редкости.">
        <p className="flavor center">Стойки с образцами чужого кода. Здесь любую программу можно разобрать и собрать иначе.</p>
        <div className="rest-options">
          <button className="choice choice--upgrade" disabled={!can(0)} onClick={() => choose(0)} data-testid="lab-upgrade">
            <Icon name="upgrade" size={34} />
            <b>Улучшение</b>
            <small>{can(0) ? 'Улучшить одну из трёх карт' : 'Все карты уже улучшены'}</small>
          </button>
          <button className="choice choice--lab" disabled={!can(1)} onClick={() => choose(1)} data-testid="lab-transform">
            <Icon name="lab" size={34} />
            <b>Трансформация</b>
            <small>Заменить карту (1 из 3) на случайную другой редкости</small>
          </button>
        </div>
        {leave}
      </Shell>
    );
  }
  if (kind === 'blackbox') {
    const force = blackboxForceCost(run);
    const hack = blackboxHackCost(run);
    return (
      <Shell run={run} className="blackbox-screen" eyebrow="Запертый контейнер" title="Чёрный ящик" hint="Риск за награду. Вскрыть силой: гарантированный имплант за здоровье. Взломать: 50% бесплатно, иначе удар током и только расходник.">
        <p className="flavor center">Ящик без маркировки гудит так, будто внутри что-то живое.</p>
        <div className="rest-options">
          <button className="choice choice--danger" disabled={!can(0)} onClick={() => choose(0)} data-testid="blackbox-force">
            <Icon name="hp" size={34} />
            <b>Вскрыть силой</b>
            <small>−{force} HP, гарантированный имплант</small>
          </button>
          <button className="choice choice--blackbox" onClick={() => choose(1)} data-testid="blackbox-hack">
            <Icon name="blackbox" size={34} />
            <b>Взломать аккуратно</b>
            <small>50%: имплант без потерь. Иначе −{hack} HP и расходник</small>
          </button>
        </div>
        {leave}
      </Shell>
    );
  }
  const heal = Math.min(Math.floor(run.maxHp * RELAY_HEAL_PCT), run.maxHp - run.hp);
  return (
    <Shell run={run} className="relay-screen" eyebrow="Свободный узел связи" title="Ретранслятор" hint="Бесплатная подзарядка: небольшое лечение и расходник. Если слоты расходников заняты, вместо него +25 кредитов.">
      <p className="flavor center">Заброшенная антенна ещё держит канал и делится запасами с проходящими.</p>
      <div className="rest-options">
        <button className="choice choice--heal" onClick={() => choose(0, 'heal')} data-testid="relay-take">
          <Icon name="relay" size={34} />
          <b>Подключиться</b>
          <small>
            <span className="mono">+{heal}</span> HP и расходник
          </small>
        </button>
      </div>
      {leave}
    </Shell>
  );
}

// ---------------- Безопасный узел ----------------

export function RestScreen({ run }: { run: RunState }) {
  const dispatch = useGame((s) => s.dispatch);
  const heal = Math.floor(run.maxHp * 0.3);
  const canUpgrade = run.deck.some((c) => !c.upgraded) || upgradableFirmwares(run).length > 0;
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
          <small>{canUpgrade ? (upgradableFirmwares(run).length ? 'Улучшить карту или прошивку' : 'Улучшить одну карту из колоды') : 'Всё уже улучшено'}</small>
        </button>
      </div>
    </Shell>
  );
}

function requiresText(r: import('../game/engine').EventRequires | undefined, effects: import('../game/engine').Effect[]): string {
  const parts: string[] = [];
  const cost = effects.reduce((s, e) => (e.type === 'gain_gold' && e.amount < 0 ? s - e.amount : s), 0);
  const gold = Math.max(r?.gold ?? 0, cost);
  if (gold) parts.push(`нужно ${gold} кредитов`);
  if (r?.hp) parts.push(`HP больше ${r.hp}`);
  if (r?.potion) parts.push('нужен расходник');
  if (r?.cardType) parts.push(r.cardType === 'curse' ? 'нужна проклятая карта' : r.cardType === 'attack' ? 'нужна атакующая карта' : `нужна карта типа ${r.cardType}`);
  if (r?.upgradable) parts.push('нужна неулучшенная карта');
  if (r?.flag || r?.noFlag) parts.push('условие не выполнено');
  return parts.join(', ') || 'условие не выполнено';
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
  const legalIdx = new Set(getLegalActions(run).flatMap((a) => (a.type === 'event_choice' ? [a.index] : [])));
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
              className={`event-option${o.outcomes ? ' is-gamble' : ''}`}
              disabled={!legalIdx.has(i)}
              onClick={() => {
                sfx('select');
                dispatch({ type: 'event_choice', index: i });
              }}
            >
              <span className="mono opt-n">[{i + 1}]</span>
              <span>
                {o.label}
                {!legalIdx.has(i) ? <small className="event-option__req"> — недоступно: {requiresText(o.requires, o.effects)}</small> : null}
              </span>
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
  const [chosenFw, setChosenFw] = useState<string | null>(null);
  const upgrade = screen.purpose === 'upgrade';
  const fwOptions = upgrade ? upgradableFirmwares(run) : [];
  const fwDef = chosenFw ? getFirmware(chosenFw) : undefined;
  const transform = screen.purpose === 'transform';
  const cards = useMemo(
    () => run.deck.filter((c) => (!upgrade || !c.upgraded) && (screen.purpose === 'remove' || !screen.offer || screen.offer.includes(c.uid))),
    [run.deck, upgrade, screen.offer, screen.purpose],
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
      eyebrow={upgrade ? 'Оптимизация' : transform ? 'Мутация' : 'Очистка'}
      title={upgrade ? (fwOptions.length ? 'Улучшить карту или прошивку' : 'Улучшить карту') : transform ? 'Трансформировать карту' : 'Удалить карту'}
      hint={upgrade ? `Тебе предложены ${cards.length} из колоды — выбери одну. Справа появится улучшенная версия.` : transform ? 'Выбери карту: она превратится в случайную другую (обычно иной редкости). Результат заранее неизвестен.' : 'Выбери карту, которую навсегда уберёшь из колоды.'}
    >
      <SynergyBar deck={run.deck} />
      <div className="card-grid card-grid--select">
        {cards.map((c) => (
          <button
            key={c.uid}
            className={`select-card${chosen?.uid === c.uid ? ' is-chosen' : ''}`}
            onClick={() => {
              sfx('select');
              setChosenFw(null);
              setChosen(c);
            }}
            aria-pressed={chosen?.uid === c.uid}
          >
            <Card defId={c.defId} upgraded={c.upgraded} />
          </button>
        ))}
      </div>
      {fwOptions.length ? (
        <div className="fw-upgrade-list" role="group" aria-label="Прошивки забега">
          <span className="topbar__relics-label">Прошивки (каждую можно улучшить один раз за забег)</span>
          {fwOptions.map((id) => (
            <button
              key={id}
              type="button"
              className={`btn btn--ghost fw-upgrade-opt${chosenFw === id ? ' is-chosen' : ''}`}
              data-testid="upgrade-firmware-option"
              aria-pressed={chosenFw === id}
              onClick={() => {
                sfx('select');
                setChosen(null);
                setChosenFw(id);
              }}
            >
              <Icon name="firmware" size={18} /> {getFirmware(id)?.name ?? id}
            </button>
          ))}
        </div>
      ) : null}
      {fwDef ? (
        <div className="confirm-bar" role="dialog" aria-label="Подтверждение">
          <div className="upgrade-preview upgrade-preview--fw">
            <span>
              <b>{fwDef.name}</b>
              <br />
              {describeFirmwareEffects(fwDef, 2)}
            </span>
            <Icon name="play" size={22} className="arrow" />
            <span>
              <b>{fwDef.name}+</b>
              <br />
              {describeFirmwareEffects(fwDef, 2, true)}
            </span>
          </div>
          <div className="actions">
            <button className="btn btn--ghost" onClick={() => setChosenFw(null)}>
              Назад
            </button>
            <button
              className="btn btn--primary"
              data-testid="upgrade-firmware-confirm"
              onClick={() => {
                sfx('buff');
                dispatch({ type: 'upgrade_firmware', firmwareId: fwDef.id });
              }}
            >
              Улучшить прошивку
            </button>
          </div>
        </div>
      ) : chosen ? (
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
              {transform ? <span className="mono">→ ???</span> : null}
            </div>
          )}
          <div className="actions">
            <button className="btn btn--ghost" onClick={() => setChosen(null)}>
              Назад
            </button>
            <button
              className={`btn ${upgrade || transform ? 'btn--primary' : 'btn--danger'}`}
              onClick={() => {
                sfx(upgrade || transform ? 'buff' : 'death');
                dispatch({ type: 'select_deck_card', cardUid: chosen.uid });
              }}
            >
              {upgrade ? 'Улучшить' : transform ? 'Трансформировать' : 'Удалить'}
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

const CLASS_NAME: Record<string, string> = { netrunner: 'Нетраннер', phreaker: 'Фрикер', ghost: 'Призрак', samurai: 'Кибер-самурай', engineer: 'Инженер', biohacker: 'Биохакер', droneop: 'Оператор дронов', chrono: 'Хроно-хакер', vabanker: 'Ва-банкер' };

export function GameOverScreen({ run, victory }: { run: RunState; victory: boolean }) {
  const toMenu = useGame((s) => s.toMenu);
  const openClassSelect = useGame((s) => s.openClassSelect);
  const weeklyResult = useGame((s) => s.weeklyResult);
  const runEnd = useGame((s) => s.runEnd);
  const st = run.stats;
  const rows: [string, string | number][] = [
    ['Класс', CLASS_NAME[run.classId] ?? run.classId],
    ['Сложность', `Уровень ${run.ascension}`],
    ...(run.mutators?.length ? [['Мутаторы', run.mutators.map((id) => getMutator(id)?.name ?? id).join(', ')] as [string, string]] : []),
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
        {run.weekly ? (
          <p className="muted center" data-testid="weekly-result">
            {weeklyResult === null
              ? 'Отправка в таблицу лидеров…'
              : weeklyResult.accepted
                ? `Вызов ${weekLabel(run.weekly)}: место ${weeklyResult.rank ?? '—'}${weeklyResult.attemptsLeft !== undefined ? ` · попыток осталось ${weeklyResult.attemptsLeft}` : ''} · титул «${weeklyTitle(run.weekly)}» получен`
                : weeklyResult.reason === 'attempts_exhausted'
                  ? 'Все 3 попытки недели использованы: результат не засчитан'
                  : 'Результат сохранён локально (сервер недоступен)'}
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
        {run.weekly ? (
          weeklyResult === null ? (
            <p className="muted">Ожидание результата…</p>
          ) : (
            <WeeklyBoard limit={10} reloadKey={weeklyResult} showRules={false} />
          )
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
