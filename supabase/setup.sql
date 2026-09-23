-- ToDo database setup
-- Paste this whole file into the Supabase SQL editor and click Run.
-- It is safe to run again later; it only creates what is missing.

-- 1. Sync stamp
-- Every row carries updated_at (when it was edited on a device) and
-- synced_at (when the server received it). If an older edit arrives late
-- from a device that was offline, the newer version is kept.

create or replace function public.todo_sync_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

-- 2. Tables

create table if not exists public.categories (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  color       text not null default '#2E9E5B',
  sort_order  double precision not null default 0,
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists public.tasks (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  title       text not null default '',
  note        text not null default '',
  date        date not null,
  done        boolean not null default false,
  sort_order  double precision not null default 0,
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  deleted     boolean not null default false
);

-- rule holds the repeat settings, for example
-- {"freq":"monthly","interval":1,"monthMode":"date","monthDay":31}
create table if not exists public.routines (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  title       text not null default '',
  note        text not null default '',
  rule        jsonb not null,
  start_date  date not null,
  end_date    date,
  sort_order  double precision not null default 0,
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  deleted     boolean not null default false
);

-- One row per repeat occurrence that was checked off, skipped, moved or
-- edited. id is "<routine id>:<original date>".
create table if not exists public.occurrences (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id  uuid not null,
  date        date not null,
  done        boolean not null default false,
  skipped     boolean not null default false,
  move_to     date,
  title       text,
  note        text,
  category_id uuid,
  sort_order  double precision,
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  deleted     boolean not null default false
);

-- One row per user. id is the user's own id.
create table if not exists public.settings (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  show_us     boolean not null default true,
  show_kr     boolean not null default true,
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  deleted     boolean not null default false
);

-- Tasks with no date. They show every day from added_on until done_on.
create table if not exists public.someday (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  title       text not null default '',
  note        text not null default '',
  added_on    date not null,
  done_on     date,
  sort_order  double precision not null default 0,
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  deleted     boolean not null default false
);

-- 3. Triggers and indexes

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'tasks', 'routines', 'occurrences', 'settings', 'someday'] loop
    execute format('drop trigger if exists todo_sync_stamp on public.%I', t);
    execute format(
      'create trigger todo_sync_stamp before insert or update on public.%I
       for each row execute function public.todo_sync_stamp()', t);
    execute format('create index if not exists %I on public.%I (user_id, synced_at)', t || '_user_synced_idx', t);
  end loop;
end;
$$;

-- 4. Security: each signed-in user can only read and write their own rows.

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'tasks', 'routines', 'occurrences', 'settings', 'someday'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Own rows only" on public.%I', t);
    execute format(
      'create policy "Own rows only" on public.%I for all to authenticated
       using ((select auth.uid()) = user_id)
       with check ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;

grant usage on schema public to authenticated;
