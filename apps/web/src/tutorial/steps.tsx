/**
 * Сценарий обучения: шаги, их цели на экране и условия перехода.
 * Переходы — по состоянию игры (useGame), а не по таймерам.
 */
import type { ReactNode } from 'react';
import type { CombatState, MapNodeKind, RunState } from '../game/engine';
import { DIFFICULTY_INFO, cardStats, getEnemyDef, listClasses } from '../game/engine';
import { CLASS_STYLE } from '../screens/MenuScreens';
import { NODE_LABEL } from '../screens/MapScreen';
import { Icon } from '../components/Icon';

/** Сид обучения: в первом бою один Спам-бот, в стартовой руке есть и «Пинг», и «Файрвол». */
export const TUTORIAL_SEED = 'TUTOR12';

/** Где сейчас игрок (для привязки шага к экрану). */
export type ScreenKey = 'none' | 'map' | 'combat' | 'reward' | 'card_pick' | 'other';

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

/** Имя карты и величина эффекта (урон/блок) из движка — чтобы текст не расходился с картой. */
function cardInfo(id: string, effect: 'damage' | 'block', fallbackName: string): { name: string; amount: number | null } {
  try {
    const st = cardStats(id, false);
    const eff = st.def.effects.find((e) => e.type === effect) as { amount?: number } | undefined;
    return { name: st.name, amount: typeof eff?.amount === 'number' ? eff.amount : null };
  } catch {
    return { name: fallbackName, amount: null };
  }
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

const PING_SEL = '[data-testid="hand-card"][data-playable="1"][data-def="nr_ping"]';
const ANY_ATTACK_SEL = '[data-testid="hand-card"][data-playable="1"][data-targeted="1"]';
const FIREWALL_SEL = '[data-testid="hand-card"][data-playable="1"][data-def="nr_firewall"]';
const ANY_BLOCK_SEL = '[data-testid="hand-card"][data-playable="1"][data-block="1"]';
const SELECTED_TARGETED = '[data-testid="hand-card"][aria-pressed="true"][data-targeted="1"]';
const SELECTED_FIREWALL = '[data-testid="hand-card"][aria-pressed="true"][data-def="nr_firewall"]';
const SELECTED_BLOCK = '[data-testid="hand-card"][aria-pressed="true"][data-block="1"]';

const LEGEND_SEL = '.map-legend';

/** На широком экране легенда карты видна сбоку, на телефоне спрятана под кнопкой. */
function legendVisible(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector(LEGEND_SEL);
  return !!el && el.getBoundingClientRect().width > 0;
}

function NodeKinds() {
  const kinds: MapNodeKind[] = ['combat', 'elite', 'event', 'shop', 'rest', 'treasure', 'boss'];
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

export const STEPS: Step[] = [
  {
    id: 'map-intro',
    mode: 'coach',
    screens: ['map'],
    title: 'Карта сети',
    text: () => 'Это карта сети. Ты стартуешь внизу и пробиваешься наверх, к боссу акта. Ходить можно только по линиям, от узла к узлу.',
  },
  {
    id: 'map-node',
    mode: 'action',
    screens: ['map'],
    title: 'Первый узел',
    text: () => 'Кружки — это узлы. Начнём с боя: нажми на подсвеченный сервер.',
    // Круг узла без пульсирующего ореола — иначе рамка «дышит» вместе с анимацией
    target: () => [
      '[data-testid="map-node"][data-state="available"][data-kind="combat"] .map-node__halo',
      '[data-testid="map-node"][data-state="available"][data-kind="combat"]',
      '[data-testid="map-node"][data-state="available"]',
    ],
    done: (c) => c.screen === 'combat',
  },
  {
    id: 'player',
    mode: 'coach',
    screens: ['combat'],
    title: 'Это ты',
    text: (c) => `Полоска под тобой — здоровье (HP), сейчас ${c.combat?.player.hp ?? 0} из ${c.combat?.player.maxHp ?? 0}. Упадёт до нуля — забег окончен.`,
    target: () => ['[data-tut="player"] .unit', '[data-tut="player"]'],
  },
  {
    id: 'class',
    mode: 'coach',
    screens: ['combat'],
    title: 'Твой класс',
    text: (c) => {
      let name = c.run.classId as string;
      try {
        name = listClasses().find((k) => k.id === c.run.classId)?.name ?? name;
      } catch {
        /* имя по id */
      }
      const style = CLASS_STYLE[c.run.classId];
      return `Ты играешь за класс «${name}». Класс задаёт стартовую колоду, здоровье и имплант на весь забег.${style ? ` Стиль: ${style}` : ''} Остальные классы открываются победами, их видно в «Новый взлом».`;
    },
    target: () => ['[data-tut="player"] .unit', '[data-tut="player"]'],
  },
  {
    id: 'enemy',
    mode: 'coach',
    screens: ['combat'],
    title: 'Враг',
    text: (c) => `Это ${enemyName(c)}. Сбей его HP до нуля — и сервер взломан.`,
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
        ? `Значок над врагом показывает, что он сделает в свой ход. Сейчас он собирается ударить на ${dmg}.`
        : 'Значок над врагом показывает, что он сделает в свой ход. Наведи на него или нажми — появится подсказка.';
    },
    target: () => ['[data-tut="intent"]'],
  },
  {
    id: 'energy',
    mode: 'coach',
    screens: ['combat'],
    title: 'Энергия',
    text: (c) => `Это энергия: ${c.combat?.maxEnergy ?? 3} на ход. Каждая карта стоит энергию — цифра в её левом верхнем углу. В новом ходу энергия восстанавливается.`,
    target: () => ['[data-tut="energy"]'],
  },
  {
    id: 'hand',
    mode: 'coach',
    screens: ['combat'],
    title: 'Рука',
    text: () => 'Это твоя рука. Несыгранные карты в конце хода уходят в сброс, а в новом ходу ты берёшь свежие из колоды.',
    target: () => ['[data-testid="hand"]'],
  },
  {
    id: 'ping',
    mode: 'action',
    screens: ['combat'],
    title: 'Атакуй',
    text: () => {
      if (exists(SELECTED_TARGETED)) return 'Теперь нажми на врага.';
      const p = cardInfo('nr_ping', 'damage', 'Пинг');
      return `${p.amount !== null ? `«${p.name}» наносит ${p.amount} урона. ` : ''}Нажми на карту «${p.name}», а потом на врага.`;
    },
    target: () => (exists(SELECTED_TARGETED) ? ['[data-testid="enemy"]'] : [PING_SEL, ANY_ATTACK_SEL]),
    done: (c) => enemyHp(c.combat) < c.snap.enemyHp,
    canAct: () => exists(ANY_ATTACK_SEL) || exists(SELECTED_TARGETED),
  },
  {
    id: 'block',
    mode: 'action',
    screens: ['combat'],
    title: 'Защищайся',
    text: () => {
      if (exists(SELECTED_BLOCK)) return 'Нажми на карту ещё раз — она сработает.';
      if (!exists(FIREWALL_SEL)) return 'Попал! Теперь защита: возьми карту с блоком. Блок поглощает урон до начала твоего следующего хода. Нажми на карту два раза.';
      const f = cardInfo('nr_firewall', 'block', 'Файрвол');
      return `Попал! Теперь защита: «${f.name}» даёт ${f.amount ?? 'немного'} блока. Блок поглощает урон до начала твоего следующего хода. Нажми на карту два раза.`;
    },
    target: () => [SELECTED_BLOCK, FIREWALL_SEL, ANY_BLOCK_SEL],
    done: (c) => (c.combat?.player.block ?? 0) > c.snap.block,
    canAct: () => exists(ANY_BLOCK_SEL) || exists(SELECTED_BLOCK),
  },
  {
    id: 'end-turn',
    mode: 'action',
    screens: ['combat'],
    title: 'Конец хода',
    text: (c) =>
      (c.combat?.energy ?? 0) > 0
        ? 'Энергия ещё есть — можешь сыграть что-нибудь ещё. Потом жми «Конец хода», и враг сделает свой ход.'
        : 'Энергия кончилась. Жми «Конец хода» — теперь ходит враг.',
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
        c.pre.block > 0 && lost > 0 ? `Враг ударил: блок принял ${c.pre.block} урона, а ${lost} прошло в HP.`
        : c.pre.block > 0 ? 'Блок принял весь удар — HP не тронуто.'
        : lost > 0 ? `Блока не было, и весь удар (${lost}) пришёлся в HP.`
        : 'В этот раз враг не атаковал.';
      return `${head} В начале твоего хода блок обнуляется — ставь его заново, когда враг собирается бить.`;
    },
    target: () => ['[data-tut="player"] .unit', '[data-tut="player"]'],
    skip: (c) => c.screen !== 'combat',
  },
  {
    id: 'finish',
    mode: 'mini',
    screens: ['combat'],
    text: () => 'Добей врага сам. Замахивается — ставь блок.',
    done: (c) => c.screen === 'reward' || c.screen === 'card_pick' || c.screen === 'map',
  },
  {
    id: 'reward-gold',
    mode: 'coach',
    screens: ['reward'],
    title: 'Трофеи',
    text: () => 'За победу дают награды. Кредиты — деньги сети: их тратят на Чёрном рынке на карты и импланты.',
    target: () => ['[data-testid="reward-item"][data-kind="gold"]'],
    skip: (c) => c.screen !== 'reward' || !(c.run.screen.kind === 'reward' && c.run.screen.items.some((i) => i.kind === 'gold')),
  },
  {
    id: 'reward-card',
    mode: 'coach',
    screens: ['reward'],
    title: 'Новая карта',
    text: () => 'А здесь новая карта: выбери одну из трёх, и она попадёт в колоду. Брать не обязательно — лишние слабые карты мешают сильным приходить в руку.',
    target: () => ['[data-testid="reward-item"][data-kind="card_choice"]', '[data-testid="reward-item"][data-kind="card"]'],
    skip: (c) => c.screen !== 'reward' || !(c.run.screen.kind === 'reward' && c.run.screen.items.some((i) => i.kind === 'card_choice')),
  },
  {
    id: 'reward-firmware',
    mode: 'coach',
    screens: ['reward'],
    title: 'Прошивка',
    text: () => 'Прошивка ⚡ даёт мощный бонус, но только если в колоде собраны все её особые карты. Наведи на неё в панели сверху: там список нужных карт. Собирай комплект из наград и магазина.',
    target: () => ['[data-testid="reward-item"][data-kind="firmware"]'],
    skip: (c) => c.screen !== 'reward' || !(c.run.screen.kind === 'reward' && c.run.screen.items.some((i) => i.kind === 'firmware')),
  },
  {
    id: 'reward-free',
    // Ничего не показываем: экраны наград и выбора карты сами подсказывают строкой под заголовком
    mode: 'mini',
    screens: [],
    text: () => null,
    done: (c) => c.screen === 'map',
  },
  {
    id: 'map-kinds',
    mode: 'coach',
    screens: ['map'],
    title: 'Узлы бывают разные',
    text: () =>
      legendVisible() ? (
        'Путь выбираешь сам. Справа — легенда: что значит каждый значок узла. Бой — карты и кредиты, отдых — лечение, рынок — покупки.'
      ) : (
        <>
          <span>Путь выбираешь сам. Значки подскажут, что ждёт впереди:</span>
          <NodeKinds />
          <span className="tut-note">Этот список всегда под кнопкой «Легенда».</span>
        </>
      ),
    target: () => (legendVisible() ? [LEGEND_SEL] : null),
  },
  {
    id: 'difficulty',
    mode: 'coach',
    screens: ['map'],
    title: 'Режим и сложность',
    text: (c) => {
      const d = c.run.difficulty ?? 'normal';
      return `Сейчас режим «${DIFFICULTY_INFO[d].name}»: ${DIFFICULTY_INFO[d].description} Перед забегом режим выбираешь сам: лёгкий, обычный или сложный. А уровни Ascension открываются победами: каждый добавляет врагам силы.`;
    },
  },
  {
    id: 'done',
    mode: 'final',
    screens: ['map', 'reward', 'card_pick', 'combat', 'other'],
    title: 'Готово!',
    text: () => 'Забег продолжается: дальше выбирай путь сам. Правила и словарь терминов всегда есть в меню, в разделе «Как играть».',
  },
];

/** Номер шага для счётчика «3 / 12» — мини-плашки и финал не считаем. */
export const COUNTED = STEPS.filter((s) => s.mode === 'coach' || s.mode === 'action').map((s) => s.id);
