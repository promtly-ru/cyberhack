# feat/data — движок и данные (прошивки-коллекция, ачивки v2)

## Что сделано

### Прошивки как карты (`packages/engine/src/firmware.ts`)
- `FirmwareDef` по контракту: `id, name, desc, type, rarity, icon, unlock?, levels[{copiesNeeded, effect}]`.
  Старые поля (`description, classId, needs, trigger, effects`) сохранены — UI не ломается.
- Все пороги копий, множители эффектов и веса выпадения — в одном месте: `FIRMWARE_RARITY_CONFIG`
  (`MAX_FIRMWARE_LEVEL = 4`). Выше редкость → больше копий и сильнее рост.
- API по контракту: `listFirmwares, listAvailableFirmwares(meta), rollFirmwareChoices(meta, rng, n=3)` (возвращает id),
  `addFirmwareCopy(state, id), canUpgrade(state, id), upgradeFirmware(state, id), firmwareEffect(def, level)`.
  Дополнительно: `copiesForNextLevel`, `firmwareRunLevels`, `isFirmwareUnlocked`, `lockableFirmwares`.
- В забеге мета-уровень влияет на силу: `NewRunOptions.firmwareLevels` → `RunState.firmwareLevels` → бой.
- Закрытые прошивки (`unlock`) попадают в `RunState.locked.firmwares` и не выпадают в наградах.
  Еженедельный вызов (без `unlocked`) — всё открыто, все прошивки уровня 1 (честно для всех).
- Дроп прошивки в забеге теперь взвешен по редкости.
- Тип `Rarity` прошивок экспортируется из движка как `FirmwareRarity` (имя `Rarity` уже занято редкостью карт).

### Контент
- 22 новые прошивки (7 common, 5 uncommon, 3 rare, 4 epic, 3 legendary; 10 закрыты до ачивок),
  у Ва-банкера появились свои прошивки.
- 25 новых карт под них: `packages/engine/src/content/cards-firmware.json` (подключён в content/index.ts).
  8 из них закрыты до ачивок v2.
- 50 ачивок v2: `packages/engine/src/content/achievements.json` (bronze/silver/gold; награды: карта, прошивка,
  копии, валюта, косметика). Логика — `packages/engine/src/achievements.ts`.

### Web (`apps/web/src/game`)
- `achievements.ts` — контракт: `listAchievements, getAchievementStates, claimAchievement, hasUnclaimed`
  + хуки `useAchievementStates`, `useHasUnclaimed`.
- `store.ts` — добавлены (существующее не менялось): поле `metaExtra` и действия
  `claimAchievement(id)`, `pickFirmwareChoice(id)`, `skipFirmwareChoice()`, `upgradeFirmware(id)`;
  подписка: конец забега → копии прошивок из забега + награда «1 из 3» (`metaExtra.pendingFirmwareChoice`)
  за победу или убитого босса; новый профиль → липкая отметка выполненных ачивок.
- `meta.ts` — хранение `MetaExtra` (localStorage по id пользователя), миграция `normalizeMetaExtra`,
  слияние `mergeMetaExtra`; `regularRunOptions` теперь передаёт открытые прошивки и уровни коллекции.
- Миграция: прогресс ачивок считается из `profile.lifetime`, старые игроки сразу видят выполненное;
  `profile.achievements` (классические) не трогаются. Награды выполненных ачивок доступны в забеге ещё до «Забрать».

## Просьбы к другим веткам

### feat/ui (интерфейс)
1. Экран/вкладка «Ачивки»: `useAchievementStates()` + `listAchievements()`, кнопка «Забрать» → `claimAchievement(id)`,
   бейдж на кнопке меню → `useHasUnclaimed()`.
2. Модалка «Выбери прошивку (1 из 3)»: если `useGame(s => s.metaExtra.pendingFirmwareChoice)` не null —
   три карточки (`getFirmware(id)`: name, desc, rarity, type, icon), выбор → `pickFirmwareChoice(id)`,
   «Пропустить» → `skipFirmwareChoice()`. Показывать после экрана конца забега.
3. Коллекция прошивок: `metaExtra.firmwareCollection` (level, copies), прогресс до улучшения —
   `copiesForNextLevel(metaExtra, id)`, кнопка «Улучшить» → `upgradeFirmware(id)` (активна при `canUpgrade`).
   Цвета редкостей: common/uncommon/rare/epic/legendary. Закрытые: `!isFirmwareUnlocked(def, metaExtra)`, подпись — `def.unlock` (id ачивки).
4. Показ валюты (`metaExtra.currency`) и косметики (`metaExtra.cosmetics`: frame_*, cardback_*, title_*, avatar_*, theme_*).
5. `describeFirmwareEffects(fw, level, metaLevel)` — третий параметр, чтобы в забеге показывать силу с учётом уровня
   (`run.firmwareLevels?.[fw.id] ?? 1`).
6. В `game/engine.ts` можно реэкспортировать новые функции движка (сейчас мои модули импортируют `@cyberhack/engine` напрямую).

### Сетевой слой (net/, не мой)
- `normalizeProfile` отбрасывает незнакомые поля, поэтому `MetaExtra` пока хранится в localStorage
  (`cyberhack:meta-extra:<userId|guest>`) и не синхронизируется между устройствами.
  Чтобы синхронизировать: добавить в `Profile` опциональные поля (`unlockedFirmwares`, `firmwareCollection`,
  `achievementStates`, `currency`, `cosmetics`) и в normalize/merge вызвать `normalizeMetaExtra` / `mergeMetaExtra`
  из `game/meta.ts`. `loadMetaExtra(userId, profile)` уже подхватывает эти поля из профиля (`metaExtraFromProfile`).
- Перенос прогресса гостя в аккаунт: для MetaExtra — `mergeMetaExtra(guest, account)`.

## Что осталось
- UI по списку выше.
- Синхронизация MetaExtra через сервер (см. «Сетевой слой»).
- Валюта пока только копится — нужен магазин/трата (геймдизайн).
- Награда «1 из 3» внутри забега (отдельный тип награды на экране reward) не делалась: нужен UI; сейчас «1 из 3» — после забега.
