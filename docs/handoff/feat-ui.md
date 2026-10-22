# feat/ui — интерфейс прошивок и достижений

## Сделано
- **Иконка прошивок** вместо строки `FirmwareBar` в шапке забега (`TopBar.tsx`, внутри `.topbar__actions`). Зелёная точка — есть что улучшить.
- **Окно «Прошивки»** (`components/firmware/FirmwareModal.tsx`): сетка карточек в стиле карт (рамка по редкости, тип, уровень, шкала копий), фильтры по типу и редкости, сортировка (редкость / уровень / название / готовые к улучшению), детальный вид с уровнями и кнопкой «Улучшить».
  - В забеге (`mode="run"`) закрытые не показываются; в коллекции из меню (`mode="collection"`) — затемнены, с подсказкой, как открыть (`unlock` → название и описание ачивки).
- **Награда «выбери 1 из 3»** (`screens/FirmwareReward.tsx`): метки «Новая» / «+1 копия», «Пропустить» / «Забрать».
- **Меню достижений** (`screens/AchievementsScreen.tsx`): категории-вкладки, тиры (бронза/серебро/золото), прогресс-бары, награда на карточке, «Забрать» и «Забрать все», фильтры по статусу и тиру, поиск, счётчик X / N. Кнопка «Награды» в меню со значком числа невзятых наград.
- Все данные идут только через `ui-adapter/contract.ts` (заглушки по общему контракту). Окна открываются через `ui-adapter/overlays.ts` (zustand), монтируются один раз в `App.tsx` (`<UiOverlays />`).
- Стили: `styles/firmware-ui.css`, `styles/achievements-ui.css` (импортируются из компонентов, `main.tsx` не трогал).
- Адаптивность проверена в браузере на 1440 / 768 / 390: горизонтального скролла нет, все кнопки и селекты в модалках от 44px, ошибок в консоли нет.

## Точечные правки чужих файлов (отдельный коммит)
- `App.tsx`: импорт и `<UiOverlays />`.
- `components/TopBar.tsx`: `FirmwareBar` → `<FirmwareButton mode="run" />`.
- `screens/MenuScreens.tsx`: `<AchievementsMenuButton />` и `<FirmwareButton mode="collection" />` в `.menu-tools`.

## После мерджа feat/data (осталось)
1. В `ui-adapter/contract.ts` заменить заглушки реальными импортами: `listFirmwares`, `listAvailableFirmwares(meta)`, `rollFirmwareChoices(meta, rng, n)`, `addFirmwareCopy`, `canUpgrade`, `upgradeFirmware`, `firmwareEffect` из engine; `listAchievements`, `getAchievementStates`, `claimAchievement`, `hasUnclaimed` из `game/achievements.ts`. Сигнатуры UI-обёрток оставить, внутри брать meta из store и после мутаций вызывать `emit()` (или подписаться на store).
2. Подключить экран награды к реальному потоку: `useOverlays.getState().openFirmwareReward(rollFirmwareChoices(...), onPick)` с элит/боссов. Сейчас вызывается только вручную (в DEV есть `window.__overlays`).
3. `effect` уровня в контракте не типизирован. UI показывает строку как есть, иначе `desc`; если в engine это объект, дописать форматирование в `firmwareEffectText`.
4. Правило уровней в заглушке: переход N → N+1 стоит `levels[N].copiesNeeded` копий. Если в feat/data иначе, поправить `copiesForNext`.
5. Старая панель `AchievementsPanel` в профиле и `FirmwareBar` в `Bits.tsx` не удалены (чужие файлы). Можно убрать после мерджа.

## Просьбы к другим веткам
- feat/perf: кнопка `.fw-btn` в шапке забега 44×44. Если perf-стили меняют `.topbar__actions`, проверьте, что она не обрезается на 390px.
