-- Run supabase/projects.sql first, then this file, in the Supabase SQL editor.

create table if not exists public.agency_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  package_name text,
  note text,
  package text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.agency_requests add column if not exists package_name text;
alter table public.agency_requests add column if not exists note text;
alter table public.agency_requests add column if not exists package text;
alter table public.agency_requests add column if not exists message text;

alter table public.agency_requests enable row level security;

alter table public.projects
  add column if not exists published boolean not null default false;

alter table public.projects
  add column if not exists custom_domain text;

create unique index if not exists projects_published_slug_idx
  on public.projects (slug)
  where published;

create unique index if not exists projects_custom_domain_idx
  on public.projects (custom_domain)
  where custom_domain is not null;
