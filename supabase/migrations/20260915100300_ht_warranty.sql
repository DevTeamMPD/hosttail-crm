-- Hosttail CRM — warranty registrations + per-SKU warranty items. ADDITIVE ONLY.
-- Rollback: drop table ht_warranty_items, ht_warranty_registrations cascade;
--           drop function ht_reject_registration, ht_resubmit_registration;
--
-- Two tables, deliberately separate:
--   ht_warranty_registrations  1 row  = 1 claim the customer submitted
--                                       (an order id, or a phone number for
--                                       the Facebook/LINE channel)
--   ht_warranty_items          1 row  = 1 SKU covered by an activated claim
--                                       (an order can contain several SKUs,
--                                       each gets its own 365-day countdown)
--
-- Channel behaviour, per business decision:
--   shopee / lazada / tiktok   -> order_ref_kind='order_id'. Resolver tries
--                                 both sales_transaction.bill_no and .order_no
--                                 (see src/lib/orders/resolve.ts) and, on a
--                                 clean single match, activates instantly.
--   facebook / line            -> order_ref_kind='phone'. sales_transaction
--                                 has no phone column, so resolution goes
--                                 through order_tracking.phone ->
--                                 order_tracking.online_order ->
--                                 sales_transaction. Measured auto-match rate
--                                 is low (~4% in the sampled data), so most of
--                                 these land in the review queue, where the
--                                 admin types in the real bill number.
--                                 SECURITY: the API layer MUST reject a
--                                 declared_phone that does not equal the
--                                 caller's own ht_members.phone -- a phone
--                                 number is not a secret the way an order id
--                                 is, so without this check anyone who knows
--                                 a customer's number could claim their
--                                 orders and points. See resolve.ts.
--   homepro / makropro / receipt -> order_ref_kind='order_id' (the receipt
--                                 number), requires_receipt=true (a photo is
--                                 mandatory at submission), always reviewed by
--                                 an admin who types in the matching bill
--                                 number -- these numbers collide across
--                                 months (see sales_transaction's own comment
--                                 on why its unique key includes
--                                 transfer_date), so no auto-approve.
--
-- SLA / retry rules (confirmed by the user 2026-09-15):
--   - admin has 1-2 business days to review (ht_settings.warranty.review_sla_business_days)
--   - a rejected claim may be corrected and resubmitted up to 3 attempts total
--   - warranty_start is always the SUBMISSION date (registration day = day 1),
--     never the approval date -- the review SLA must not eat into the
--     customer's own 365-day coverage window.

create table if not exists ht_warranty_registrations (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references ht_members(id) on delete cascade,

  channel            text not null
                       check (channel in ('shopee','lazada','tiktok','facebook','line',
                                          'homepro','makropro','receipt')),

  -- ── What the customer typed ────────────────────────────────────────────────
  order_ref_kind     text not null check (order_ref_kind in ('order_id','phone')),
  order_ref_raw      text not null,
  -- Only meaningful for order_id-kind claims. NULL for phone-kind so that a
  -- member submitting several different Facebook/LINE purchases (which all
  -- share the same phone) never collide on this key.
  order_key          text generated always as (
                        case when order_ref_kind = 'order_id'
                             then ht_norm_order_key(order_ref_raw) end
                      ) stored,
  declared_phone     text generated always as (
                        case when order_ref_kind = 'phone'
                             then ht_normalize_phone_th(order_ref_raw) end
                      ) stored,

  requires_receipt   boolean not null default false,
  receipt_path       text,      -- storage object path in the private ht-receipts bucket
  receipt_mime       text,
  receipt_bytes      integer,

  -- ── Resolution ──────────────────────────────────────────────────────────────
  link_status        text not null default 'pending_review'
                       check (link_status in ('auto_matched','pending_review',
                                              'needs_info','resolved','not_found','void')),
  -- Hints only, from src/lib/orders/resolve.ts -- never authoritative. The
  -- admin always confirms (or types) the real matched_order_no by hand.
  auto_match_candidates jsonb not null default '[]'::jsonb,
  matched_order_no   text,             -- admin-confirmed sales_transaction.order_no
  matched_amount     numeric(14,2),    -- net amount used for points calculation
  matched_skus       jsonb not null default '[]'::jsonb,  -- [{sku,product_name,quantity}]

  -- ── Overall status ──────────────────────────────────────────────────────────
  status             text not null default 'pending'
                       check (status in ('pending','active','rejected',
                                         'attempts_exhausted','void')),
  attempt_no         integer not null default 1 check (attempt_no between 1 and 3),
  rejection_history  jsonb not null default '[]'::jsonb,  -- [{at,by,reason}]

  reviewed_by        uuid,             -- ht_staff.id
  reviewed_at        timestamptz,
  review_note        text,

  sla_due_at         timestamptz,      -- submitted_at + ht_settings.warranty.review_sla_business_days

  submitted_at       timestamptz not null default now(),
  activated_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint ht_warranty_receipt_chk
    check (not requires_receipt or receipt_path is not null),
  constraint ht_warranty_active_chk
    check (status <> 'active' or (matched_order_no is not null and activated_at is not null)),
  constraint ht_warranty_rejected_chk
    check (status not in ('rejected','attempts_exhausted')
           or jsonb_array_length(rejection_history) > 0)
);

