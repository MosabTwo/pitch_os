-- Pitcher OS: account-based data model and row-level security
-- Run this entire file once in Supabase > SQL Editor.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  workout_key text not null check (workout_key in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  completed_sets jsonb not null default '{}'::jsonb check (jsonb_typeof(completed_sets) = 'object'),
  status text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  notes text not null default '' check (char_length(notes) <= 1000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_date, workout_key)
);

create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  broad_jump_cm numeric(6,1) check (broad_jump_cm is null or broad_jump_cm between 0 and 500),
  pullups integer check (pullups is null or pullups between 0 and 100),
  split_squat_load_kg numeric(6,1) check (split_squat_load_kg is null or split_squat_load_kg between 0 and 500),
  split_squat_reps integer check (split_squat_reps is null or split_squat_reps between 0 and 100),
  single_leg_target_cm numeric(6,1) check (single_leg_target_cm is null or single_leg_target_cm between 0 and 150),
  single_leg_load_kg numeric(6,1) check (single_leg_load_kg is null or single_leg_load_kg between 0 and 500),
  bodyweight_kg numeric(6,1) check (bodyweight_kg is null or bodyweight_kg between 20 and 300),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions (user_id, session_date desc);

create index if not exists progress_entries_user_date_idx
  on public.progress_entries (user_id, measured_on desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists progress_entries_set_updated_at on public.progress_entries;
create trigger progress_entries_set_updated_at
before update on public.progress_entries
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.progress_entries enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.workout_sessions from anon, authenticated;
revoke all on table public.progress_entries from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.progress_entries to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "workout_sessions_select_own" on public.workout_sessions;
create policy "workout_sessions_select_own"
on public.workout_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "workout_sessions_insert_own" on public.workout_sessions;
create policy "workout_sessions_insert_own"
on public.workout_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "workout_sessions_update_own" on public.workout_sessions;
create policy "workout_sessions_update_own"
on public.workout_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "workout_sessions_delete_own" on public.workout_sessions;
create policy "workout_sessions_delete_own"
on public.workout_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "progress_entries_select_own" on public.progress_entries;
create policy "progress_entries_select_own"
on public.progress_entries for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "progress_entries_insert_own" on public.progress_entries;
create policy "progress_entries_insert_own"
on public.progress_entries for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "progress_entries_update_own" on public.progress_entries;
create policy "progress_entries_update_own"
on public.progress_entries for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "progress_entries_delete_own" on public.progress_entries;
create policy "progress_entries_delete_own"
on public.progress_entries for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ── Program templates (admin-uploaded, globally visible) ─────────────────────

create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 60),
  description text not null default '' check (char_length(description) <= 300),
  days jsonb not null default '[]'::jsonb,
  workouts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists program_templates_set_updated_at on public.program_templates;
create trigger program_templates_set_updated_at
before update on public.program_templates
for each row execute function public.set_updated_at();

alter table public.program_templates enable row level security;

-- All authenticated users can read templates
grant select on table public.program_templates to authenticated;
-- Only the service role (used by admin via client with admin email check) can write
-- We enforce admin-only writes via a policy that checks a hard-coded email
grant insert, update, delete on table public.program_templates to authenticated;

drop policy if exists "program_templates_select_all" on public.program_templates;
create policy "program_templates_select_all"
on public.program_templates for select
to authenticated
using (true);

drop policy if exists "program_templates_admin_insert" on public.program_templates;
create policy "program_templates_admin_insert"
on public.program_templates for insert
to authenticated
with check (
  (select email from auth.users where id = auth.uid()) = 'mossab1@gmail.com'
);

drop policy if exists "program_templates_admin_update" on public.program_templates;
create policy "program_templates_admin_update"
on public.program_templates for update
to authenticated
using (
  (select email from auth.users where id = auth.uid()) = 'mossab1@gmail.com'
);

drop policy if exists "program_templates_admin_delete" on public.program_templates;
create policy "program_templates_admin_delete"
on public.program_templates for delete
to authenticated
using (
  (select email from auth.users where id = auth.uid()) = 'mossab1@gmail.com'
);

commit;
