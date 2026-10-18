-- Co-Pilot chat history. One row per thread, owned by the signed-in user.
-- The studio falls back to this browser's storage until this table exists.

create table if not exists public.copilot_threads (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  pinned boolean not null default false,
  renamed boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  scenes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.copilot_threads enable row level security;

drop policy if exists "copilot_threads_select_own" on public.copilot_threads;

create policy "copilot_threads_select_own"
  on public.copilot_threads
  for select
  to authenticated
  using (auth.uid() = user_id);
