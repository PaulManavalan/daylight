-- Run once in a new Supabase project's SQL editor, or with supabase db push.
begin;
create type public.task_priority as enum ('high', 'medium', 'low');
create type public.energy_level as enum ('high', 'medium', 'low');
create type public.task_status as enum ('not_started', 'in_progress', 'stuck', 'done');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  subject text not null default 'Personal' check (char_length(trim(subject)) between 1 and 80),
  deadline timestamptz,
  estimated_minutes integer not null default 30 check (estimated_minutes between 5 and 1440),
  remaining_minutes integer not null default 30 check (remaining_minutes between 0 and 10080),
  actual_minutes integer not null default 0 check (actual_minutes >= 0),
  priority public.task_priority not null default 'medium',
  energy_level public.energy_level,
  status public.task_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (status <> 'done' or remaining_minutes = 0),
  check (status = 'done' or remaining_minutes > 0)
);
create index tasks_owner_deadline on public.tasks (user_id, deadline) where status <> 'done';
create index tasks_owner_created on public.tasks (user_id, created_at desc);

create table public.preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'America/New_York',
  daily_capacity_minutes integer not null default 180 check (daily_capacity_minutes between 15 and 720),
  block_minutes integer not null default 45 check (block_minutes between 15 and 120),
  break_minutes integer not null default 10 check (break_minutes between 0 and 60),
  -- day: 0=Sunday..6=Saturday. Windows are local wall times in timezone.
  work_windows jsonb not null default '[{"day":1,"start":"16:00","end":"19:00","energy":"high"},{"day":2,"start":"16:00","end":"19:00","energy":"high"},{"day":3,"start":"16:00","end":"19:00","energy":"high"},{"day":4,"start":"16:00","end":"19:00","energy":"high"},{"day":5,"start":"16:00","end":"18:00","energy":"medium"}]' check (jsonb_typeof(work_windows) = 'array'),
  check_ins_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.protected_times (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  source text not null default 'manual' check (source in ('manual', 'google')),
  external_id text,
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);
create index protected_times_owner_start on public.protected_times (user_id, starts_at);

create table public.task_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  state text not null default 'planned' check (state in ('planned', 'active', 'completed', 'cancelled')),
  locked boolean not null default false,
  explanation text not null default '',
  schedule_version integer not null default 1 check (schedule_version > 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, task_id) references public.tasks(user_id, id) on delete cascade
);
create index task_blocks_owner_start on public.task_blocks (user_id, starts_at);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null,
  question text not null check (char_length(question) between 1 and 2000),
  response text check (char_length(response) <= 5000),
  outcome text check (outcome in ('not_started', 'in_progress', 'stuck', 'done', 'need_more_time')),
  added_minutes integer not null default 0 check (added_minutes between 0 and 1440),
  resulting_action jsonb not null default '{}' check (jsonb_typeof(resulting_action) = 'object'),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  foreign key (user_id, task_id) references public.tasks(user_id, id) on delete cascade
);
create index check_ins_owner_created on public.check_ins (user_id, created_at desc);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger tasks_updated before update on public.tasks for each row execute function public.touch_updated_at();
create trigger preferences_updated before update on public.preferences for each row execute function public.touch_updated_at();

-- Users can only access their own rows. No service-role key is needed by the app.
alter table public.tasks enable row level security;
alter table public.preferences enable row level security;
alter table public.protected_times enable row level security;
alter table public.task_blocks enable row level security;
alter table public.check_ins enable row level security;
create policy own_tasks on public.tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_preferences on public.preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_protected_times on public.protected_times for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_task_blocks on public.task_blocks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_check_ins on public.check_ins for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.tasks, public.preferences, public.protected_times, public.task_blocks, public.check_ins from anon;
grant select, insert, update, delete on public.tasks, public.preferences, public.protected_times, public.task_blocks, public.check_ins to authenticated;
commit;
