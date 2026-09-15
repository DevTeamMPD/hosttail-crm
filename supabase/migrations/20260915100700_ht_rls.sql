-- Hosttail CRM — Row Level Security. ADDITIVE ONLY.
-- Rollback: alter table ... disable row level security; drop policy ... (per table).
--
-- RLS here is defence-in-depth, NOT the primary access control on the LIFF
-- path. A LIFF customer is never a Supabase Auth user -- there is no JWT to
-- write a policy against. Identity is a verified LINE ID token, checked
-- server-side in a route handler that then uses the SERVICE ROLE (which
-- bypasses RLS entirely) and scopes every query itself with the member_id
-- derived from that verified token. See src/lib/liff/verify.ts.
--
-- The primary control on that path is therefore in the route handler code,
-- not in these policies: never read member_id/line_uid from a request body.
--
-- What RLS actually guards here:
--   - the `authenticated` role (dashboard staff, via Supabase Auth) is
--     restricted by ht_staff.role
--   - the `anon` role gets nothing at all -- the LIFF app never talks to
--     PostgREST directly, only through route handlers holding the service key
--   - ht_points_ledger and ht_member_consents get NO write policy for
--     `authenticated` at all, on purpose: a compromised dashboard session
--     must not be able to mint points or fabricate consent. Writes go only
--     through the SECURITY DEFINER RPCs in ht_points.sql / ht_warranty.sql.

alter table ht_members                enable row level security;
alter table ht_member_line_ids        enable row level security;
alter table ht_member_merges          enable row level security;
alter table ht_provinces              enable row level security;
alter table ht_province_aliases       enable row level security;
alter table ht_warranty_registrations enable row level security;
alter table ht_warranty_items         enable row level security;
alter table ht_points_ledger          enable row level security;
alter table ht_points_config          enable row level security;
alter table ht_tiers                  enable row level security;
alter table ht_consent_documents      enable row level security;
alter table ht_member_consents        enable row level security;
alter table ht_staff                  enable row level security;
alter table ht_audit_log              enable row level security;
alter table ht_settings               enable row level security;

revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;

-- ── viewer: read almost everything ──────────────────────────────────────────
create policy ht_staff_read_members    on ht_members                for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_line_ids   on ht_member_line_ids        for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_provinces  on ht_provinces              for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_prov_alias on ht_province_aliases       for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_warranty   on ht_warranty_registrations for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_items      on ht_warranty_items         for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_ledger     on ht_points_ledger          for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_config     on ht_points_config          for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_tiers      on ht_tiers                  for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_settings   on ht_settings               for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_consentdoc on ht_consent_documents      for select to authenticated using (ht_is_staff('viewer'));

-- Every signed-in staff member may read their own row (needed to bootstrap the session).
create policy ht_staff_read_self on ht_staff
  for select to authenticated using (auth_user_id = auth.uid());

-- ── marketing: correct member profile fields, work the approvals queue ──────
-- Column-level grants narrow this to profile fields only -- NOT identity
-- (line_uid), NOT points_balance/points_lifetime/tier_code.
create policy ht_mkt_update_members on ht_members
  for update to authenticated
  using (ht_is_staff('marketing')) with check (ht_is_staff('marketing'));
revoke update on ht_members from authenticated;
grant  update (full_name, province_code, province_raw, pet_types, pet_other, note, status)
  on ht_members to authenticated;

create policy ht_mkt_update_warranty on ht_warranty_registrations
  for update to authenticated
  using (ht_is_staff('marketing')) with check (ht_is_staff('marketing'));
revoke update on ht_warranty_registrations from authenticated;
-- Approve/reject go through ht_finalize_registration()/ht_reject_registration()
-- (SECURITY DEFINER), so direct table UPDATE is only needed for lightweight
-- triage fields.
grant update (review_note) on ht_warranty_registrations to authenticated;

create policy ht_mkt_read_member_merges on ht_member_merges
  for select to authenticated using (ht_is_staff('marketing'));

-- ── admin: settings, config, staff management, audit ────────────────────────
create policy ht_admin_all_config   on ht_points_config for all to authenticated using (ht_current_staff_role() = 'admin') with check (ht_current_staff_role() = 'admin');
create policy ht_admin_all_tiers    on ht_tiers         for all to authenticated using (ht_current_staff_role() = 'admin') with check (ht_current_staff_role() = 'admin');
create policy ht_admin_all_settings on ht_settings       for all to authenticated using (ht_current_staff_role() = 'admin') with check (ht_current_staff_role() = 'admin');
create policy ht_admin_all_staff    on ht_staff          for all to authenticated using (ht_current_staff_role() = 'admin') with check (ht_current_staff_role() = 'admin');
create policy ht_admin_all_consentdoc on ht_consent_documents for all to authenticated using (ht_current_staff_role() = 'admin') with check (ht_current_staff_role() = 'admin');
create policy ht_admin_read_audit   on ht_audit_log      for select to authenticated using (ht_current_staff_role() = 'admin');
create policy ht_admin_read_merges  on ht_member_merges  for select to authenticated using (ht_current_staff_role() = 'admin');

-- ── Hard prohibitions (no policy = no access; stated for the reader) ────────
-- ht_points_ledger      : no insert/update/delete policy for `authenticated`,
--                          at all. Every write goes through
--                          ht_finalize_registration() (SECURITY DEFINER).
-- ht_member_consents    : no insert/update/delete policy for `authenticated`.
--                          Consent is recorded only via the LIFF route
--                          handler (service role) or a future dashboard
--                          action that itself goes through a SECURITY
--                          DEFINER RPC -- never a bare table write.
-- ht_audit_log          : no update/delete policy for anyone, including admin.
-- ht_warranty_items     : no write policy for `authenticated` at all --
--                          created only by ht_finalize_registration().

-- ── Function execution grants ────────────────────────────────────────────────
revoke execute on function ht_finalize_registration(uuid, text, numeric, jsonb, uuid, text) from public, anon;
revoke execute on function ht_reject_registration(uuid, uuid, text)                          from public, anon;
revoke execute on function ht_resubmit_registration(uuid, text, text)                        from public, anon;
grant  execute on function ht_finalize_registration(uuid, text, numeric, jsonb, uuid, text) to authenticated;
grant  execute on function ht_reject_registration(uuid, uuid, text)                          to authenticated;
-- ht_resubmit_registration is called by the CUSTOMER via the LIFF route
-- handler, which uses the service role -- it does not need an `authenticated`
-- (staff) grant at all.
revoke execute on function ht_rebuild_points_balances() from public, anon, authenticated;
