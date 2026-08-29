-- Run in Supabase SQL Editor. Safe to run even if you already ran the earlier
-- alarm_enabled migration for the website — these use IF NOT EXISTS guards.

alter table tasks add column if not exists alarm_enabled boolean default true;
alter table tasks add column if not exists notif_id text;

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('pending','done','skipped','later','rejected'));

alter table timetable_events add column if not exists alarm_enabled boolean default true;
alter table timetable_events add column if not exists notif_id text;
