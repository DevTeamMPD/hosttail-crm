-- Hosttail CRM — fix "role mutable search_path" advisor findings. ADDITIVE ONLY
-- in the sense that it only recreates ht_* function bodies, unchanged except
-- for adding `set search_path = public`.
--
-- Supabase's security advisor flagged every ht_ function created in the
-- earlier migrations of this batch (20260915100000-20260915100700) for not
-- pinning search_path. A function without it resolves unqualified names
-- against whatever search_path the CALLING session has, which is how a
-- privileged function can be tricked into running attacker-controlled code
-- if a malicious schema earlier in some session's path defines a
-- same-named object. Recorded as a new migration rather than editing the
-- already-applied files above, per standard migration hygiene.
--
-- Rollback: re-run the original create-or-replace bodies without the
-- `set search_path = public` clause (not recommended).

create or replace function ht_normalize_phone_th(raw text)
returns text language plpgsql immutable set search_path = public as $$
declare d text;
begin
  if raw is null or raw like '%*%' then return null; end if;
  d := regexp_replace(raw, '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if d ~ '^0066' then
    d := '0' || substring(d from 5);
  elsif d ~ '^66' and length(d) between 11 and 12 then
    d := '0' || substring(d from 3);
  end if;
  if    d ~ '^0[689][0-9]{8}$' then return d;
  elsif d ~ '^0[2-7][0-9]{7}$' then return d;
  end if;
  return null;
end;
$$;

create or replace function ht_norm_order_key(raw text)
returns text language sql immutable set search_path = public as $$
  select nullif(
    upper(regexp_replace(
      regexp_replace(
        regexp_replace(btrim(coalesce(raw,'')), '[​‌‍﻿]', '', 'g'),
        '^#+\s*', ''),
      '[\s\-]', '', 'g')),
    '')
$$;

create or replace function ht_pet_tokens(raw text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
  from (
    select case
             when btrim(x) like 'อื่นๆ%' then 'other'
             else lower(btrim(x))
           end as t
    from unnest(string_to_array(coalesce(raw,''), ',')) as x
    where btrim(x) <> ''
  ) s
  where t in ('dog','cat','rabbit','bird','reptile','fish','hamster','turtle','other')
$$;

create or replace function ht_resolve_province(raw text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select a.province_code from ht_province_aliases a
      where a.alias = lower(btrim(coalesce(raw,'')))),
    (select p.code from ht_provinces p
      where lower(p.name_th) like lower(btrim(coalesce(raw,''))) || '%'
      order by length(p.name_th) limit 1)
  )
$$;

create or replace function ht_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function ht_ledger_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('ht.allow_ledger_update', true), 'off') = 'on'
     and tg_op = 'UPDATE'
     and new.id = old.id and new.points = old.points
     and new.member_id = old.member_id and new.kind = old.kind then
    return new;
  end if;
  raise exception 'ht_points_ledger is append-only (attempted %). Insert a correcting row instead.', tg_op;
end;
$$;

create or replace function ht_ledger_apply()
returns trigger language plpgsql set search_path = public as $$
begin
  update ht_members m
     set points_balance  = m.points_balance + new.points,
         points_lifetime = m.points_lifetime + greatest(new.points, 0)
   where m.id = new.member_id;

  update ht_members m
     set tier_code = t.code
    from (select code, min_lifetime_pts from ht_tiers where is_active) t
   where m.id = new.member_id
     and t.min_lifetime_pts <= m.points_lifetime
     and t.code is distinct from m.tier_code
     and t.min_lifetime_pts = (
       select max(t2.min_lifetime_pts) from ht_tiers t2
        where t2.is_active and t2.min_lifetime_pts <= m.points_lifetime);
  return new;
end;
$$;

create or replace function ht_rebuild_points_balances()
returns table (members_fixed bigint, total_balance bigint)
language plpgsql set search_path = public as $$
declare n bigint;
begin
  with agg as (
    select member_id,
           coalesce(sum(points), 0)::int                          as bal,
           coalesce(sum(points) filter (where points > 0), 0)::int as life
      from ht_points_ledger group by member_id
  )
  update ht_members m
     set points_balance  = coalesce(a.bal, 0),
         points_lifetime = coalesce(a.life, 0)
    from ht_members m2 left join agg a on a.member_id = m2.id
   where m.id = m2.id
     and (m.points_balance, m.points_lifetime)
         is distinct from (coalesce(a.bal, 0), coalesce(a.life, 0));
  get diagnostics n = row_count;
  return query select n, coalesce(sum(points_balance), 0)::bigint from ht_members;
end;
$$;

create or replace function ht_points_config_at(p_on date default current_date)
returns ht_points_config language sql stable set search_path = public as $$
  select c.* from ht_points_config c
  where c.effective_from <= p_on
    and (c.effective_to is null or c.effective_to > p_on)
  order by c.effective_from desc limit 1
$$;

create or replace function ht_consents_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'ht_member_consents is append-only. Insert a new row (e.g. granted=false) instead.';
end;
$$;
