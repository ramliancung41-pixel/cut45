-- Cut45 free tier. Account balances live on public.profiles (one row per auth.users id).
-- Existing balances stay as they are. New accounts receive 60 credits.

alter table public.profiles
  add column if not exists credits integer not null default 60;

alter table public.profiles
  alter column credits set default 60;

alter table public.profiles
  add column if not exists trial_claimed boolean not null default true;

alter table public.profiles
  add column if not exists tier text not null default 'free';

create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, credits, trial_claimed, tier)
  values (new.id, coalesce(new.email, ''), 60, true, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_signup();

create or replace function public.spend_user_credits(user_id uuid, credit_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_credits integer;
begin
  if credit_amount is null or credit_amount < 0 then
    raise exception 'invalid credit amount';
  end if;

  update public.profiles
  set credits = credits - credit_amount
  where id = user_id
    and credits >= credit_amount
  returning credits into next_credits;

  return next_credits;
end;
$$;

revoke all on function public.spend_user_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.spend_user_credits(uuid, integer) to service_role;
