# feat/perf — handoff

Ветка: `feat/perf`, worktree `~/Downloads/cyberhack-perf`. Замеры и разбор причин — в `docs/PERF.md`.

## Сделано

- Режим «Экономия графики»: `apps/web/src/fx/perf-mode.ts` (store `useGfx`, `isLite()`, `applyGfx()`, авто-замер FPS в первом бою), правила `html[data-gfx='lite']` в `styles/perf.css`.
  - auto: `prefers-reduced-motion`, слабое устройство (`deviceMemory ≤ 2`, `hardwareConcurrency ≤ 2`, `saveData`) или медиана кадра хуже ~30 FPS в первом бою (запоминается в `localStorage['cyberhack.perf.slow.v1']`).
  - Выбор игрока хранится в `localStorage['cyberhack.perf.v1']`: `"auto" | "lite" | "full"`.
- `fx/FxHost.tsx`: применяет `data-gfx`, в экономии не поднимает Pixi-дождь, запускает авто-замер.
- `fx/fx.ts`: прогрев шейдеров, текстур и шрифта в простое после старта; в экономии рисуется каждая третья частица, а цифры урона идут без размытой тени.
- `fx/PerfToggle.tsx`: переключатель «Графика: Авто / Экономия / Полная» со стилями в perf.css. **Пока нигде не подключён**, см. просьбу 1.
- Инструменты: `e2e/tools/perf-probe.mjs` (FPS, long tasks, layout/style по сценам), `e2e/tools/perf-profile.mjs` (CPU-профиль входа в бой и хода).
- Проверки на момент сдачи: typecheck ✓, lint ✓ (0 ошибок; 3 старых предупреждения не из моих файлов), vitest ✓ (254 + 79), e2e ✓ (35 passed, 7 skipped; 4 теста упали при первом прогоне на старте меню, все 4 прошли при повторе — вероятно, был конфликт за порт 4173 с другими worktree).

## Просьбы к владельцам чужих файлов

1. **SettingsModal.tsx (UI):** подключить переключатель графики, например после блока анимаций:
   ```tsx
   import { PerfToggle } from '../fx/PerfToggle';
   // ...
   <PerfToggle />
   ```
   Компонент сам читает и пишет `useGfx`, пропсы не нужны. Тестовые id: `gfx-toggle`, `gfx-auto`, `gfx-lite`, `gfx-full`.

2. **components/CardArt.tsx + Card (UI), главный оставшийся лаг.** Вход в бой — long task 650–800 мс на CPU 4x. 5 карт в руке дают 766 из 1078 узлов DOM боя (~150 SVG-узлов на арт), у каждого арта `drop-shadow`, а у `.art-hero` внутри — ещё один `drop-shadow`. Варианты по убыванию эффекта:
   - рендерить арт карты один раз в `<symbol>` (общий `<svg>` со спрайтами по `def.id`) и в карте использовать `<use href="#art-…">`: DOM руки уменьшится примерно в 10 раз;
   - или кэшировать арт растром (`canvas` → `ImageBitmap`/dataURL по `def.id + upgraded`) и показывать `<img>`;
   - `.card-art .art-hero` — убрать вложенный `filter` (свечение уже даёт фильтр на `.card-art`).
   `FitText` проверял: бинарный поиск и кэш не помогают — он просто первым читает геометрию, и layout случился бы всё равно.

3. **tutorial/Tutorial.tsx (обучение):** `useEffect` с `tick` (около строки 93) на каждом кадре делает `querySelector` и `getBoundingClientRect` для цели шага. Пока идёт обучение, это принудительный layout в каждом кадре. Решение: проверять раз в 100–150 мс (`setInterval`) плюс по `resize`/`scroll`, а не в rAF.

4. **components/Bits.tsx `HpBar` (мелочь):** `el.offsetWidth` в `useEffect` форсирует layout на каждое изменение HP. Можно заменить на Web Animations API:
   `el.animate([{ transform: \`scaleX(${prev})\` }, { transform: \`scaleX(${pct})\` }], { duration, easing, fill: 'forwards' })`, и тогда принудительный layout не нужен.

5. **store.ts:** лагов из store не нашёл: подписки в бою идут через селекторы, лишних ререндеров в профиле нет.

## Осталось

- Long task при входе в бой (просьба 2).
- Вид по умолчанию на встроенной графике тяжёлый (бой 15–22 FPS на CPU 4x, Radeon 680M). Это закрывает авто-переход в экономию; дальше облегчать можно только ценой внешнего вида.
- Повторить замеры ДО/ПОСЛЕ на машине без параллельных сборок: сейчас шум ±30%.
- `node_modules` в этом worktree — junction на `../cyberhack/node_modules`, а `@cyberhack/engine` резолвится в engine из main.
