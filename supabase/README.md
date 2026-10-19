# CyberHack: бэкенд на Supabase

Без Supabase игра работает в **гостевом режиме**: прогресс, сейвы и свои результаты дня хранятся
в localStorage браузера. Чтобы появились аккаунты, облачные сохранения и общий лидерборд, нужно
один раз выполнить шаги ниже. Код менять не придётся: достаточно двух env-переменных.

```
supabase/
  migrations/0001_init.sql        таблицы, RLS, триггеры, view лидерборда
  functions/submit-weekly/         Edge Function: проверка и запись результата недели
  functions/_shared/weekly.ts      чистая логика проверки (покрыта vitest)
  functions/_shared/engine/       бандл движка (генерируется, в git не хранится)
  scripts/bundle-engine.mjs       сборка бандла движка
  tests/rls.sql                   pgTAP-тесты RLS
  config.toml                     настройки Supabase CLI
```

## Как это устроено

```
 браузер ──anon key + JWT──► PostgREST ──RLS──► profiles, saved_runs   (только свои строки)
    │                            └────────────► weekly_leaderboard (view, только чтение)
    │
    └──JWT──► Edge Function submit-weekly
                 │ 1. auth.getUser(JWT)      проверка пользователя
                 │ 2. seed == текущая ISO-неделя (или прошлая, в первые 2 ч понедельника UTC), класс == класс недели, до 3 попыток
                 │ 3. replay(options, actions)  пересчёт забега движком
                 │ 4. score/floor/victory берутся из пересчёта
                 └─► service role ──► weekly_results (клиентам закрыта полностью)
```

- **profiles**: метапрогрессия (`data jsonb`) и `display_name` для лидерборда. Создаётся триггером
  при регистрации. Имя по умолчанию `Хакер-xxxxxx`; у входа через GitHub это публичный логин.
  Email и ФИО в лидерборд не попадают.
- **saved_runs**: один текущий забег на игрока. Если устройства сохраняли в разное время, побеждает
  запись с более поздним `updated_at`. Это обеспечивает триггер, клиент на него не влияет.
- **weekly_results**: до 3 попыток на неделю для каждого игрока (`unique(user_id, seed, attempt_no)`), в рейтинг идёт лучшая. Старые `daily_*` таблицы (миграции 0001–0002) оставлены как архив. Клиенты не
  могут ни читать, ни писать эту таблицу. Публичное чтение идёт только через view
  `weekly_leaderboard`, в котором нет `user_id` и `actions`.
- Офлайн-очередь на клиенте: если сеть пропала, сейв и профиль кладутся в localStorage и
  досылаются по событию `online` или при следующем успешном запросе. Профиль при отправке
  сливается с серверным (разблокировки объединяются, по числам берётся максимум), поэтому
  прогресс с другого устройства не теряется.
- При первом входе гостевой прогресс этого браузера переносится в аккаунт: профили сливаются,
  а забег переносится, если он новее облачного. Перенос делается в один аккаунт один раз.

## Пошагово: подключение

### 1. Создать проект

1. Зайди на <https://supabase.com/dashboard>, нажми **New project**.
2. Имя `cyberhack`, регион поближе к игрокам (например, `Central EU (Frankfurt)`).
3. Сохрани пароль базы в менеджер паролей. Он нужен для `supabase link` и `db push`.

### 2. Ключи для фронтенда

**Project Settings → API** (или **API Keys**):

- `Project URL` → `VITE_SUPABASE_URL`
- `anon` / `publishable` key → `VITE_SUPABASE_ANON_KEY`

Скопируй `apps/web/.env.example` в `apps/web/.env.local` и впиши значения. Для GitHub Pages /
Cloudflare Pages те же две переменные добавь в настройки сборки (Environment variables).

> anon-ключ публичный по замыслу: данные защищают RLS-политики. **service_role / secret key
> никогда не клади во фронтенд и в git.** Он нужен только Edge Function, и Supabase подставляет
> его туда сам.

### 3. Адреса возврата после входа

**Authentication → URL Configuration**:

- **Site URL**: боевой адрес игры, например `https://<user>.github.io/cyberhack/`.
- **Redirect URLs**: добавь все адреса, где открывается игра:
  - `http://localhost:5173/**`
  - `https://<user>.github.io/cyberhack/**` (или адрес Cloudflare Pages)

Клиент передаёт `redirectTo = origin + path` текущей страницы. Если адреса нет в списке, Supabase
вернёт на Site URL.

