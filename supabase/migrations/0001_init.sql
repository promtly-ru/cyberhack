-- CyberHack: профили, облачные сохранения, ежедневный лидерборд.
-- Принципы:
--   * RLS включён на всех таблицах; клиент видит и меняет только свои строки.
--   * daily_results клиенту недоступна совсем: пишет только Edge Function (service role),
--     читается публично только через view daily_leaderboard (без user_id и actions).
--   * Размер jsonb ограничен check-ами, чтобы таблицы не превращались в бесплатное хранилище.

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Хакер'
               check (char_length(btrim(display_name)) between 1 and 32),
  data         jsonb not null default '{}'::jsonb
               check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Метапрогрессия игрока (разблокировки, рекорды). Клиент сливает данные сам (merge).';

-- ============================================================
-- saved_runs: один активный забег на игрока
-- ============================================================
create table public.saved_runs (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  options    jsonb not null
             check (jsonb_typeof(options) = 'object' and octet_length(options::text) <= 4096),
  actions    jsonb not null default '[]'::jsonb
             check (jsonb_typeof(actions) = 'array' and octet_length(actions::text) <= 1048576),
  state      jsonb not null
             check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 1048576),
  updated_at timestamptz not null default now()
);

comment on table public.saved_runs is 'Облачное сохранение текущего забега. Конфликты устройств: побеждает больший updated_at.';

-- ============================================================
-- daily_results: результаты ежедневного забега (пишет только Edge Function)
-- ============================================================
create table public.daily_results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  seed       text not null check (seed ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  class_id   text not null check (class_id in ('netrunner', 'phreaker', 'ghost')),
  score      integer not null check (score >= 0),
  floor      integer not null check (floor >= 0),
  victory    boolean not null,
  actions    jsonb not null
             check (jsonb_typeof(actions) = 'array' and octet_length(actions::text) <= 1048576),
  created_at timestamptz not null default now(),
  unique (user_id, seed)
);

create index daily_results_seed_score_idx on public.daily_results (seed, score desc, created_at asc);

comment on table public.daily_results is 'Проверенные сервером (replay) результаты. Одна попытка на seed на игрока.';

-- ============================================================
-- Триггеры
-- ============================================================

-- saved_runs: last-write-wins. Время пишет клиент (момент сохранения на устройстве, важно для
-- офлайн-очереди), но не из будущего; более старая запись не перетирает более новую.
create or replace function public.saved_runs_lww()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := least(coalesce(new.updated_at, now()), now());
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;            -- владелец не меняется
    if new.updated_at < old.updated_at then
      return null;                          -- пропустить устаревшую запись
    end if;
  end if;
  return new;
end;
$$;

create trigger saved_runs_lww
  before insert or update on public.saved_runs
  for each row execute function public.saved_runs_lww();

-- profiles: время ставит сервер, владельца сменить нельзя.
create or replace function public.profiles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

create trigger profiles_touch
  before insert or update on public.profiles
  for each row execute function public.profiles_touch();

-- Профиль при регистрации. Имя для таблицы лидеров НЕ берём из email/ФИО (приватность):
-- публичный логин GitHub, если есть, иначе «Хакер-xxxxxx».
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nick text;
begin
  nick := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'user_name',
                                new.raw_user_meta_data ->> 'preferred_username', '')), '');
  if nick is null or new.raw_app_meta_data ->> 'provider' is distinct from 'github' then
    nick := 'Хакер-' || left(replace(new.id::text, '-', ''), 6);
  end if;
  insert into public.profiles (user_id, display_name)
  values (new.id, left(nick, 32))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Триггерные функции не должны вызываться через RPC
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.saved_runs_lww() from public, anon, authenticated;
revoke all on function public.profiles_touch() from public, anon, authenticated;

-- ============================================================
-- Права и RLS
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.saved_runs    enable row level security;
alter table public.daily_results enable row level security;

-- Гостю (anon) свои таблицы не нужны вовсе
revoke all on public.profiles, public.saved_runs from anon;
grant select, insert, update, delete on public.profiles, public.saved_runs to authenticated;

-- daily_results: никаких прав у клиентов (service role обходит RLS и пишет из Edge Function)
revoke all on public.daily_results from public, anon, authenticated;
grant all on public.daily_results to service_role;

-- profiles: только свой
create policy "profiles: select own" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles: delete own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

-- saved_runs: только свой
create policy "saved_runs: select own" on public.saved_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_runs: insert own" on public.saved_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_runs: update own" on public.saved_runs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_runs: delete own" on public.saved_runs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- daily_results: политик нет намеренно → при включённом RLS клиентам запрещено всё.

-- ============================================================
-- Публичная таблица лидеров
-- ============================================================
-- ВАЖНО: view намеренно выполняется с правами владельца (security_invoker = false), иначе anon
-- не увидит чужие строки daily_results и чужие display_name. Это и есть «окно» в закрытые таблицы,
-- поэтому в нём только безопасные колонки: нет user_id, нет actions, нет email.
-- Линтер Supabase покажет предупреждение security_definer_view — это ожидаемо (см. README).
create view public.daily_leaderboard
with (security_invoker = false, security_barrier = true)
as
select
  r.seed,
  (rank() over (partition by r.seed order by r.score desc, r.created_at asc))::integer as rank,
  coalesce(p.display_name, 'Хакер')                                                 as display_name,
  r.class_id,
  r.score,
  r.floor,
  r.victory,
  r.created_at
from public.daily_results r
left join public.profiles p on p.user_id = r.user_id;

revoke all on public.daily_leaderboard from public, anon, authenticated;
grant select on public.daily_leaderboard to anon, authenticated;
