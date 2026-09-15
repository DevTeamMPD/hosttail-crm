-- Hosttail CRM — points config, tiers, append-only ledger, registration finalisation.
-- ADDITIVE ONLY. Rollback: drop function ht_finalize_registration, ht_rebuild_points_balances,
--   ht_ledger_apply, ht_ledger_immutable, ht_points_config_at;
--   drop table ht_points_ledger, ht_tiers, ht_points_config cascade;
--   alter table ht_members drop constraint ht_members_tier_fk;

-- ── Config: versioned so a historical grant keeps the rate it was earned under ──
create table if not exists ht_points_config (
  id                     integer generated always as identity primary key,
  thb_per_point          numeric(12,4) not null check (thb_per_point > 0),  -- e.g. 100 = 100 THB/point
  rounding               text not null default 'floor'
                           check (rounding in ('floor','round','ceil')),
  min_order_amount       numeric(14,2) not null default 0,
  signup_bonus_points    integer not null default 0,
  expiry_months          integer check (expiry_months is null or expiry_months between 1 and 120),
  effective_from         date not null,
  effective_to           date,                 -- null = currently in force
  note                   text,
  created_at             timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
-- Exactly one open-ended (current) config row at a time.
create unique index if not exists ux_ht_points_config_current
  on ht_points_config ((true)) where effective_to is null;
create index if not exists ix_ht_points_config_from on ht_points_config (effective_from);

create or replace function ht_points_config_at(p_on date default current_date)
returns ht_points_config language sql stable as $$
  select c.* from ht_points_config c
  where c.effective_from <= p_on
    and (c.effective_to is null or c.effective_to > p_on)
  order by c.effective_from desc limit 1
$$;

-- ── Tiers ───────────────────────────────────────────────────────────────────
-- Thresholds on LIFETIME points, not balance -- redeeming points must never
-- demote a member's tier.
create table if not exists ht_tiers (
  code             text primary key,
  name_th          text not null,
  name_en          text not null,
  min_lifetime_pts integer not null check (min_lifetime_pts >= 0),
  earn_multiplier  numeric(4,2) not null default 1.00 check (earn_multiplier > 0),
  perks            jsonb not null default '{}'::jsonb,
  sort_order       integer not null,
  is_active        boolean not null default true
);
create unique index if not exists ux_ht_tiers_min on ht_tiers (min_lifetime_pts);

alter table ht_members
  add constraint ht_members_tier_fk
  foreign key (tier_code) references ht_tiers(code) on update cascade;

-- ── Append-only ledger ──────────────────────────────────────────────────────
-- Balance = sum(points) for the member. Signed. Rows are never UPDATEd or
-- DELETEd -- a correction is always a new row. This is deliberate: JST's
-- daily ETL can flip an order's status to Cancelled well after the fact (a
-- real incident on 2026-07-21/22 mass-flipped ~97% of one day's rows), so
-- points must be reversible and auditable, not just "current".
create table if not exists ht_points_ledger (
  id             bigint generated always as identity primary key,
  member_id      uuid not null references ht_members(id) on delete cascade,

  kind           text not null
                   check (kind in ('earn','reverse','redeem','expire','adjust','bonus')),
  points         integer not null check (points <> 0),   -- + for earn/bonus, - for the rest

  -- ── Provenance ────────────────────────────────────────────────────────────
  source_type    text not null
                   check (source_type in ('warranty_registration','signup','manual','system')),
  source_ref     text,                 -- ht_warranty_registrations.id::text, or null for manual/system
  revision       integer not null default 1,

  -- ── Reproducibility ───────────────────────────────────────────────────────
  basis_amount   numeric(14,2),        -- the THB the points were computed from
  rate_applied   numeric(12,4),        -- thb_per_point in force at grant time
  config_id      integer references ht_points_config(id),

  expires_on     date,
  expired_points integer not null default 0 check (expired_points >= 0),

  registration_id uuid references ht_warranty_registrations(id) on delete set null,
  actor_id        uuid,                -- ht_staff.id for manual/redeem; null = system/customer flow
  note            text,
  created_at      timestamptz not null default now(),

  constraint ht_ledger_sign_chk check (
    (kind in ('earn','bonus','adjust') and points <> 0) or
    (kind in ('reverse','redeem','expire') and points < 0)
  ),
  constraint ht_ledger_expiry_chk check (kind in ('earn','bonus') or expires_on is null),
  constraint ht_ledger_expired_chk check (expired_points <= greatest(points, 0))
);

-- IDEMPOTENCY: one row per (source, revision). Re-running a grant that
-- computes the same target is a no-op; a changed target is exactly one
-- delta row at the next revision.
create unique index if not exists ux_ht_ledger_source_rev
  on ht_points_ledger (source_type, source_ref, revision)
  where source_ref is not null;

create index if not exists ix_ht_ledger_member on ht_points_ledger (member_id, created_at desc);
create index if not exists ix_ht_ledger_source on ht_points_ledger (source_type, source_ref);
create index if not exists ix_ht_ledger_expiring
  on ht_points_ledger (expires_on) where kind in ('earn','bonus') and expires_on is not null;

-- Hard-enforce append-only at the DB level. The one carve-out (a future
-- expiry job marking expired_points on an existing lot) must go through the
-- ht.allow_ledger_update session flag, not a bare UPDATE.
create or replace function ht_ledger_immutable()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('ht.allow_ledger_update', true), 'off') = 'on'
     and tg_op = 'UPDATE'
     and new.id = old.id and new.points = old.points
     and new.member_id = old.member_id and new.kind = old.kind then
    return new;   -- expiry bookkeeping only (expired_points column)
  end if;
  raise exception 'ht_points_ledger is append-only (attempted %). Insert a correcting row instead.', tg_op;
