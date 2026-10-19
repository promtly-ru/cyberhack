/**
 * Единый словарь терминов игры: ключевые слова карт, статусы, базовые понятия боя.
 * Описания статусов берутся из движка (tryStatusDef), остальное — короткие правила простым языком.
 * Используется текстом карт (подсказки), превью карты («Термины») и экраном «Как играть» (allTerms()).
 */
import { cardStats, describeCard, tryStatusDef } from '../game/engine';

export type TermGroup = 'basic' | 'card' | 'status';

export interface GlossaryTerm {
  id: string;
  /** Как термин называется в игре */
  name: string;
  /** Что он делает — простым языком */
  desc: string;
  group: TermGroup;
  /** Для статусов: усиление или ослабление */
  tone?: 'buff' | 'debuff';
  /** Имя иконки из components/Icon */
  icon?: string;
}

interface TermSpec {
  id: string;
  group: TermGroup;
  /** id статуса движка: имя и описание берутся оттуда */
  status?: string;
  name?: string;
  desc?: string;
  icon?: string;
  /** Словоформы, которые подсвечиваются в тексте карты (регулярные выражения без групп захвата) */
  forms?: string[];
}

/** Порядок здесь = порядок в «Как играть» и в блоке «Термины». */
const SPECS: TermSpec[] = [
  // ---- Базовые понятия боя ----
  { id: 'energy', group: 'basic', name: 'Энергия', icon: 'energy', desc: 'Тратится на розыгрыш карт: число в кружке в углу карты — её цена. В начале каждого хода энергия восстанавливается полностью.' },
  { id: 'block', group: 'basic', name: 'Блок', icon: 'block', desc: 'Поглощает входящий урон вместо здоровья. Пропадает в начале следующего хода своего владельца.' },
  { id: 'hp', group: 'basic', name: 'Здоровье (HP)', icon: 'hp', desc: 'Целостность системы. Дошло до 0 — забег окончен. Между боями само не восстанавливается.' },
  { id: 'intent', group: 'basic', name: 'Намерение', icon: 'attack', desc: 'Значок над врагом: что он сделает в свой ход. Число — урон по тебе. Успей поставить блок или добить врага.' },
  { id: 'draw_pile', group: 'basic', name: 'Колода (добор)', icon: 'draw', desc: 'Отсюда каждый ход берутся новые карты. Когда кончается — сброс перемешивается и становится новой колодой.' },
  { id: 'discard_pile', group: 'basic', name: 'Сброс', icon: 'discard', desc: 'Сыгранные карты и карты, оставшиеся в руке в конце хода.' },
  { id: 'exhaust_pile', group: 'basic', name: 'Сожжено', icon: 'exhaust', desc: 'Сожжённые карты. До конца боя они не вернутся.' },
  // ---- Ключевые слова карт ----
  { id: 'exhaust', group: 'card', name: 'Сжигается', icon: 'exhaust', desc: 'После розыгрыша карта уходит в «Сожжено» и до конца боя не вернётся. «Сожги карту» — то же самое для карты из руки.', forms: ['Сжигается', 'Сгорает', 'Сожги'] },
  { id: 'ethereal', group: 'card', name: 'Эфемерная', desc: 'Если карта осталась в руке в конце хода — она сгорает.', forms: ['Эфемерная', 'Эфемерна'] },
  { id: 'unplayable', group: 'card', name: 'Неиграбельна', desc: 'Эту карту нельзя сыграть. Она просто занимает место в руке.', forms: ['Неиграбельна'] },
  { id: 'retain', group: 'card', name: 'Удержание', icon: 'retain', desc: 'В конце хода карта не уходит в сброс, а остаётся в руке до следующего хода.', forms: ['Удержани[еяю]', 'Удерживается'] },
  { id: 'innate', group: 'card', name: 'Врождённая', icon: 'innate', desc: 'В начале каждого боя карта сразу оказывается в стартовой руке.', forms: ['Врожд[её]нн(?:ая|ой|ую|ые)'] },
  { id: 'potion', group: 'basic', name: 'Расходник', icon: 'potion', desc: 'Разовый модуль-инъекция. Хранится в слотах на верхней панели (до 3). В бою можно выпить любой — это не тратит энергию; вне боя — только лечебные. Лишний можно выбросить.', forms: ['Расходник(?:а|и|ов|ом)?', 'расходник(?:а|и|ов|ом)?'] },
  { id: 'x_cost', group: 'card', name: 'Цена X', desc: 'Карта тратит всю оставшуюся энергию. Эффект повторяется столько раз, сколько энергии потрачено.' },
  { id: 'power', group: 'card', name: 'Модуль', desc: 'Тип карты. Сыгранный модуль работает до конца боя и больше не попадает в руку.' },
  { id: 'aoe', group: 'card', name: 'По всем врагам', desc: 'Действует сразу на всех врагов — цель выбирать не нужно.', forms: ['ВСЕМ'] },
  // ---- Статусы (описания — из движка) ----
  { id: 'strength', group: 'status', status: 'strength', forms: ['Разгон(?:а|ов)?'] },
  { id: 'dexterity', group: 'status', status: 'dexterity', forms: ['Шифровани[еяю]', 'Отклик(?:а|ов)?'] },
  { id: 'plating', group: 'status', status: 'plating', forms: ['Броня-патч(?:а|ей)?'] },
  { id: 'thorns', group: 'status', status: 'thorns', forms: ['Контрудар(?:а|ов)?', 'Обратн(?:ый|ого) трейс(?:а)?'] },
  { id: 'regen', group: 'status', status: 'regen', forms: ['Самовосстановлени[еяю]'] },
  { id: 'ritual', group: 'status', status: 'ritual', forms: ['Самообучени[еяю]'] },
  { id: 'vulnerable', group: 'status', status: 'vulnerable', forms: ['Бреш(?:ь|и|ей)', 'Уязвимост(?:ь|и)'] },
  { id: 'weak', group: 'status', status: 'weak', forms: ['Лаг(?:а|ов)?', 'Слабост(?:ь|и)'] },
  { id: 'frail', group: 'status', status: 'frail', forms: ['Фрагментаци[яи]', 'Хрупкост(?:ь|и)'] },
  { id: 'virus', group: 'status', status: 'virus', forms: ['Вирус(?:а|ов)?'] },
  { id: 'echo', group: 'status', status: 'echo', forms: ['Эхо'] },
  { id: 'barrier', group: 'status', status: 'barrier', forms: ['Барьер(?:а|ов|ом)?'] },
  { id: 'bleed', group: 'status', status: 'bleed', forms: ['Утечк(?:а|и|у|ой)'] },
  { id: 'mark', group: 'status', status: 'mark', forms: ['Метк(?:а|и|у|ой)', 'Меток'] },
];

