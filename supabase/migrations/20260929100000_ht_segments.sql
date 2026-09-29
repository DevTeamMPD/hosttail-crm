-- Hosttail CRM — saved customer segments. ADDITIVE ONLY.
-- Rollback: drop table ht_segments;
--
-- A segment is a NAMED FILTER, not a stored member list: `filters` holds the
-- same keys the /customers URL uses (pet, petmode, prov, source), so a
-- segment always reflects the members who match it right now -- a new member
-- who is a dog owner in Bangkok joins "สุนัข + กรุงเทพ" automatically.

create table if not exists ht_segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  filters     jsonb not null default '{}'::jsonb,
  created_by  uuid,             -- ht_staff.id
  created_at  timestamptz not null default now()
);

create unique index if not exists ux_ht_segments_name on ht_segments (lower(btrim(name)));

alter table ht_segments enable row level security;
revoke all on ht_segments from anon;

create policy ht_staff_read_segments on ht_segments
  for select to authenticated using (ht_is_staff('viewer'));
create policy ht_marketing_write_segments on ht_segments
  for all to authenticated using (ht_is_staff('marketing')) with check (ht_is_staff('marketing'));
