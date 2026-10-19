-- Еженедельный вызов (заменяет ежедневный забег). Таблицы daily_* НЕ удаляются — архив.
-- Принципы те же: weekly_results клиенту недоступна, пишет только Edge Function submit-weekly (service role),
-- читается публично только через view weekly_leaderboard (без user_id и actions).
-- До 3 попыток за неделю (attempt_no 1..3), в зачёт идёт лучшая.

create table public.weekly_results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  seed       text not null check (seed ~ '^[0-9]{4}-W[0-9]{2}$'),
  attempt_no smallint not null check (attempt_no between 1 and 3),
  class_id   text not null check (class_id in ('netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono')),
  score      integer not null check (score >= 0),
  floor      integer not null check (floor >= 0),
  victory    boolean not null,
  duration_s integer check (duration_s is null or duration_s >= 0),
  actions    jsonb not null
             check (jsonb_typeof(actions) = 'array' and octet_length(actions::text) <= 1048576),
  created_at timestamptz not null default now(),
  unique (user_id, seed, attempt_no)
);

create index weekly_results_seed_score_idx on public.weekly_results (seed, score desc, created_at asc);

comment on table public.weekly_results is 'Проверенные сервером (replay) результаты недели. До 3 попыток на неделю на игрока.';

alter table public.weekly_results enable row level security;
revoke all on public.weekly_results from public, anon, authenticated;
grant all on public.weekly_results to service_role;
-- политик нет намеренно → при включённом RLS клиентам запрещено всё.

-- Лучшая попытка каждого игрока за неделю + место. Выполняется с правами владельца (см. daily_leaderboard).
create view public.weekly_leaderboard
with (security_invoker = false, security_barrier = true)
as
with best as (
  select distinct on (r.seed, r.user_id)
    r.seed, r.user_id, r.class_id, r.score, r.floor, r.victory, r.duration_s, r.created_at
  from public.weekly_results r
  order by r.seed, r.user_id, r.score desc, r.created_at asc
)
select
  b.seed,
  (rank() over (partition by b.seed order by b.score desc, b.created_at asc))::integer as rank,
  coalesce(p.display_name, 'Хакер')                                                 as display_name,
  b.class_id,
  b.score,
  b.floor,
  b.victory,
  b.duration_s,
  b.created_at
from best b
left join public.profiles p on p.user_id = b.user_id;

revoke all on public.weekly_leaderboard from public, anon, authenticated;
grant select on public.weekly_leaderboard to anon, authenticated;

-- Своя строка в таблице недели (с глобальным местом). Нужна клиенту, чтобы показать «свою» строку вне топа:
-- view не содержит user_id, поэтому отдельная функция с правами владельца, привязанная к auth.uid().
create function public.weekly_my_entry(p_seed text)
returns table (rank integer, display_name text, class_id text, score integer, floor integer, victory boolean, duration_s integer)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.class_id, r.score, r.floor, r.victory, r.duration_s, r.created_at
    from public.weekly_results r
    where r.seed = p_seed
    order by r.user_id, r.score desc, r.created_at asc
  ), ranked as (
    select b.*, (rank() over (order by b.score desc, b.created_at asc))::integer as rnk from best b
  )
  select k.rnk, coalesce(p.display_name, 'Хакер'), k.class_id, k.score, k.floor, k.victory, k.duration_s
  from ranked k
  left join public.profiles p on p.user_id = k.user_id
  where k.user_id = (select auth.uid());
$$;

revoke all on function public.weekly_my_entry(text) from public, anon;
grant execute on function public.weekly_my_entry(text) to authenticated;
