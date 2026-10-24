/**
 * Сценарий обучения: шаги, их цели на экране и условия перехода.
 * Переходы — по состоянию игры (useGame), а не по таймерам.
 */
import type { ReactNode } from 'react';
import type { CombatState, MapNodeKind, RunState } from '../game/engine';
import { getEnemyDef, listClasses } from '../game/engine';
import { NODE_LABEL } from '../screens/MapScreen';
import { Icon } from '../components/Icon';

/** Где сейчас игрок (для привязки шага к экрану). */
export type ScreenKey =
  | 'none'
  | 'map'
  | 'combat'
  | 'reward'
  | 'card_pick'
  | 'event'
  | 'implant_node'
  | 'implant'
  | 'shop'
  | 'rest'
  | 'game_over'
  | 'other';

/** Снимок боя на входе в шаг: от него считаем «урон нанесён», «блок появился», «ход сменился». */
export interface Snap {
  enemyHp: number;
  block: number;
  hp: number;
  turn: number;
}

export interface Ctx {
  run: RunState;
  combat: CombatState | null;
  screen: ScreenKey;
  snap: Snap;
  /** Состояние игрока прямо перед концом хода (для разбора хода врага) */
  pre: { block: number; hp: number };
}

/**
 * coach — затемнение, спотлайт и «Далее», клики по игре закрыты;
 * action — спотлайт без блокировки: ждём действия игрока;
 * mini — маленькая плашка-напоминание, игра свободна;
 * final — финальное окно с выбором.
 */
export type Mode = 'coach' | 'action' | 'mini' | 'final';

export interface Step {
  id: string;
  mode: Mode;
  screens: ScreenKey[];
  title?: string;
  text: (c: Ctx) => ReactNode;
  /** Селекторы цели по порядку: берётся первый видимый элемент. null — пузырь по центру. */
  target?: (c: Ctx) => string[] | null;
  /** Шаг выполнен — переходим дальше сам */
  done?: (c: Ctx) => boolean;
  /** Можно ли сейчас выполнить ожидаемое действие (по DOM). Нет — показываем «Далее». */
  canAct?: () => boolean;
  /** Пропустить шаг (например, кредиты уже забраны) */
  skip?: (c: Ctx) => boolean;
}

export function enemyHp(c: CombatState | null): number {
  return c ? c.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0) : 0;
}

export function makeSnap(c: CombatState | null): Snap {
  return { enemyHp: enemyHp(c), block: c?.player.block ?? 0, hp: c?.player.hp ?? 0, turn: c?.turn ?? 0 };
}

function aliveEnemy(c: Ctx) {
  return c.combat?.enemies.find((e) => e.hp > 0) ?? null;
}

function enemyName(c: Ctx): string {
  const e = aliveEnemy(c);
  if (!e) return 'враг';
  try {
    return getEnemyDef(e.defId).name;
  } catch {
    return 'враг';
  }
}

const exists = (sel: string) => typeof document !== 'undefined' && !!document.querySelector(sel);

const ANY_ATTACK_SEL = '[data-testid="hand-card"][data-playable="1"][data-targeted="1"]';
const ANY_BLOCK_SEL = '[data-testid="hand-card"][data-playable="1"][data-block="1"]';
const SELECTED_TARGETED = '[data-testid="hand-card"][aria-pressed="true"][data-targeted="1"]';
const SELECTED_BLOCK = '[data-testid="hand-card"][aria-pressed="true"][data-block="1"]';
const AVAILABLE_NODE = '[data-testid="map-node"][data-state="available"]';

const LEGEND_SEL = '.map-legend[open]';

/** Легенда карты — сворачиваемый блок; подсвечиваем её, только если она раскрыта. */
function legendVisible(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector(LEGEND_SEL);
  return !!el && el.getBoundingClientRect().width > 0;
}