end;
$$;
drop trigger if exists trg_ht_ledger_immutable on ht_points_ledger;
create trigger trg_ht_ledger_immutable
  before update or delete on ht_points_ledger
  for each row execute function ht_ledger_immutable();

-- Trigger-maintained balance, not compute-on-the-fly or a materialised view:
-- the ledger is append-only, so this is a pure `+=` on INSERT with no
-- UPDATE/DELETE compensation logic to get wrong. A materialised view would
-- go stale the moment a customer redeems and checks their balance in LIFF;
-- computing on the fly would force every segment/dashboard query to
-- aggregate the whole ledger. ht_rebuild_points_balances() below is the
-- nightly drift detector -- if it ever changes a row, that is a bug to chase.
create or replace function ht_ledger_apply()
returns trigger language plpgsql as $$
begin
  update ht_members m
     set points_balance  = m.points_balance + new.points,
         points_lifetime = m.points_lifetime + greatest(new.points, 0)
   where m.id = new.member_id;

  -- Promote (never demote -- redeeming points must not drop a tier) off lifetime points.
  update ht_members m
     set tier_code = t.code
    from (select code, min_lifetime_pts from ht_tiers where is_active) t
   where m.id = new.member_id
     and t.min_lifetime_pts <= m.points_lifetime
     and t.code is distinct from m.tier_code
     and t.min_lifetime_pts = (
       select max(t2.min_lifetime_pts) from ht_tiers t2
        where t2.is_active and t2.min_lifetime_pts <= m.points_lifetime);
  return new;
end;
$$;
drop trigger if exists trg_ht_ledger_apply on ht_points_ledger;
create trigger trg_ht_ledger_apply
  after insert on ht_points_ledger
  for each row execute function ht_ledger_apply();

create or replace function ht_rebuild_points_balances()
returns table (members_fixed bigint, total_balance bigint)
language plpgsql as $$
declare n bigint;
begin
  with agg as (
    select member_id,
           coalesce(sum(points), 0)::int                          as bal,
           coalesce(sum(points) filter (where points > 0), 0)::int as life
      from ht_points_ledger group by member_id
  )
  update ht_members m
     set points_balance  = coalesce(a.bal, 0),
         points_lifetime = coalesce(a.life, 0)
    from ht_members m2 left join agg a on a.member_id = m2.id
   where m.id = m2.id
     and (m.points_balance, m.points_lifetime)
         is distinct from (coalesce(a.bal, 0), coalesce(a.life, 0));
  get diagnostics n = row_count;
  return query select n, coalesce(sum(points_balance), 0)::bigint from ht_members;
