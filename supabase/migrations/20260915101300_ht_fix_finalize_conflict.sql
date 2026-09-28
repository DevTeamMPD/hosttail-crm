-- Hosttail CRM — fix ht_finalize_registration's ON CONFLICT target. ADDITIVE ONLY.
-- Rollback: not meaningful (this is a bugfix to a function body; reapplying
--           20260915100400_ht_points.sql would restore the broken version).
--
-- Bug found via live end-to-end testing 2026-09-15: ux_ht_ledger_source_rev
-- is a PARTIAL unique index (`where source_ref is not null`), but the
-- INSERT ... ON CONFLICT (source_type, source_ref, revision) DO NOTHING
-- clause in ht_finalize_registration didn't repeat that predicate. Postgres
-- requires an ON CONFLICT target to exactly match a partial index's
-- predicate to use it for conflict inference -- without it, every points
-- grant failed with "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification", which took down the entire auto-match
-- activation path (confirmed: POST /api/liff/orders 500'd on every clean
-- Shopee match).

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
      -- Must repeat the partial index's predicate (`where source_ref is not
      -- null`) for Postgres to match ux_ht_ledger_source_rev as the conflict
      -- target -- this is the exact bug being fixed.
      on conflict (source_type, source_ref, revision) where source_ref is not null do nothing;
    end if;
  end if;

  return reg;
end;
$$;
