-- Hosttail CRM — mark internal test accounts so they can exercise real order
-- data without any write escaping onto a real customer. ADDITIVE ONLY.
-- Rollback: alter table ht_members drop column is_test;
--
-- Testing this app needs real orders: the whole point of resolve.ts is that it
-- matches what customers actually type against sales_transaction, and fixtures
-- would only prove the fixtures work. Reading that data is harmless. The
-- question is which WRITES can reach someone else, and there is exactly one:
--
--   ux_ht_warranty_member_orderkey  (member_id, order_key)  -> per member, so a
--     test account claiming a real order does NOT stop the real buyer from
--     claiming it too
--   ux_ht_ledger_source_rev  (source_type, source_ref, revision) -> keyed on
--     the registration id, so points never collide across members
--   ux_ht_mpa_account  (shop, account_no) WHERE active -> GLOBAL. This is the
--     dangerous one: a test account binding a real buyer account would lock
--     that account and divert the real customer's future orders into the test
--     member. Exactly what happened by hand on 2026-09-15.
--
-- So test accounts are barred from binding (src/lib/orders/bind-account.ts)
-- and from filing legacy-account claims, and everything else they produce is
-- member-scoped and removable by scripts/reset-test-member.ts.

alter table ht_members
  add column if not exists is_test boolean not null default false;

comment on column ht_members.is_test is
  'Internal test account. Reads real order data (harmless) but is barred from any write that reaches a real customer -- see bind-account.ts. Must be excluded from segments, broadcasts and reporting.';

create index if not exists ix_ht_members_is_test on ht_members (is_test) where is_test;
