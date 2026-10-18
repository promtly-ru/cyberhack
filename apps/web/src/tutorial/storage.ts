/**
 * Флаги обучения в localStorage. Любое обращение — в try/catch:
 * в приватном режиме или с заблокированным хранилищем игра работает, просто флаги не запоминаются.
 */

/** 'done' — обучение пройдено, 'skipped' — пропущено или «Я уже умею играть». */
export const TUTORIAL_KEY = 'cyberhack:tutorial';
/** JSON-массив id экранов, для которых одноразовая подсказка уже показана ('*' — все). */
export const HINTS_KEY = 'cyberhack:hints';

export type TutorialFlag = 'done' | 'skipped';

export function readTutorialFlag(): TutorialFlag | null {
  try {
    const v = localStorage.getItem(TUTORIAL_KEY);
    return v === 'done' || v === 'skipped' ? v : null;
  } catch {
    return null;
  }
}

export function writeTutorialFlag(v: TutorialFlag): void {
  try {
    // «Пройдено» не затираем «пропущено» при повторном пропуске
    if (v === 'skipped' && localStorage.getItem(TUTORIAL_KEY) === 'done') return;
    localStorage.setItem(TUTORIAL_KEY, v);
  } catch {
    /* хранилище недоступно — флаг живёт до перезагрузки */
  }
}

function readHints(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HINTS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isHintSeen(id: string): boolean {
  const seen = readHints();
  return seen.includes('*') || seen.includes(id);
}

export function markHintSeen(id: string): void {
  try {
    const seen = readHints();
    if (seen.includes(id) || seen.includes('*')) return;
    localStorage.setItem(HINTS_KEY, JSON.stringify([...seen, id]));
  } catch {
    /* см. выше */
  }
}
