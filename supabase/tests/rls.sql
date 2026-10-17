-- pgTAP-тесты RLS. Запуск: npx supabase start && npx supabase test db
-- Всё в транзакции с rollback — база после тестов не меняется.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------- Подготовка: два пользователя (от имени postgres) ----------
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'alice@test.local', '{"provider":"email"}', '{"full_name":"Alice Secret"}'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'bob@test.local', '{"provider":"github"}', '{"user_name":"bob_gh"}');

-- 1-3: RLS включён
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.saved_runs'::regclass), 'RLS on saved_runs');
select ok((select relrowsecurity from pg_class where oid = 'public.daily_results'::regclass), 'RLS on daily_results');

-- 4-5: триггер создал профили; имя не раскрывает ФИО/email
select is((select count(*)::int from public.profiles
           where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')),
          2, 'профили созданы триггером при регистрации');
select is((select display_name from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
          'Хакер-111111', 'email-пользователь получает анонимное имя');

-- 6-7: view не раскрывает user_id и actions
select hasnt_column('public', 'daily_leaderboard', 'user_id', 'view без user_id');
select hasnt_column('public', 'daily_leaderboard', 'actions', 'view без actions');

-- ---------- Алиса ----------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- 8: свой сейв пишется
select lives_ok(
  $$ insert into public.saved_runs (user_id, options, actions, state, updated_at)
     values ('11111111-1111-4111-8111-111111111111', '{"seed":"s","classId":"ghost"}', '[]', '{"hp":50}',
             now() - interval '1 minute') $$,
  'Алиса пишет свой сейв');

-- 9: чужой сейв не пишется
select throws_ok(
  $$ insert into public.saved_runs (user_id, options, actions, state)
     values ('22222222-2222-4222-8222-222222222222', '{}', '[]', '{}') $$,
  '42501', null, 'Алиса не может создать сейв Боба');

-- 10: свой профиль виден, чужой — нет
select is((select count(*)::int from public.profiles), 1, 'Алиса видит только свой профиль');

-- 11: LWW — более старая запись не перетирает более новую
update public.saved_runs set state = '{"hp":1}', updated_at = now() - interval '1 hour'
  where user_id = '11111111-1111-4111-8111-111111111111';
select is((select state ->> 'hp' from public.saved_runs), '50', 'устаревшее обновление проигнорировано');

-- 12: более новая запись применяется
update public.saved_runs set state = '{"hp":42}', updated_at = now()
  where user_id = '11111111-1111-4111-8111-111111111111';
select is((select state ->> 'hp' from public.saved_runs), '42', 'свежее обновление применено');

-- 13: нельзя «передать» свой сейв другому (триггер возвращает владельца)
update public.saved_runs set user_id = '22222222-2222-4222-8222-222222222222';
select is((select user_id::text from public.saved_runs), '11111111-1111-4111-8111-111111111111',
          'нельзя сменить владельца сейва');

-- 14: ограничение размера jsonb
select throws_ok(
  $$ update public.saved_runs set state = jsonb_build_object('junk', repeat('x', 1100000)), updated_at = now() $$,
  '23514', null, 'слишком большой state отклонён');

-- 15-16: клиент не может писать и читать daily_results напрямую
select throws_ok(
  $$ insert into public.daily_results (user_id, seed, class_id, score, floor, victory, actions)
     values ('11111111-1111-4111-8111-111111111111', 'daily-2026-01-01', 'ghost', 999999, 50, true, '[]') $$,
  '42501', null, 'клиент не может вставить результат дня');
select throws_ok($$ select * from public.daily_results $$, '42501', null, 'клиент не читает daily_results');

-- 17: нельзя менять чужой профиль (строк не затронуто)
select is_empty(
  $$ update public.profiles set display_name = 'pwned' where user_id = '22222222-2222-4222-8222-222222222222'
     returning 1 $$,
  'Алиса не может изменить профиль Боба');

-- ---------- Боб ----------
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

-- 18: не видит чужой сейв
select is_empty($$ select 1 from public.saved_runs $$, 'Боб не видит сейв Алисы');

-- 19: не может изменить чужой сейв
select is_empty(
  $$ update public.saved_runs set state = '{"hp":0}', updated_at = now()
     where user_id = '11111111-1111-4111-8111-111111111111' returning 1 $$,
  'Боб не может изменить сейв Алисы');

-- 20: не может удалить чужой сейв
select is_empty(
  $$ delete from public.saved_runs where user_id = '11111111-1111-4111-8111-111111111111' returning 1 $$,
  'Боб не может удалить сейв Алисы');

-- 21: GitHub-логин стал публичным именем
select is((select display_name from public.profiles), 'bob_gh', 'имя Боба — логин GitHub');

-- ---------- Аноним ----------
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

-- 22-23: аноним не трогает сейвы и профили
select throws_ok($$ select * from public.saved_runs $$, '42501', null, 'anon не читает saved_runs');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon не читает profiles');

-- ---------- Edge Function (service role) пишет результат ----------
reset role;
set local role service_role;
insert into public.daily_results (user_id, seed, class_id, score, floor, victory, actions)
values ('11111111-1111-4111-8111-111111111111', 'daily-2026-01-01', 'ghost', 500, 20, false, '[]'),
       ('22222222-2222-4222-8222-222222222222', 'daily-2026-01-01', 'netrunner', 900, 51, true, '[]');

-- 24: одна попытка на seed
select throws_ok(
  $$ insert into public.daily_results (user_id, seed, class_id, score, floor, victory, actions)
     values ('11111111-1111-4111-8111-111111111111', 'daily-2026-01-01', 'ghost', 9000, 51, true, '[]') $$,
  '23505', null, 'вторая попытка на тот же seed отклонена');

-- ---------- Аноним читает таблицу лидеров ----------
reset role;
set local role anon;

-- 25: видит обе строки
select is((select count(*)::int from public.daily_leaderboard where seed = 'daily-2026-01-01'), 2,
          'anon видит таблицу лидеров');

-- 26: ранги и имена корректны
select results_eq(
  $$ select rank, display_name, score from public.daily_leaderboard
     where seed = 'daily-2026-01-01' order by rank $$,
  $$ values (1, 'bob_gh'::text, 900), (2, 'Хакер-111111'::text, 500) $$,
  'ранги по score, имена из profiles');

reset role;

-- 27: у клиентов на view только чтение
select ok(
  not has_table_privilege('anon', 'public.daily_leaderboard', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.daily_leaderboard', 'INSERT, UPDATE, DELETE'),
  'view только для чтения');

select * from finish();
rollback;
