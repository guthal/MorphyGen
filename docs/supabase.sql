-- Supabase schema for API keys
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table api_keys enable row level security;

create policy "api_keys_select_own"
on api_keys
for select
using (auth.uid() = user_id);

create policy "api_keys_insert_own"
on api_keys
for insert
with check (auth.uid() = user_id);

create policy "api_keys_update_own"
on api_keys
for update
using (auth.uid() = user_id);

create policy "api_keys_delete_own"
on api_keys
for delete
using (auth.uid() = user_id);

-- API key usage tracking (daily)
create table if not exists api_key_usage_daily (
  api_key text not null references api_keys(key) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  count int not null default 0,
  primary key (api_key, usage_date)
);

create index if not exists api_key_usage_daily_user_date_idx
on api_key_usage_daily (user_id, usage_date);

alter table api_key_usage_daily enable row level security;

create policy "api_key_usage_select_own"
on api_key_usage_daily
for select
using (auth.uid() = user_id);

create or replace function increment_api_key_usage(
  p_api_key text,
  p_user_id uuid,
  p_usage_date date
)
returns void
language plpgsql
security definer
as $$
begin
  insert into api_key_usage_daily (api_key, user_id, usage_date, count)
  values (p_api_key, p_user_id, p_usage_date, 1)
  on conflict (api_key, usage_date)
  do update set count = api_key_usage_daily.count + 1;
end;
$$;

revoke all on function increment_api_key_usage(text, uuid, date) from public;
grant execute on function increment_api_key_usage(text, uuid, date) to authenticated;

-- API request logs (retention: forever)
create table if not exists api_request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key text not null,
  method text not null,
  endpoint text not null,
  status_code int not null,
  latency_ms int not null,
  input_type text,
  job_id text,
  error_message text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists api_request_logs_user_created_idx
on api_request_logs (user_id, created_at desc);

alter table api_request_logs enable row level security;

create policy "api_request_logs_select_own"
on api_request_logs
for select
using (auth.uid() = user_id);

-- Billing subscriptions (Razorpay)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  status text not null default 'PENDING',
  razorpay_subscription_id text,
  razorpay_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
on subscriptions (user_id);

alter table subscriptions enable row level security;

create policy "subscriptions_select_own"
on subscriptions
for select
using (auth.uid() = user_id);

create policy "subscriptions_insert_own"
on subscriptions
for insert
with check (auth.uid() = user_id);

create policy "subscriptions_update_own"
on subscriptions
for update
using (auth.uid() = user_id);

-- Billing payment events (append-only)
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'razorpay',
  event_type text not null,
  event_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_user_idx
on payment_events (user_id);

alter table payment_events enable row level security;

create policy "payment_events_select_own"
on payment_events
for select
using (auth.uid() = user_id);

-- Credit usage per billing cycle
create table if not exists credit_usage_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  credits_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, period_start, period_end)
);

create index if not exists credit_usage_cycles_user_idx
on credit_usage_cycles (user_id, period_start desc);

alter table credit_usage_cycles enable row level security;

create policy "credit_usage_cycles_select_own"
on credit_usage_cycles
for select
using (auth.uid() = user_id);

create or replace function increment_credit_usage_for_user(
  p_user_id uuid,
  p_amount int
)
returns void
language plpgsql
security definer
as $$
declare
  sub_record record;
  cycle_start timestamptz;
  cycle_end timestamptz;
  sub_id text;
begin
  select razorpay_subscription_id, current_period_start, current_period_end
    into sub_record
  from subscriptions
  where user_id = p_user_id and status = 'ACTIVE'
  order by created_at desc
  limit 1;

  if sub_record.razorpay_subscription_id is null then
    cycle_start := date_trunc('month', now());
    cycle_end := (date_trunc('month', now()) + interval '1 month');
    sub_id := 'free';
  else
    cycle_start := sub_record.current_period_start;
    cycle_end := sub_record.current_period_end;
    sub_id := sub_record.razorpay_subscription_id;
  end if;

  insert into credit_usage_cycles (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_used
  )
  values (
    p_user_id,
    sub_id,
    cycle_start,
    cycle_end,
    greatest(p_amount, 0)
  )
  on conflict (subscription_id, period_start, period_end)
  do update set credits_used = credit_usage_cycles.credits_used + greatest(p_amount, 0),
    updated_at = now();
end;
$$;

revoke all on function increment_credit_usage_for_user(uuid, int) from public;
grant execute on function increment_credit_usage_for_user(uuid, int) to authenticated;

-- Profiles table for settings
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  vat_number text,
  company_address text,
  country text,
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on profiles;
create trigger set_profiles_updated_at
before update on profiles
for each row
execute function update_updated_at_column();

alter table profiles enable row level security;

create policy "profiles_select_own"
on profiles
for select
using (auth.uid() = user_id);

create policy "profiles_insert_own"
on profiles
for insert
with check (auth.uid() = user_id);

create policy "profiles_update_own"
on profiles
for update
using (auth.uid() = user_id);

-- Self-service delete user function (requires auth)
create or replace function delete_user()
returns void
language plpgsql
security definer
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function delete_user() from public;
grant execute on function delete_user() to authenticated;
