-- Hosttail CRM — fix lifetime-points/tier handling on reversal. ADDITIVE ONLY.
-- Rollback: not meaningful (bugfix to a trigger function body).
--
-- Found while writing a manual test-data cleanup 'reverse' ledger entry:
-- the original ht_ledger_apply() only ever ADDED to points_lifetime
-- (`greatest(new.points, 0)`), for every kind including 'reverse'. That
-- means a member who earned points from an order that later turns out
-- invalid (JST flips order_status to Cancelled -- the exact scenario the
-- whole append-only ledger design exists for) keeps the lifetime credit and
-- tier status forever, even after the earn is reversed. A "reversal" that
-- doesn't actually undo the lifetime/tier effect isn't a real reversal.
--
-- Fixed so that:
--   earn / bonus / adjust  -> lifetime moves with the points (as before)
--   reverse                -> lifetime moves too (undoes an invalid earn;
--                             its points are always negative)
--   redeem / expire        -> lifetime is untouched (spending or expiring
--                             legitimately-earned points must not cost a
--                             member their tier)
-- Tier is recomputed (allowing DEMOTION) after earn/bonus/reverse/adjust,
-- but never after redeem/expire, for the same reason.

create or replace function ht_ledger_apply()
returns trigger language plpgsql set search_path = public as $$
declare
  lifetime_delta integer;
begin
  lifetime_delta := case
    when new.kind in ('earn', 'bonus', 'adjust') then new.points
    when new.kind = 'reverse' then new.points  -- always negative; undoes a prior earn's lifetime credit
    else 0                                      -- redeem / expire: spending doesn't cost tier status
  end;

  update ht_members m
     set points_balance  = m.points_balance + new.points,
         points_lifetime = greatest(m.points_lifetime + lifetime_delta, 0)
   where m.id = new.member_id;

  if new.kind in ('earn', 'bonus', 'reverse', 'adjust') then
    update ht_members m
       set tier_code = (
         select t.code from ht_tiers t
          where t.is_active and t.min_lifetime_pts <= m.points_lifetime
          order by t.min_lifetime_pts desc limit 1
       )
     where m.id = new.member_id;
  end if;

  return new;
end;
$$;
