/**
 * Кнопка «Назад» браузера/Android ↔ экраны приложения.
 * История: [root] [menu] [экран]. Из подэкрана (профиль, справочник...) назад идёт в меню,
 * из забега не выкидывает (событие гасится), в корне меню спрашивает подтверждение.
 */
import { useEffect } from 'react';
import { useGame, type View } from './store';

let inited = false;

export function useHistoryNav(): void {
  useEffect(() => {
    if (inited) return;
    inited = true;
    try {
      history.replaceState({ root: true }, '');
      history.pushState({ v: 'menu' }, '');
    } catch {
      return;
    }
    let prev: View = useGame.getState().view;
    if (prev !== 'menu') history.pushState({ v: prev }, '');

    const unsub = useGame.subscribe((s) => {
      const view = s.view;
      if (view === prev) return;
      const was = prev;
      prev = view;
      const st = history.state as { v?: string } | null;
      if (view === 'menu') {
        if (st?.v && st.v !== 'menu') history.back();
      } else if (was === 'menu') {
        history.pushState({ v: view }, '');
      } else {
        history.replaceState({ v: view }, '');
      }
    });

    const onPop = (e: PopStateEvent) => {
      const st = e.state as { root?: boolean; v?: string } | null;
      const view = useGame.getState().view;
      if (st?.root) {
        // Выше корня — выхода из приложения не допускаем без подтверждения
        if (!window.confirm('Выйти из игры?')) history.pushState({ v: 'menu' }, '');
        else history.back();
        return;
      }
      if (view === 'run') {
        // Из забега/боя «Назад» не выбрасывает: остаёмся на месте
        history.pushState({ v: 'run' }, '');
        return;
      }
      if (st?.v === 'menu' && view !== 'menu') {
        prev = 'menu';
        useGame.getState().setView('menu');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      unsub();
      inited = false;
    };
  }, []);
}
