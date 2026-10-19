-- Новый класс: Кибер-самурай
alter table public.daily_results drop constraint if exists daily_results_class_id_check;
alter table public.daily_results add constraint daily_results_class_id_check
  check (class_id in ('netrunner', 'phreaker', 'ghost', 'samurai', 'engineer'));
