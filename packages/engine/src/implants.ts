/**
 * Импланты v2: цвет (редкость) решает силу, красные — чистый вред. У каждого импланта своё условие
 * действия (duration): весь забег, N боёв, до события, до выполнения задачи. Лимита на количество нет,
 * отказаться нельзя — цвет виден, но имплант берётся всегда.
 *
 * Внутри кода импланты остаются «relic» (RunState.relics, RelicDef) — так меньше переделок;
 * этот файл — договор цветов, условий и узлов, логика — здесь же.
 *
 * Классовый: на старте у класса ослабленная версия (classes.startingRelic → weak), полная выпадает
 * из любого ролла с шансом classFullChance (база 1%, Маяк +1%, не чаще раза за акт — потолок 5%).
 */

export type ImplantColor = 'red' | 'gray' | 'green' | 'blue' | 'purple' | 'gold' | 'class';

/** Порядок от худшего к лучшему (синтез и рипердок ходят по нему; class вне лестницы) */
export const IMPLANT_LADDER: readonly ImplantColor[] = ['red', 'gray', 'green', 'blue', 'purple', 'gold'];

/** Веса цвета при ролле — одинаковые для Сигнала, событий, магазина, элиты и босса */
export const IMPLANT_COLOR_WEIGHTS: Record<Exclude<ImplantColor, 'class'>, number> = {
  red: 25, gray: 30, green: 20, blue: 13, purple: 9, gold: 3,
};

export const IMPLANT_COLOR_NAMES: Record<ImplantColor, string> = {
  red: 'Красный', gray: 'Серый', green: 'Зелёный', blue: 'Синий', purple: 'Фиолетовый', gold: 'Золотой', class: 'Классовый',
};

export const CLASS_FULL_BASE = 0.01;
export const BEACON_BONUS = 0.01;
/** Снятие красного в магазине: BASE + STEP × redRemovals */
export const RED_REMOVE_BASE_PRICE = 90;
export const RED_REMOVE_PRICE_STEP = 30;

/** Задача, по выполнении которой имплант снимается (красный) или сгорает (бафф) */
export type ImplantTask =
  | { kind: 'win_no_damage' } // выиграть бой без потери HP (goal = число таких боёв, обычно 1)
  | { kind: 'play_attacks'; n: number }
  | { kind: 'play_skills'; n: number }
  | { kind: 'kill_enemies'; n: number }
  | { kind: 'win_combats'; n: number }
  | { kind: 'win_elite' }
  | { kind: 'end_combat_hp_above'; pct: number }; // закончить бой с HP ≥ pct% от максимума

export type ImplantDuration =
  | { kind: 'run' }
  | { kind: 'combats'; n: number }
  | { kind: 'until'; event: 'boss' | 'rest' | 'act_end' }
  | { kind: 'task'; task: ImplantTask };

/** Счётчики условия в RunState.implantState */
export interface ImplantProgress {
  /** combats: сколько боёв осталось */
  combatsLeft?: number;
  /** task: текущий прогресс (goal — из задачи) */
  progress?: number;
}

/** Вариант на экране implant_node (выбор через node_choice; index = позиция) */
export interface ImplantNodeOption {
  label: string;
  /** Пояснение: что отдашь/получишь */
  hint?: string;
  /** Нельзя выбрать (нет денег, нет пары и т.п.) */
  disabled?: boolean;
  /** Импланты, которые затронет выбор (для подсветки в UI) */
  relicIds?: string[];
}
