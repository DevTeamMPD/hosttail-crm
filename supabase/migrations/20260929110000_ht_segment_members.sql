-- Hosttail CRM — manual customer groups. ADDITIVE ONLY.
-- Rollback: drop table ht_segment_members; alter table ht_segments drop column kind;
--
-- ht_segments gains a kind:
--   'filter'  (existing rows) -- a named /customers filter; membership is live.
--   'manual'  -- staff tick customers on /customers and add them by hand;
--               membership is the rows in ht_segment_members.

alter table ht_segments
  add column if not exists kind text not null default 'filter'
    check (kind in ('filter', 'manual'));

create table if not exists ht_segment_members (
  segment_id  uuid not null references ht_segments(id) on delete cascade,
  member_id   uuid not null references ht_members(id) on delete cascade,
  added_by    uuid,             -- ht_staff.id
  added_at    timestamptz not null default now(),
  primary key (segment_id, member_id)
);

create index if not exists ix_ht_segment_members_member on ht_segment_members (member_id);

alter table ht_segment_members enable row level security;
revoke all on ht_segment_members from anon;

create policy ht_staff_read_segment_members on ht_segment_members
  for select to authenticated using (ht_is_staff('viewer'));
create policy ht_marketing_write_segment_members on ht_segment_members
  for all to authenticated using (ht_is_staff('marketing')) with check (ht_is_staff('marketing'));
