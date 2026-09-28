-- Hosttail CRM — rate limiting backing store. ADDITIVE ONLY.
-- Rollback: drop function ht_check_rate_limit; drop table ht_rate_limits;
--
-- crm-next's src/lib/rate-limit.ts calls an RPC named `check_rate_limit`
-- that does not actually exist in this shared project (verified via
-- `select proname from pg_proc where proname='check_rate_limit'` -> zero
-- rows) -- porting that file verbatim would have failed at runtime on the
-- very first call. This is the same interface, namespaced under ht_ since
-- it is new application logic, not a pre-existing shared utility.
--
-- Fixed-window counter. The ON CONFLICT DO UPDATE is a single atomic
-- upsert -- `ht_rate_limits.count`/`.window_start` inside the SET clause
-- refer to the pre-update row, so concurrent callers serialise correctly on
-- the row lock without a separate SELECT-then-UPDATE race.

create table if not exists ht_rate_limits (
  key          text primary key,
  count        integer not null default 1,
  window_start timestamptz not null default now()
);
create index if not exists ix_ht_rate_limits_window on ht_rate_limits (window_start);

create or replace function ht_check_rate_limit(p_key text, p_limit integer, p_window_ms integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  rec    ht_rate_limits;
  now_ts timestamptz := clock_timestamp();
  win    interval := (p_window_ms::text || ' milliseconds')::interval;
begin
  insert into ht_rate_limits (key, count, window_start)
  values (p_key, 1, now_ts)
  on conflict (key) do update set
    count = case
      when ht_rate_limits.window_start + win <= now_ts then 1
      else ht_rate_limits.count + 1
    end,
    window_start = case
      when ht_rate_limits.window_start + win <= now_ts then now_ts
      else ht_rate_limits.window_start
    end
  returning * into rec;

  return rec.count <= p_limit;
end;
$$;

revoke execute on function ht_check_rate_limit(text, integer, integer) from public, anon;
-- Called only from server-side code holding the service role (route
-- handlers), which bypasses grants entirely -- no `authenticated` grant
-- needed. Table itself gets RLS enabled with no policies at all: nobody
-- reads or writes it except through this SECURITY DEFINER function.
alter table ht_rate_limits enable row level security;
