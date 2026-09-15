-- Hosttail CRM — close two gaps the security advisor surfaced. ADDITIVE ONLY.
-- Rollback: `grant execute on function ht_is_staff(text), ht_current_staff_role() to public;`
--           `drop policy ht_staff_read_consents on ht_member_consents;`
--
-- Gap 1: `revoke all on all functions in schema public from anon` (in the RLS
-- migration) revokes only the `anon` grant, but CREATE FUNCTION implicitly
-- grants EXECUTE to the PUBLIC pseudo-role by default, and anon inherits
-- that. The per-function `revoke ... from public, anon` on
-- ht_finalize_registration/ht_reject_registration/ht_resubmit_registration
-- already closed this correctly (verified: anon cannot call them). It was
-- missed for ht_current_staff_role/ht_is_staff. Practically low-severity
-- here (they read auth.uid(), which is null for anon, so they just return
-- null/false) but they should not be reachable by anon at all, and RLS
-- policies evaluate them as the querying role, so `authenticated` must keep
-- an explicit grant even after the PUBLIC default is revoked.
revoke execute on function ht_current_staff_role() from public;
revoke execute on function ht_is_staff(text)       from public;
grant  execute on function ht_current_staff_role() to authenticated;
grant  execute on function ht_is_staff(text)       to authenticated;

-- Gap 2: ht_member_consents had RLS enabled with NO select policy for
-- `authenticated` at all -- meaning ht_v_member_consent (security_invoker)
-- would return zero rows for staff too, since a security_invoker view
-- enforces the underlying table's RLS as the calling role. Writes correctly
-- stay staff-inaccessible (append-only, via the LIFF route handler's service
-- role only) -- this adds read-only visibility for the dashboard.
create policy ht_staff_read_consents on ht_member_consents
  for select to authenticated using (ht_is_staff('viewer'));
