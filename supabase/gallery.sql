create table if not exists public.gallery (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null,
  script text not null,
  engine text not null,
  voice_name text not null,
  video_url text,
  image_url text,
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.gallery add column if not exists image_url text;

alter table public.gallery enable row level security;

drop policy if exists "gallery_select_own" on public.gallery;

create policy "gallery_select_own"
  on public.gallery
  for select
  to authenticated
  using (auth.uid() = user_id);
