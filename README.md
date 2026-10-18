# CyberHack

Браузерный roguelike-deckbuilder в неоновом киберпанке. Ты — хакер, который пробивается через сеть серверов: собираешь колоду программ, ломаешь ICE и охранные системы, находишь реликвии и проходишь три акта до босса.
Три класса (Нетраннер, Фрикер, Призрак), 60+ карт, 24 врага, 26 реликвий. Играется на ПК и на телефоне, ставится как PWA и работает офлайн.

**Играть:** https://promtly-ru.github.io/cyberhack/

## Стек

- **Движок** (`packages/engine`) — чистый TypeScript без зависимостей от UI: детерминированный RNG, бои, карта, награды, боты. Тесты на Vitest.
- **Клиент** (`apps/web`) — React 19, Vite 8, Zustand, Pixi.js 8 для эффектов, PWA через vite-plugin-pwa.
- **Сеть** — Supabase (опционально): аккаунты, облачные сохранения, общий лидерборд, edge-функция `submit-daily`. Без него игра работает в гостевом режиме на localStorage.
- **CI/CD** — GitHub Actions: typecheck, тесты, сборка; деплой на GitHub Pages из `main`.

## Запуск

```bash
npm i            # установить зависимости (Node 20.19+ / 22.12+)
npm run dev      # dev-сервер
npm test         # тесты всех пакетов
npm run typecheck
npm run build    # сборка в apps/web/dist
```

Симулятор баланса (прогоняет боты через полные забеги):

```bash
cd packages/engine
npx tsx tools/simulate.ts --runs 1000 --bot expert
```

## Структура

```
cyberhack/
├── apps/
│   └── web/              # React-клиент, PWA
│       ├── public/       # иконки, favicon
│       └── src/          # экраны, UI, Pixi-эффекты, звук, сетевой слой
├── packages/
│   └── engine/           # игровой движок
│       ├── src/          # логика боя, карты, забега; content/*.json — карты, враги, реликвии
│       └── tools/        # симулятор и боты для балансировки
├── supabase/             # миграции, edge-функции, тесты
├── docs/                 # баланс и контент
└── .github/workflows/    # CI и деплой на Pages
```

## Документация

- [docs/balance.md](docs/balance.md) — баланс и результаты симуляций
- [docs/content.md](docs/content.md) — контент: классы, карты, враги, реликвии
- [supabase/README.md](supabase/README.md) — бэкенд на Supabase
