create table if not exists public.stripe_events (
  id text primary key,
  user_id uuid not null,
  plan text not null,
  credits integer not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

create or replace function public.grant_checkout_credits(
  p_event_id text,
  p_user_id uuid,
  p_plan text,
  p_credits integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_tokens integer;
begin
  if p_plan = 'starter' and p_credits <> 300 then
    raise exception 'credit amount does not match plan';
  elsif p_plan = 'pro' and p_credits <> 1000 then
    raise exception 'credit amount does not match plan';
  elsif p_plan = 'topup' and p_credits <> 150 then
    raise exception 'credit amount does not match plan';
  elsif p_plan not in ('starter', 'pro', 'topup') then
    raise exception 'unknown plan';
  end if;

  begin
    insert into public.stripe_events (id, user_id, plan, credits)
    values (p_event_id, p_user_id, p_plan, p_credits);
  exception
    when unique_violation then
      select tokens into next_tokens from public.profiles where id = p_user_id;
      return next_tokens;
  end;

  update public.profiles
  set tokens = tokens + p_credits
  where id = p_user_id
  returning tokens into next_tokens;

  if next_tokens is null then
    raise exception 'profile not found';
  end if;

  begin
    update public.profiles
    set credits = coalesce(credits, 0) + p_credits
    where id = p_user_id;
  exception
    when undefined_column then
      null;
  end;

  return next_tokens;
end;
$$;

revoke all on function public.grant_checkout_credits(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.grant_checkout_credits(text, uuid, text, integer) to service_role;

create or replace function public.add_user_credits(user_id uuid, credit_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_credits integer;
begin
  if credit_amount is null or credit_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  update public.profiles
  set credits = coalesce(credits, 0) + credit_amount,
      tokens = coalesce(tokens, 0) + credit_amount
  where id = user_id
  returning credits into next_credits;

  if next_credits is null then
    raise exception 'profile not found';
  end if;

  return next_credits;
end;
$$;

revoke all on function public.add_user_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_user_credits(uuid, integer) to service_role;