end;
$$;

-- ── Registration finalisation: warranty items + points, one transaction ─────
-- Used for BOTH paths:
--   auto-match (p_reviewed_by is null)      -- Shopee/Lazada/TikTok, or a
--                                               Facebook/LINE claim that
--                                               resolved to exactly one order
--   admin approval (p_reviewed_by is set)   -- everything that landed in the
--                                               review queue; the admin has
--                                               typed/confirmed matched_order_no
--
-- p_items shape: [{"sku": "...", "product_name": "...", "quantity": 1}, ...]
-- warranty_start is always the registration's ORIGINAL submission date, never
-- "now()" -- the review SLA must not shrink the customer's coverage window.
create or replace function ht_finalize_registration(
  p_registration_id uuid,
  p_matched_order_no text,
  p_order_amount     numeric,
  p_items            jsonb,
  p_reviewed_by      uuid default null,
  p_note             text default null
) returns ht_warranty_registrations
language plpgsql security definer set search_path = public as $$
declare
  reg  ht_warranty_registrations;
  cfg  ht_points_config;
  pts  integer := 0;
  item jsonb;
  granted integer;
  next_rev integer;
begin
  select * into reg from ht_warranty_registrations where id = p_registration_id for update;
  if not found then raise exception 'registration % not found', p_registration_id; end if;
  if reg.status <> 'pending' then
    raise exception 'registration % is not pending (status=%)', p_registration_id, reg.status;
  end if;
  if p_matched_order_no is null or btrim(p_matched_order_no) = '' then
    raise exception 'matched_order_no is required to finalise a registration';
  end if;

  update ht_warranty_registrations set
    status = 'active',
    link_status = case when p_reviewed_by is null then 'auto_matched' else 'resolved' end,
    matched_order_no = p_matched_order_no,
    matched_amount = p_order_amount,
    matched_skus = coalesce(p_items, '[]'::jsonb),
    activated_at = now(),
    reviewed_by = p_reviewed_by,
    reviewed_at = case when p_reviewed_by is not null then now() else reviewed_at end,
    review_note = coalesce(p_note, review_note)
  where id = p_registration_id
  returning * into reg;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into ht_warranty_items (
      registration_id, member_id, sku, product_name, quantity, warranty_start, warranty_days
    ) values (
      reg.id, reg.member_id,
      item->>'sku', item->>'product_name',
      coalesce((item->>'quantity')::numeric, 1),
      reg.submitted_at::date, 365
    );
  end loop;

  if p_order_amount is not null and p_order_amount > 0 then
    cfg := ht_points_config_at(reg.submitted_at::date);
    if cfg.id is not null and p_order_amount >= cfg.min_order_amount then
      pts := case cfg.rounding
               when 'ceil'  then ceil(p_order_amount / cfg.thb_per_point)
               when 'round' then round(p_order_amount / cfg.thb_per_point)
               else floor(p_order_amount / cfg.thb_per_point)
             end::integer;
    end if;

    select coalesce(max(revision), 0) into next_rev
      from ht_points_ledger
     where source_type = 'warranty_registration' and source_ref = reg.id::text;
    next_rev := next_rev + 1;

    if pts > 0 then
      insert into ht_points_ledger (
        member_id, kind, points, source_type, source_ref, revision,
        basis_amount, rate_applied, config_id, registration_id, actor_id
      ) values (
        reg.member_id, 'earn', pts, 'warranty_registration', reg.id::text, next_rev,
        p_order_amount, cfg.thb_per_point, cfg.id, reg.id, p_reviewed_by
      )
      on conflict (source_type, source_ref, revision) do nothing;
    end if;
  end if;

  return reg;
end;
$$;

comment on function ht_finalize_registration(uuid, text, numeric, jsonb, uuid, text) is
  'Activates a registration (auto-match or admin approval), creates one '
  'ht_warranty_items row per SKU dated from the ORIGINAL submission date, '
  'and grants points in the same transaction. TODO(phase 2+): a companion '
  'reconciliation job that detects sales_transaction.order_status flipping '
  'to Cancelled after points were granted and inserts a matching ''reverse'' '
  'ledger row -- the ledger shape already supports this, the cron does not '
  'exist yet.';