/** Запасные имена статусов, если движок о них не знает. */
const STATUS_FALLBACK_NAME: Record<string, string> = {
  strength: 'Разгон',
  dexterity: 'Шифрование',
  plating: 'Броня-патч',
  thorns: 'Контрудар',
  regen: 'Самовосстановление',
  ritual: 'Самообучение',
  vulnerable: 'Брешь',
  weak: 'Лаг',
  frail: 'Фрагментация',
  virus: 'Вирус',
  echo: 'Эхо',
  barrier: 'Барьер',
  bleed: 'Утечка',
  mark: 'Метка',
};

function resolve(spec: TermSpec): GlossaryTerm {
  if (spec.status) {
    const def = tryStatusDef(spec.status);
    return {
      id: spec.id,
      name: def?.name ?? STATUS_FALLBACK_NAME[spec.status] ?? spec.status,
      desc: def?.description ?? '',
      group: 'status',
      tone: def?.kind === 'debuff' ? 'debuff' : 'buff',
      icon: spec.status,
    };
  }
  return { id: spec.id, name: spec.name ?? spec.id, desc: spec.desc ?? '', group: spec.group, ...(spec.icon ? { icon: spec.icon } : {}) };
}

let cache: Map<string, GlossaryTerm> | null = null;
function terms(): Map<string, GlossaryTerm> {
  if (!cache) cache = new Map(SPECS.map((s) => [s.id, resolve(s)]));
  return cache;
}

/** Все термины в порядке словаря (для экрана «Как играть»). */
export function allTerms(): GlossaryTerm[] {
  return [...terms().values()];
}

export function getTerm(id: string): GlossaryTerm | undefined {
  return terms().get(id);
}

// ---------- Поиск ключевых слов в тексте ----------

const FORM_LIST = SPECS.flatMap((s) => (s.forms ?? []).map((f) => ({ id: s.id, re: new RegExp(`^(?:${f})$`) })));
/** Слово целиком: не часть более длинного слова (кириллица не входит в \b). */
const KEYWORD_SPLIT = new RegExp(`(?<![А-Яа-яЁё-])(${SPECS.flatMap((s) => s.forms ?? []).join('|')})(?![А-Яа-яЁё])`);

/** id термина для найденной словоформы. */
export function termIdForWord(word: string): string | undefined {
  return FORM_LIST.find((f) => f.re.test(word))?.id;
}

export type TextPart = string | { word: string; termId: string };

/** Разбить текст на обычные куски и ключевые слова. */
export function splitKeywords(text: string): TextPart[] {
  const out: TextPart[] = [];
  const re = new RegExp(KEYWORD_SPLIT.source, 'g');
  let last = 0;
  for (const m of text.matchAll(re)) {
    const word = m[1] ?? '';
    const id = termIdForWord(word);
    if (!id || m.index === undefined) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ word, termId: id });
    last = m.index + word.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Термины, которые нужны, чтобы понять карту: ключевые слова из текста + цена/тип/блок/энергия.
 * basics: false — без базовых понятий (Блок, Энергия): для компактных списков.
 */
export function cardTerms(defId: string, upgraded = false, { basics = true }: { basics?: boolean } = {}): GlossaryTerm[] {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  let text: string;
  try {
    text = describeCard(defId, upgraded);
    const st = cardStats(defId, upgraded);
    if (st.cost === -1) add('x_cost');
    if (st.def.type === 'power') add('power');
    if (st.def.target === 'all_enemies') add('aoe');
    if (st.exhaust) add('exhaust');
    if (st.ethereal) add('ethereal');
    if (st.retain) add('retain');
    if (st.innate) add('innate');
  } catch {
    return [];
  }
  for (const p of splitKeywords(text)) if (typeof p !== 'string') add(p.termId);
  if (/блок/i.test(text)) add('block');
  if (/энерги/i.test(text)) add('energy');
  return ids
    .map((id) => getTerm(id))
    .filter((t): t is GlossaryTerm => !!t && (basics || t.group !== 'basic'));
}