-- A member may not have two live claims on the same order reference. Rejected/
-- exhausted rows are excluded so the key can be reused by a corrected re-entry.
create unique index if not exists ux_ht_warranty_member_orderkey
  on ht_warranty_registrations (member_id, order_key)
  where order_key is not null and status not in ('rejected','attempts_exhausted');

create index if not exists ix_ht_warranty_member      on ht_warranty_registrations (member_id);
create index if not exists ix_ht_warranty_order_key   on ht_warranty_registrations (order_key);
create index if not exists ix_ht_warranty_phone       on ht_warranty_registrations (declared_phone);
create index if not exists ix_ht_warranty_matched     on ht_warranty_registrations (matched_order_no);
create index if not exists ix_ht_warranty_queue
  on ht_warranty_registrations (submitted_at)
  where status = 'pending' and link_status in ('pending_review','needs_info');  -- the approvals screen
create index if not exists ix_ht_warranty_sla
  on ht_warranty_registrations (sla_due_at)
  where status = 'pending';  -- SLA-breach alerting

drop trigger if exists trg_ht_warranty_touch on ht_warranty_registrations;
create trigger trg_ht_warranty_touch
  before update on ht_warranty_registrations
  for each row execute function ht_touch_updated_at();

-- ── Per-SKU warranty coverage ────────────────────────────────────────────────
create table if not exists ht_warranty_items (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references ht_warranty_registrations(id) on delete cascade,
  member_id        uuid not null references ht_members(id) on delete cascade,
  sku              text,
  product_name     text,
  quantity         numeric(14,2) not null default 1,

  -- Always the registration's submission date, never the approval date.
  warranty_start   date not null,
  warranty_days    integer not null default 365 check (warranty_days > 0),
  warranty_end     date generated always as (warranty_start + warranty_days) stored,

  status           text not null default 'active' check (status in ('active','expired','void')),
  created_at       timestamptz not null default now()
);

create index if not exists ix_ht_warranty_items_registration on ht_warranty_items (registration_id);
create index if not exists ix_ht_warranty_items_member_end   on ht_warranty_items (member_id, warranty_end);
create index if not exists ix_ht_warranty_items_sku          on ht_warranty_items (sku);
-- Drives both the customer's "ใกล้หมดประกัน" list and the nightly expiry cron.
create index if not exists ix_ht_warranty_items_active_end
  on ht_warranty_items (warranty_end) where status = 'active';

-- ── Reject / resubmit ────────────────────────────────────────────────────────
-- Activation (auto-match or admin approval) lives in ht_points.sql as
-- ht_finalize_registration(), because granting points and creating warranty
-- items must happen atomically in one transaction.

create or replace function ht_reject_registration(
  p_registration_id uuid,
  p_reviewer        uuid,
  p_reason          text
) returns ht_warranty_registrations
language plpgsql security definer set search_path = public as $$
declare r ht_warranty_registrations;
begin
  select * into r from ht_warranty_registrations where id = p_registration_id for update;
  if not found then raise exception 'registration % not found', p_registration_id; end if;
  if r.status <> 'pending' then
    raise exception 'registration % is not pending (status=%)', p_registration_id, r.status;
  end if;

  update ht_warranty_registrations set
    status = case when attempt_no >= 3 then 'attempts_exhausted' else 'rejected' end,
    reviewed_by = p_reviewer,
    reviewed_at = now(),
    review_note = p_reason,
    rejection_history = rejection_history || jsonb_build_array(
      jsonb_build_object('at', now(), 'by', p_reviewer, 'reason', p_reason, 'attempt_no', attempt_no)
    )
  where id = p_registration_id
  returning * into r;

  return r;
end;
$$;

-- Customer corrects and resubmits a rejected claim. Capped at 3 attempts total
-- (checked here, not just relied on client-side, to stop scripted retries).
create or replace function ht_resubmit_registration(
  p_registration_id uuid,
  p_new_order_ref   text default null,
  p_new_receipt_path text default null
) returns ht_warranty_registrations
language plpgsql security definer set search_path = public as $$
declare r ht_warranty_registrations;
begin
  select * into r from ht_warranty_registrations where id = p_registration_id for update;
  if not found then raise exception 'registration % not found', p_registration_id; end if;
  if r.status <> 'rejected' then
    raise exception 'registration % cannot be resubmitted (status=%)', p_registration_id, r.status;
  end if;
  if r.attempt_no >= 3 then
    raise exception 'registration % has exhausted its 3 attempts', p_registration_id;
  end if;

  update ht_warranty_registrations set
    status = 'pending',
    link_status = 'pending_review',
    attempt_no = attempt_no + 1,
    order_ref_raw = coalesce(p_new_order_ref, order_ref_raw),
    receipt_path = coalesce(p_new_receipt_path, receipt_path),
    matched_order_no = null,
    matched_amount = null,
    matched_skus = '[]'::jsonb,
    reviewed_by = null,
    reviewed_at = null,
    review_note = null
  where id = p_registration_id
  returning * into r;

  return r;
end;
$$;
