-- Hosttail CRM — merge a legacy member into their new-provider account. ADDITIVE ONLY.
-- Rollback: drop function ht_merge_members;
--
-- Why this exists: the 72 real legacy members registered under a LINE Login
-- channel that turned out to belong to a different LINE Developers PROVIDER
-- than the org-owned one this app now uses. LINE user IDs are scoped per
-- PROVIDER (confirmed against LINE's own docs 2026-09-15) -- a different
-- provider means a completely different, unrelated line_uid for the same
-- real person, even though the channel is conceptually "the same app".
-- There is no way to carry the old UID forward; when a legacy customer
-- opens the new LIFF app, POST /api/liff/session will mint them a brand
-- new ht_members row (new line_uid, no history) because their old line_uid
-- was never seen before under the new provider.
--
-- The fix is on re-entry, not on migration day: when that new row submits
-- a phone number matching an imported legacy row, merge the legacy row's
-- history into the new (now-live) row -- see submit.ts, which calls this
-- right after the profile upsert. The NEW row is always the winner (its
-- line_uid is the one that will actually keep working), the legacy row is
-- the loser.

create or replace function ht_merge_members(
  p_winner uuid,
  p_loser  uuid,
  p_reason text,
  p_actor  uuid default null
) returns ht_members
language plpgsql security definer set search_path = public as $$
declare
  winner ht_members;
  loser  ht_members;
  n_reg  integer;
  n_item integer;
  n_pts  integer := 0;
begin
  if p_winner = p_loser then raise exception 'cannot merge a member into itself'; end if;

  select * into winner from ht_members where id = p_winner for update;
  if not found then raise exception 'winner member % not found', p_winner; end if;

  select * into loser from ht_members where id = p_loser for update;
  if not found then raise exception 'loser member % not found', p_loser; end if;

  if loser.status = 'merged' then
    raise exception 'member % has already been merged', p_loser;
  end if;

  -- Move the loser's actual records -- these tables have no append-only
  -- trigger, so a straight reassignment is safe and correct: the customer's
  -- warranty coverage and item-level 365-day countdowns should show up
  -- under the account they're actually using now.
  update ht_warranty_registrations set member_id = p_winner where member_id = p_loser;
  get diagnostics n_reg = row_count;
  update ht_warranty_items set member_id = p_winner where member_id = p_loser;
  get diagnostics n_item = row_count;

  -- ht_points_ledger and ht_member_consents are append-only (a trigger
  -- refuses UPDATE/DELETE on them, on purpose) -- their rows stay under the
  -- loser's id forever as an honest historical record. Only the net points
  -- BALANCE is carried forward, as a single new 'adjust' entry on the
  -- winner, exactly the way a manual correction is recorded anywhere else
  -- in this ledger. Consent isn't copied at all: submitRegistration()
  -- already records fresh terms/pdpa consent for the winner on this same
  -- request, which is more correct than copying a consent event tied to a
  -- LINE account that no longer exists from the platform's point of view.
  if loser.points_balance <> 0 then
    insert into ht_points_ledger (member_id, kind, points, source_type, source_ref, actor_id, note)
    values (
      p_winner,
      case when loser.points_balance > 0 then 'adjust' else 'adjust' end,
      loser.points_balance,
      'manual',
      p_loser::text,
      p_actor,
      format('Merged from legacy member %s (reason: %s) -- balance carried forward, ledger history stays under the old id', p_loser, p_reason)
    );
    n_pts := loser.points_balance;
  end if;

  update ht_members
     set status = 'merged', merged_into = p_winner
   where id = p_loser;

  insert into ht_member_merges (winner_id, loser_id, reason, merged_by, moved_rows)
  values (p_winner, p_loser, p_reason, p_actor,
          jsonb_build_object('warranty_registrations', n_reg, 'warranty_items', n_item, 'points_balance', n_pts));

  select * into winner from ht_members where id = p_winner;
  return winner;
end;
$$;

revoke execute on function ht_merge_members(uuid, uuid, text, uuid) from public, anon;
-- Called from submitRegistration() (service role) and, later, an admin
-- merge-duplicates screen in the dashboard -- grant to authenticated too so
-- that second caller doesn't need its own RPC.
grant execute on function ht_merge_members(uuid, uuid, text, uuid) to authenticated;