### 4. Вход по email (magic link)

Провайдер Email включён по умолчанию (**Authentication → Sign In / Providers → Email**).

- **Важно:** встроенная почта Supabase шлёт письма только адресам участников твоей организации
  Supabase и с жёстким лимитом в час. Для настоящих игроков подключи свой SMTP
  (**Authentication → Emails → SMTP Settings**), например Resend, Brevo или Mailgun.
- Используется PKCE: ссылку из письма нужно открыть **в том же браузере**, где её запросили.

### 5. Вход через GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL: адрес игры.
3. Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
   (точный адрес показан в Supabase на странице провайдера GitHub).
4. Скопируй Client ID, сгенерируй Client secret.
5. Supabase → **Authentication → Sign In / Providers → GitHub**: включи и вставь ID и secret.

### 6. Вход через Google

1. <https://console.cloud.google.com> → создай проект → **APIs & Services → OAuth consent screen**
   (External, укажи название и email поддержки).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origins: `http://localhost:5173`, боевой origin игры.
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Sign In / Providers → Google**: включи, вставь Client ID и secret.
4. Пока consent screen в статусе Testing, войти смогут только добавленные тестовые пользователи.
   Для всех игроков переведи его в Production.

### 7. Применить миграции

**Вариант А, без установки CLI.** Supabase → **SQL Editor → New query**: вставь содержимое
`supabase/migrations/0001_init.sql` и нажми Run.

**Вариант Б, через CLI** (npx скачает CLI при первом запуске):

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

После применения открой **Advisors → Security Advisor**. Предупреждение `security_definer_view`
для `weekly_leaderboard` ожидаемо: view специально читает закрытые таблицы, но отдаёт только
безопасные колонки. Других ошибок быть не должно.

### 8. Задеплоить Edge Function

Движок подключается **бандлом**. Его исходники импортируют `./types` без расширения и JSON-файлы,
а Deno так не умеет. Кроме того, при деплое Supabase берёт только файлы внутри `supabase/functions`.
Скрипт собирает `packages/engine/src` через esbuild (он уже есть в `node_modules`) в один файл
`supabase/functions/_shared/engine/index.js`. Функция импортирует его относительным путём, так
сервер считает забег тем же кодом, что и клиент.

```powershell
node supabase/scripts/bundle-engine.mjs
npx supabase functions deploy submit-weekly
```

- `verify_jwt = false` в `config.toml` выставлен намеренно: JWT проверяется внутри функции через
  `auth.getUser(token)`. Так функция работает и со старыми, и с новыми ключами API.
- `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase передаёт в функцию сам, задавать их не нужно.
- По желанию можно ограничить CORS своими доменами:
  `npx supabase secrets set ALLOWED_ORIGINS=https://<user>.github.io,http://localhost:5173`
- **Каждый раз после изменения движка** нужно пересобрать бандл и передеплоить функцию. Иначе
  сервер будет пересчитывать забеги старой версией и отклонять честные результаты. Этот шаг стоит
  добавить в CI перед деплоем фронтенда.

### 9. Проверка

1. `npm run dev`, открой игру и войди через email, GitHub или Google.
2. В **Table Editor → profiles** появилась строка с твоим `user_id`.
3. Сыграй и сохранись: строка появилась в `saved_runs`.
4. Заверши еженедельный вызов: строка появилась в `weekly_results`, игра показывает место в таблице.

## Тесты

- Юнит-тесты клиента и логики функции: `npm run test -w @cyberhack/web`.
- pgTAP-тесты RLS (`supabase/tests/rls.sql`) требуют Docker Desktop:

  ```powershell
  npx supabase start
  npx supabase db reset     # применит миграции к локальной базе
  npx supabase test db
  ```

## Известные ограничения

- Игрок может сыграть вызов несколько раз локально и отправить лучшую попытку: сервер проверяет
  честность забега, но не то, первая ли это попытка. Чтобы это закрыть, нужен серверный старт
  забега (отдельная функция `start-weekly`, которая фиксирует время начала).
- Rate limiting на `submit-weekly` нет. Повторные отправки дёшевы (проверка лимита попыток
  идёт до replay), но некорректные журналы каждый раз пересчитываются. Защиту дают лимит тела
  1 MB, лимит в 20 000 действий и CPU-лимит Edge Functions.
- `display_name` пользователь может менять сам (длина 1–32 символа). UI должен выводить его как
  текст, без HTML.
