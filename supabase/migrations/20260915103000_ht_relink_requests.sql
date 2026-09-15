-- Hosttail CRM — put legacy-account claims behind admin approval instead of
-- merging them on the spot. ADDITIVE ONLY.
-- Rollback: drop function ht_approve_relink_request, ht_reject_relink_request;
--           drop table ht_relink_requests;
--
-- Why: both merge paths accepted "knows the phone number" as proof of
-- identity and merged immediately --
--   1. POST /api/liff/relink  (the "เคยเป็นสมาชิกแล้ว?" button)
--   2. submitRegistration() step 1b, which merged on a phone match BEFORE the
--      submitted order was even resolved, so the order proved nothing
-- On 2026-09-15 that fired for real: a developer's own LINE account absorbed a
-- real customer's record (and, through the platform-account backfill, that
-- customer's Shopee account too, which would have redirected their future
-- orders). It was reverted, but only because nothing automatic had run yet.
--
-- The stakes rise sharply once the auto-attribution cron exists: a wrong merge
-- would then quietly grant points and warranties from someone else's future
-- purchases every night, and ht_points_ledger is append-only, so unwinding
-- that is far messier than unwinding a single merge. Hence: queue, review,
-- then merge.

create table if not exists ht_relink_requests (
  id                 uuid primary key default gen_random_uuid(),
  claimant_member_id uuid not null references ht_members(id) on delete cascade,
  legacy_member_id   uuid not null references ht_members(id) on delete cascade,
  claimed_phone      text not null,
  origin             text not null check (origin in ('relink_button', 'order_submit')),

  -- Everything the reviewer needs to judge the claim without running queries:
  -- the legacy row's name/points/registration count, and any corroboration we
  -- found (e.g. the claimant's own line_uid appearing in order_tracking next
  -- to the phone being claimed -- possible because LINE OA buyer_account_no
  -- IS a line_uid from the same provider).
  evidence           jsonb not null default '{}'::jsonb,

  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected', 'superseded')),
  requested_at       timestamptz not null default now(),
  reviewed_by        uuid,                 -- ht_staff.id
  reviewed_at        timestamptz,
  review_note        text,
  merge_id           uuid references ht_member_merges(id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint ht_relink_not_self check (claimant_member_id <> legacy_member_id),
  constraint ht_relink_reviewed_chk check (status = 'pending' or reviewed_at is not null)
);

-- One open claim per pair; re-submitting is a no-op rather than a duplicate.
create unique index if not exists ux_ht_relink_open
  on ht_relink_requests (claimant_member_id, legacy_member_id) where status = 'pending';
-- Two different people claiming the same legacy member is the case a reviewer
-- most needs to see, so keep it cheap to find.
create index if not exists ix_ht_relink_legacy
  on ht_relink_requests (legacy_member_id) where status = 'pending';
create index if not exists ix_ht_relink_queue
  on ht_relink_requests (requested_at) where status = 'pending';

alter table ht_relink_requests enable row level security;

drop policy if exists ht_staff_read_relink on ht_relink_requests;
create policy ht_staff_read_relink on ht_relink_requests
  for select to authenticated using (ht_is_staff('viewer'));

revoke all on ht_relink_requests from anon;

-- Approving is now the ONLY path that may merge a legacy member into a live
-- one. SECURITY DEFINER so the Phase 2 approvals screen can call it directly.
create or replace function ht_approve_relink_request(p_request_id uuid, p_actor uuid default null)
returns ht_members
language plpgsql security definer set search_path = public as $$
declare
  req    ht_relink_requests;
  winner ht_members;
  v_merge uuid;
begin
  select * into req from ht_relink_requests where id = p_request_id for update;
  if not found then raise exception 'relink request % not found', p_request_id; end if;
  if req.status <> 'pending' then
    raise exception 'relink request % is already %', p_request_id, req.status;
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

create or replace function ht_reject_relink_request(p_request_id uuid, p_note text, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update ht_relink_requests
     set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(), review_note = p_note
   where id = p_request_id and status = 'pending';
  if not found then raise exception 'relink request % not found or not pending', p_request_id; end if;
end;
$$;

revoke execute on function ht_approve_relink_request(uuid, uuid) from public, anon;
revoke execute on function ht_reject_relink_request(uuid, text, uuid) from public, anon;
grant execute on function ht_approve_relink_request(uuid, uuid) to authenticated;
grant execute on function ht_reject_relink_request(uuid, text, uuid) to authenticated;
