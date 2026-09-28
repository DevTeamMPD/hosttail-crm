-- Hosttail CRM — staff/role bridge, audit log, runtime settings. ADDITIVE ONLY.
-- Rollback: drop function ht_current_staff_role, ht_is_staff;
--           drop table ht_audit_log, ht_settings, ht_staff cascade;

-- Bridges Supabase Auth (auth.users) to a CRM role. Kept as its own table
-- (mirroring the crm_users bridge pattern used by the sibling SalesCRM app)
-- rather than a custom claim, so role changes take effect without forcing a
-- re-login and so ht_staff can carry app-specific fields later.
create table if not exists ht_staff (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,     -- auth.users.id
  email        text not null unique,
  display_name text not null,
  role         text not null check (role in ('admin','marketing','viewer')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ix_ht_staff_role on ht_staff (role) where is_active;

drop trigger if exists trg_ht_staff_touch on ht_staff;
create trigger trg_ht_staff_touch
  before update on ht_staff
  for each row execute function ht_touch_updated_at();

-- SECURITY DEFINER so RLS policies elsewhere (including on ht_staff itself)
-- can call this without recursing into ht_staff's own RLS.
create or replace function ht_current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select s.role from ht_staff s
   where s.auth_user_id = auth.uid() and s.is_active
   limit 1
$$;

-- Role hierarchy: admin > marketing > viewer.
create or replace function ht_is_staff(p_min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select case ht_current_staff_role()
           when 'admin'     then true
           when 'marketing' then p_min_role in ('marketing','viewer')
           when 'viewer'    then p_min_role = 'viewer'
           else false
         end
$$;

-- ── Audit log ───────────────────────────────────────────────────────────────
-- No update/delete policy for anyone, including admin (enforced in the RLS
-- migration) -- an audit log that can be edited is not an audit log.
create table if not exists ht_audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,              -- ht_staff.id, or null for system/cron actions
  action     text not null,     -- e.g. 'approve_registration', 'reject_registration'
  entity     text not null,     -- table name
  entity_id  text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_ht_audit_entity on ht_audit_log (entity, entity_id);
create index if not exists ix_ht_audit_actor  on ht_audit_log (actor_id, created_at desc);

-- ── Runtime settings ────────────────────────────────────────────────────────
-- Tunable knobs that are safe to keep in the DB (NOT secrets -- see
-- src/lib/liff and src/lib/line for why LINE credentials stay in env vars
-- instead). Read via a small lib/settings.ts helper.
create table if not exists ht_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

drop trigger if exists trg_ht_settings_touch on ht_settings;
create trigger trg_ht_settings_touch
  before update on ht_settings
  for each row execute function ht_touch_updated_at();

insert into ht_settings (key, value) values
  ('points',    '{"thb_per_point": 100, "rounding": "floor", "min_order_amount": 0}'::jsonb),
  ('warranty',  '{"warranty_days": 365, "review_sla_business_days": 2, "max_resubmit_attempts": 3}'::jsonb),
  ('broadcast', '{"enabled": true, "dry_run": true}'::jsonb),
  ('terms',     '{"version": "2026-09-unset"}'::jsonb)
on conflict (key) do nothing;

-- Seed the points config row that ht_finalize_registration() reads, matching
-- ht_settings.points above (kept in sync manually for now -- the settings
-- form in Phase 2 writes both, or this table is retired in favour of
-- ht_settings entirely once that form exists).
insert into ht_points_config (thb_per_point, rounding, min_order_amount, effective_from, note)
select 100, 'floor', 0, current_date, 'Initial rate: 100 THB = 1 point'
where not exists (select 1 from ht_points_config);
