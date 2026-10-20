-- Новый класс: Ва-банкер
alter table public.daily_results drop constraint if exists daily_results_class_id_check;
alter table public.daily_results add constraint daily_results_class_id_check
  check (class_id in ('netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono', 'vabanker'));

alter table public.weekly_results drop constraint if exists weekly_results_class_id_check;
alter table public.weekly_results add constraint weekly_results_class_id_check
  check (class_id in ('netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono', 'vabanker'));