function NodeKinds() {
  const kinds: MapNodeKind[] = ['combat', 'event', 'signal', 'shop', 'elite', 'rest', 'boss'];
  return (
    <ul className="tut-kinds">
      {kinds.map((k) => (
        <li key={k} className={`kind-${k}`}>
          <span className="tut-kinds__icon" aria-hidden="true">
            <Icon name={k} size={16} />
          </span>
          <span>
            <b>{NODE_LABEL[k].name}</b> — {NODE_LABEL[k].text.replace(/\.$/, '').toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Есть ли в наградах предмет нужного вида */
function hasReward(c: Ctx, kind: string): boolean {
  return c.run.screen.kind === 'reward' && c.run.screen.items.some((i) => i.kind === kind);
}

/** Шаг «иди на следующий узел»: подсветка узла, ждём, пока игрок уйдёт с карты */
function goStep(id: string, title: string, text: string): Step {
  return {
    id,
    mode: 'action',
    screens: ['map'],
    title,
    text: () => text,
    target: () => [AVAILABLE_NODE],
    done: (c) => c.screen !== 'map',
  };
}

/** Невидимое ожидание: игрок сам доигрывает экран, ждём возврата на карту */
function waitMap(id: string): Step {
  return { id, mode: 'mini', screens: [], text: () => null, done: (c) => c.screen === 'map' };
}

/** Напоминание-плашка на время боя: ждём конца боя */
function fightStep(id: string, text: string): Step {
  return { id, mode: 'mini', screens: ['combat'], text: () => text, done: (c) => c.screen !== 'combat' };
}

/** Шаг зависит от экрана: на другом экране пропускаем */
const onlyOn = (screen: ScreenKey) => (c: Ctx) => c.screen !== screen;

export const STEPS: Step[] = [
  // ---------- Карта ----------
  {
    id: 'map-intro',
    mode: 'coach',
    screens: ['map'],
    title: 'Карта сети',
    text: () => 'Это карта сети. Идёшь по узлам к боссу акта, назад пути нет. Акт в обучении короткий: каждую механику покажем по разу.',
  },
  {
    id: 'map-kinds',
    mode: 'coach',
    screens: ['map'],
    title: 'Узлы бывают разные',
    text: () =>
      legendVisible() ? (
        'Легенда раскрыта: здесь написано, что значит каждый значок узла.'
      ) : (
        <>
          <span>Значок показывает, что ждёт в узле:</span>
          <NodeKinds />
          <span className="tut-note">Этот список всегда в блоке «Легенда» под карточками.</span>
        </>
      ),
    target: () => (legendVisible() ? [LEGEND_SEL] : null),
  },
  goStep('map-node', 'Первый узел', 'Начнём с боя. Нажми на подсвеченный узел.'),

  // ---------- Бой 1 ----------
  {
    id: 'player',
    mode: 'coach',
    screens: ['combat'],
    title: 'Это ты',
    text: (c) => {
      let name = c.run.classId as string;
      try {
        name = listClasses().find((k) => k.id === c.run.classId)?.name ?? name;
      } catch {
        /* имя по id */
      }
      return `Класс «${name}». Полоска под тобой — HP: ${c.combat?.player.hp ?? 0} из ${c.combat?.player.maxHp ?? 0}. Дойдёт до нуля — забег окончен.`;
    },
    target: () => ['[data-tut="player"] .unit', '[data-tut="player"]'],
  },
  {
    id: 'enemy',
    mode: 'coach',
    screens: ['combat'],
    title: 'Враг',
    text: (c) => `Это ${enemyName(c)}. Сбей HP всех врагов до нуля — и узел взломан.`,
    target: () => ['[data-testid="enemy"]'],
  },
  {
    id: 'intent',
    mode: 'coach',
    screens: ['combat'],
    title: 'Намерение врага',
    text: (c) => {
      const it = aliveEnemy(c)?.intent;
      const dmg = it?.damage !== undefined ? (it.times && it.times > 1 ? `${it.damage}×${it.times}` : String(it.damage)) : null;
      return dmg
        ? `Значок над врагом — что он сделает в свой ход. Сейчас он ударит на ${dmg}.`
        : 'Значок над врагом — что он сделает в свой ход. Наведи на него или нажми, и появится подсказка.';
    },
    target: () => ['[data-tut="intent"]'],
  },
  {
    id: 'energy',
    mode: 'coach',
    screens: ['combat'],
    title: 'Энергия',
    text: (c) => `Энергия: ${c.combat?.maxEnergy ?? 3} на ход. Цена карты — цифра в её углу. В новом ходу энергия снова полная.`,
    target: () => ['[data-tut="energy"]'],
  },
  {
    id: 'hand',
    mode: 'coach',
    screens: ['combat'],
    title: 'Рука',
    text: () => 'Твоя рука. Цвет рамки — тип карты: атака, защита, усиление. Зажми карту, чтобы прочитать её целиком. Несыгранное в конце хода уходит в сброс.',
    target: () => ['[data-testid="hand"]'],
  },
  {
    id: 'attack',
    mode: 'action',
    screens: ['combat'],
    title: 'Атакуй',
    text: () => (exists(SELECTED_TARGETED) ? 'Теперь нажми на врага.' : 'Атака бьёт выбранного врага. Нажми на подсвеченную карту, а потом на врага.'),
    target: () => (exists(SELECTED_TARGETED) ? ['[data-testid="enemy"]'] : [ANY_ATTACK_SEL]),
    done: (c) => enemyHp(c.combat) < c.snap.enemyHp || c.screen !== 'combat',
    canAct: () => exists(ANY_ATTACK_SEL) || exists(SELECTED_TARGETED),
  },
  {
    id: 'block',
    mode: 'action',
    screens: ['combat'],
    title: 'Защищайся',
    text: () =>
      exists(SELECTED_BLOCK)
        ? 'Нажми на карту ещё раз — она сработает.'
        : 'Теперь защита. Блок поглощает урон до начала твоего следующего хода. Нажми на карту с блоком два раза.',
    target: () => [SELECTED_BLOCK, ANY_BLOCK_SEL],
    done: (c) => (c.combat?.player.block ?? 0) > c.snap.block || c.screen !== 'combat',
    canAct: () => exists(ANY_BLOCK_SEL) || exists(SELECTED_BLOCK),
  },
  {
    id: 'end-turn',
    mode: 'action',
    screens: ['combat'],
    title: 'Конец хода',
    text: (c) => ((c.combat?.energy ?? 0) > 0 ? 'Энергия ещё есть — можно сыграть что-то ещё. Потом жми «Конец хода».' : 'Энергия кончилась. Жми «Конец хода».'),
    target: () => ['[data-testid="end-turn"]'],
    done: (c) => (c.combat?.turn ?? 0) > c.snap.turn || c.screen !== 'combat',
  },
  {
    id: 'after-enemy',
    mode: 'coach',
    screens: ['combat'],
    title: 'Ход врага',
    text: (c) => {
      const lost = Math.max(0, c.pre.hp - (c.combat?.player.hp ?? c.pre.hp));
      const head =
        c.pre.block > 0 && lost > 0 ? `Враг ударил: блок принял ${c.pre.block}, а ${lost} прошло в HP.`
        : c.pre.block > 0 ? 'Блок принял весь удар, HP целы.'
        : lost > 0 ? `Блока не было, весь удар (${lost}) пришёлся в HP.`
        : 'В этот раз враг не атаковал.';
      return `${head} В начале твоего хода блок сгорает — ставь его заново, когда враг замахивается.`;
    },
    target: () => ['[data-tut="player"] .unit', '[data-tut="player"]'],
    skip: onlyOn('combat'),
  },
  {
    id: 'statuses',
    mode: 'coach',
    screens: ['combat'],
    title: 'Статусы',
    text: () => 'Значки у полоски HP — статусы: уязвимость, слабость, яд и другие. Цифра — сила или сколько ходов осталось. Наведи или нажми на значок — узнаешь, что он делает.',
    target: () => ['.status-row:not(.is-empty)', '[data-tut="player"]'],
    skip: onlyOn('combat'),
  },
  fightStep('finish', 'Добей врага сам. Замахивается — ставь блок.'),

  // ---------- Награды 1 ----------
  {
    id: 'reward-gold',
    mode: 'coach',
    screens: ['reward'],
    title: 'Трофеи',
    text: () => 'За победу дают награды. Кредиты — деньги сети: на них покупают карты и импланты на Чёрном рынке.',
    target: () => ['[data-testid="reward-item"][data-kind="gold"]'],
    skip: (c) => c.screen !== 'reward' || !hasReward(c, 'gold'),
  },
  {
    id: 'reward-card',
    mode: 'coach',
    screens: ['reward'],
    title: 'Новая карта',
    text: () => 'Новая карта: выбери одну из трёх, и она войдёт в колоду. Можно и пропустить — слабые карты мешают сильным приходить в руку.',
    target: () => ['[data-testid="reward-item"][data-kind="card_choice"]', '[data-testid="reward-item"][data-kind="card"]'],
    skip: (c) => c.screen !== 'reward' || !hasReward(c, 'card_choice'),
  },
  {
    id: 'reward-potion',
    mode: 'coach',
    screens: ['reward'],
    title: 'Расходник',
    text: () => 'Расходник — разовый модуль: лечение, урон, блок и не только. Забери его, он ляжет в слот на верхней панели.',
    target: () => ['[data-testid="reward-item"][data-kind="potion"]'],
    skip: (c) => c.screen !== 'reward' || !hasReward(c, 'potion'),
  },
  waitMap('reward-free'),
  {
    id: 'potion-use',
    mode: 'coach',
    screens: ['map'],
    title: 'Как использовать расходник',
    text: () => 'Расходники лежат здесь. В бою нажми на слот и выбери «Использовать»: эффект сразу и без энергии. Слотов мало, лишнее можно выбросить.',
    target: () => ['[data-testid="potion-bar"]', '[data-testid="potion-slot"]'],
    skip: (c) => c.screen !== 'map' || (c.run.potions ?? []).length === 0,
  },

  // ---------- Событие ----------
  goStep('map-event', 'Событие', 'Дальше — событие. Нажми на узел.'),
  {
    id: 'event-intro',
    mode: 'coach',
    screens: ['event'],
    title: 'Событие',
    text: () => 'Событие — короткая история с выбором. У вариантов есть цена и награда: HP, кредиты, карты. Если вариант недоступен, рядом написано почему. Выбирай сам.',
    target: () => ['.event-options'],
    skip: onlyOn('event'),
  },
  waitMap('event-free'),

  // ---------- Бой 2 ----------
  goStep('map-combat2', 'Ещё бой', 'Этот бой — сам. Новый враг ходит по-своему: следи за намерением.'),
  fightStep('combat2', 'Смотри на намерение врага и ставь блок вовремя.'),
  waitMap('reward2-free'),

  // ---------- Перехват и импланты ----------
  goStep('map-signal', 'Перехват', 'Впереди Перехват — там всегда имплант. Нажми на узел.'),
  {
    id: 'signal',
    mode: 'action',
    screens: ['implant_node'],
    title: 'Перехват',
    text: () => 'Перехват ловит имплант из сети. Жми «Получить имплант».',
    target: () => ['[data-testid="node-option-0"]'],
    done: (c) => c.screen !== 'implant_node',
  },
  {
    id: 'implant-card',
    mode: 'coach',
    screens: ['implant'],
    title: 'Имплант',
    text: () =>
      'Имплант — бонус к забегу. Цвет рамки — его сила: красный вредит, дальше серый, зелёный, синий, фиолетовый и золотой. Классовый — особый, только для твоего класса.',
    target: () => ['[data-testid="implant-card"]'],
    skip: onlyOn('implant'),
  },
  {
    id: 'implant-cond',
    mode: 'coach',
    screens: ['implant'],
    title: 'Условие',
    text: () => 'Строка внизу — сколько имплант работает: до конца забега, несколько боёв или пока не выполнишь задачу. Красный снимается, когда сделаешь его задачу.',
    target: () => ['[data-testid="implant-card"] .imp-card__cond', '[data-testid="implant-card"]'],
    skip: onlyOn('implant'),
  },
  {
    id: 'implant-ack',
    mode: 'action',
    screens: ['implant'],
    title: 'Забирай',
    text: () => 'Жми «Принять».',
    target: () => ['[data-testid="implant-ack"]'],
    done: (c) => c.screen !== 'implant',
    skip: onlyOn('implant'),
  },
  {
    id: 'implant-menu',
    mode: 'coach',
    screens: ['map'],
    title: 'Меню имплантов',
    text: () => 'Все импланты — в этом меню: цвет, описание, условие и прогресс задач.',
    target: () => ['[data-testid="implant-menu-btn"]'],
    skip: onlyOn('map'),
  },

  // ---------- Магазин ----------
  goStep('map-shop', 'Чёрный рынок', 'Дальше — Чёрный рынок. Загляни.'),
  {
    id: 'shop-intro',
    mode: 'coach',
    screens: ['shop'],
    title: 'Чёрный рынок',
    text: (c) => `Здесь продают карты, импланты и расходники. Цена — под товаром, у тебя ${c.run.gold} кр. Нажми на товар, чтобы купить.`,
    target: () => ['.shop-cards', '.shop-screen'],
    skip: onlyOn('shop'),
  },
  {
    id: 'shop-remove',
    mode: 'coach',
    screens: ['shop'],
    title: 'Удалить карту',
    text: () => 'Удаление карты — тоже услуга. Чем тоньше колода, тем чаще приходят сильные карты.',
    target: () => ['.shop-lower .shop-service'],
    skip: onlyOn('shop'),
  },
  {
    id: 'shop-red',
    mode: 'coach',
    screens: ['shop'],
    title: 'Снять красный',
    text: () => 'Поймал красный имплант — здесь его можно снять за кредиты. Каждый следующий раз дороже.',
    target: () => ['[data-testid="shop-remove-red"]'],
    skip: onlyOn('shop'),
  },
  waitMap('shop-free'),

  // ---------- Элита ----------
  goStep('map-elite', 'Элита', 'Элита — сильный враг. Зато с неё падают импланты и прошивка.'),
  fightStep('elite', 'Элита бьёт больнее. Туго — используй расходник.'),
  {
    id: 'reward-firmware',
    mode: 'coach',
    screens: ['reward'],
    title: 'Прошивка',
    text: () => 'Прошивка ⚡ даёт мощный бонус, но только когда в колоде собраны все её особые карты. Список нужных карт — в панели сверху, наведи на прошивку. Комплект собирай из наград и магазина.',
    target: () => ['[data-testid="reward-item"][data-kind="firmware"]'],
    skip: (c) => c.screen !== 'reward' || !hasReward(c, 'firmware'),
  },
  {
    id: 'reward-relic',
    mode: 'coach',
    screens: ['reward'],
    title: 'Импланты с элиты',
    text: () => 'Элита и босс дают импланты. Цвет виден сразу, отказаться нельзя — красный потом снимешь на рынке или привале.',
    target: () => ['[data-testid="reward-item"][data-kind="relic"]'],
    skip: (c) => c.screen !== 'reward' || !hasReward(c, 'relic'),
  },
  waitMap('elite-free'),

  // ---------- Привал ----------
  goStep('map-rest', 'Привал', 'Перед боссом — привал.'),
  {
    id: 'rest',
    mode: 'coach',
    screens: ['rest'],
    title: 'Привал',
    text: () => 'Выбери одно: подлечиться, улучшить карту или выжечь красный имплант, если он есть. Перед боссом лечение обычно важнее.',
    target: () => ['.rest-screen .rest-options'],
    skip: onlyOn('rest'),
  },
  waitMap('rest-free'),

  // ---------- Босс ----------
  goStep('map-boss', 'Босс', 'Ядро системы — босс акта. Победишь — обучение пройдено.'),
  {
    id: 'boss',
    mode: 'mini',
    screens: ['combat'],
    text: () => 'Босс: много HP и опасные ходы. Следи за намерением и используй всё, что есть.',
    done: (c) => c.run.status === 'won',
  },
  {
    id: 'done',
    mode: 'final',
    screens: ['game_over'],
    title: 'Обучение пройдено!',
    text: () => 'Ты прошёл всё главное: бой, награды, событие, импланты, рынок, элиту, привал и босса. В настоящем забеге четыре акта и выбор пути. Правила и режимы — в меню, раздел «Как играть».',
  },
  // Поражение: сюда переходим из любого шага (tutorialStore), в обычный порядок не входит
  {
    id: 'lost',
    mode: 'final',
    screens: ['game_over'],
    title: 'Почти получилось',
    text: () => 'Проиграть в обучении — нормально. Попробуй ещё раз: карты и враги будут другими. Совет: смотри на намерение врага, ставь блок перед сильным ударом и не забывай про расходники.',
  },
];

/** Номер шага для счётчика «3 / 12» — мини-плашки и финал не считаем. */
export const COUNTED = STEPS.filter((s) => s.mode === 'coach' || s.mode === 'action').map((s) => s.id);
