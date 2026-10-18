/**
 * Экран «Как играть»: правила и словарь терминов.
 * ЗАГОТОВКА — реализацию делает агент «Обучение».
 */
import { useGame } from '../game/store';

export function HowToPlay() {
  const setView = useGame((s) => s.setView);
  return (
    <div className="screen howto" data-testid="howto">
      <button className="btn btn--ghost" onClick={() => setView('menu')}>
        Назад
      </button>
    </div>
  );
}
