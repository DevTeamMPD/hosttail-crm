-- Hosttail CRM — bind a member to the platform buyer account behind their
-- orders, so a repeat purchase can attribute itself instead of the customer
-- re-typing an order id every time. ADDITIVE ONLY.
-- Rollback: drop table ht_member_platform_accounts;
--
-- Measured against live order_tracking (10,304 Hosttail rows, 2026-09-15)
-- before designing this:
--   * buyer_account_no is populated on 100% of rows for every online shop
--     (SH/FB/TT/LA/LOA/Web). That makes it a far better identity anchor than
--     phone, which SH_hosttail masks on 98% of its rows.
--   * 23.6% of Shopee accounts buy more than once and those accounts carry
--     45.5% of all orders, so binding covers a real share of traffic rather
--     than a long tail.
--   * 21 accounts (139 orders, 1.6%) are manual data-entry templates such as
--     'ชื่อ__0999999999' -- that one spans FOUR different shops, so binding it
--     would hand one member everybody else's orders. ht_mpa_account_shape_chk
--     rejects the whole class at the DB level; the data-dependent checks
--     (same account under >1 shop, >1 buyer_name) live in
--     src/lib/orders/bind-account.ts where order_tracking can be queried.
--   * 0 accounts are genuinely contested between two real members today.

create table if not exists ht_member_platform_accounts (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references ht_members(id) on delete cascade,

  -- order_tracking.shop ('SH_hosttail', 'FB_hosttail', ...) rather than
  -- .platform: shop is populated consistently, platform is not, and the only
  -- account values that appeared under more than one shop were the template
  -- junk above.
  shop           text not null,
  account_no     text not null,
  account_name   text,            -- buyer_name snapshot at bind time, for admin review only

  bound_via      text not null check (bound_via in ('registration', 'backfill', 'admin')),
  source_registration_id uuid references ht_warranty_registrations(id) on delete set null,

  status         text not null default 'active' check (status in ('active', 'revoked')),
  bound_at       timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid,            -- ht_staff.id
  revoke_reason  text,
  created_at     timestamptz not null default now(),

  -- Printable ASCII, no spaces: every real account id observed is digits
  -- (SH/FB/TT/LA/Web) or 'U'+32 hex (LOA). Thai characters or whitespace mean
  -- someone typed a name/address into the field.
  constraint ht_mpa_account_shape_chk check (
    length(account_no) between 4 and 64
    and account_no ~ '^[\x21-\x7E]+$'
    and account_no !~ '^(.)\1+$'
  ),
  constraint ht_mpa_revoked_chk check (status <> 'revoked' or revoked_at is not null)
);

-- The safety property this whole feature rests on: a platform account has at
-- most one owner at a time, so two members can never both auto-claim the same
-- order stream. A revoked row keeps its history but frees the account.
create unique index if not exists ux_ht_mpa_account
  on ht_member_platform_accounts (shop, account_no)
  where status = 'active';

create index if not exists ix_ht_mpa_member
  on ht_member_platform_accounts (member_id)
  where status = 'active';

alter table ht_member_platform_accounts enable row level security;

create policy ht_staff_read_platform_accounts on ht_member_platform_accounts
  for select to authenticated using (ht_is_staff('viewer'));

-- Binding is an identity decision, so manual writes are admin-only. The LIFF
-- path writes through the service role (which bypasses RLS) after the checks
-- in bind-account.ts.
create policy ht_admin_write_platform_accounts on ht_member_platform_accounts
  for all to authenticated using (ht_is_staff('admin')) with check (ht_is_staff('admin'));
