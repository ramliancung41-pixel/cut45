create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  character_image_url text not null,
  created_at timestamptz not null default now()
);

alter table public.characters enable row level security;

drop policy if exists "characters_select_own" on public.characters;

create policy "characters_select_own"
  on public.characters
  for select
  to authenticated
  using (auth.uid() = user_id);
