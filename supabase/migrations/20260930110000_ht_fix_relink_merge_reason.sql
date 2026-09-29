-- Hosttail CRM — make "approve relink request" actually work. ADDITIVE ONLY.
-- Rollback: alter table ht_member_merges drop constraint ht_member_merges_reason_check,
--             add constraint ht_member_merges_reason_check
--             check (reason in ('line_uid','phone','manual','legacy_composite'));
--           then re-run ht_approve_relink_request from 20260915103000.
--
-- Why: ht_approve_relink_request() calls ht_merge_members(..., 'relink_approved', ...),
-- but ht_member_merges.reason only allowed the four values from 20260915100200,
-- so every approval failed with "violates check constraint
-- ht_member_merges_reason_check" and nothing was merged. Phase 1 keeps exactly
-- this flow: phone match -> ht_relink_requests -> an admin approves the link.
--
-- Also: refuse to approve a claim from a test account against a real customer.
-- New claims from test accounts are already blocked in relink.ts / submit.ts,
-- but claims filed before that rule (2026-09-15) are still pending, and
-- approving one would move a real customer's warranty history into a test
-- account.

alter table ht_member_merges drop constraint if exists ht_member_merges_reason_check;
alter table ht_member_merges add constraint ht_member_merges_reason_check
  check (reason in ('line_uid','phone','manual','legacy_composite','relink_approved'));

create or replace function ht_approve_relink_request(p_request_id uuid, p_actor uuid default null)
returns ht_members
language plpgsql security definer set search_path = public as $$
declare
  req    ht_relink_requests;
  winner ht_members;
  v_merge uuid;
  claimant_test boolean;
  legacy_test   boolean;
begin
  select * into req from ht_relink_requests where id = p_request_id for update;
  if not found then raise exception 'relink request % not found', p_request_id; end if;
  if req.status <> 'pending' then
    raise exception 'relink request % is already %', p_request_id, req.status;
  end if;

  select is_test into claimant_test from ht_members where id = req.claimant_member_id;
  select is_test into legacy_test   from ht_members where id = req.legacy_member_id;
  if claimant_test and not legacy_test then
    raise exception 'บัญชีทดสอบเชื่อมกับบัญชีลูกค้าจริงไม่ได้ — กรุณาปฏิเสธคำขอนี้';
  end if;

  winner := ht_merge_members(req.claimant_member_id, req.legacy_member_id, 'relink_approved', p_actor);

  select id into v_merge from ht_member_merges
   where winner_id = req.claimant_member_id and loser_id = req.legacy_member_id
   order by merged_at desc limit 1;

  update ht_relink_requests
     set status = 'approved', reviewed_by = p_actor, reviewed_at = now(), merge_id = v_merge
   where id = p_request_id;

  update ht_relink_requests
     set status = 'superseded', reviewed_by = p_actor, reviewed_at = now(),
         review_note = 'superseded by approved request ' || p_request_id
   where legacy_member_id = req.legacy_member_id and status = 'pending' and id <> p_request_id;

  return winner;
end;
$$;

revoke execute on function ht_approve_relink_request(uuid, uuid) from public, anon;
grant execute on function ht_approve_relink_request(uuid, uuid) to authenticated;
