-- Hosttail CRM — member identity. ADDITIVE ONLY.
-- Rollback: drop table ht_member_merges, ht_member_line_ids, ht_members cascade;

create table if not exists ht_members (
  id                uuid primary key default gen_random_uuid(),

  -- ── LINE identity ────────────────────────────────────────────────────────
  -- Real 'U'+32hex uid, verified server-side against LINE's own
  -- /oauth2/v2.1/verify endpoint. NEVER the legacy composite "<uid>_<orderId>"
  -- key -- that hack lived in the old Google Sheet only to force a new row
  -- per order; the real constraint we want is ht_warranty_registrations'
  -- unique (member_id, order_key), so it is no longer needed.
  line_uid          text unique
                      check (line_uid is null or line_uid ~ '^U[0-9a-f]{32}$'),
  line_display_name text,
  line_picture_url  text,
  line_followed     boolean not null default true, -- false after a LINE 'unfollow' webhook

  -- ── Contact ──────────────────────────────────────────────────────────────
  phone_raw         text,
  phone             text generated always as (ht_normalize_phone_th(phone_raw)) stored,

  -- ── Profile ──────────────────────────────────────────────────────────────
  full_name         text,
  province_code     text references ht_provinces(code),
  province_raw      text,                      -- what they actually typed (audit trail)
  pet_types         text[] not null default '{}',
  pet_other         text,                       -- free text from "อื่นๆ (เม่น)"
  note              text,

  -- ── Lifecycle ────────────────────────────────────────────────────────────
  status            text not null default 'active'
                       check (status in ('active','merged','blocked','deleted')),
  merged_into       uuid references ht_members(id) on delete set null,
  source            text not null default 'liff'
                       check (source in ('liff','legacy_sheet','manual','import')),

  -- ── Denormalised points cache (see ht_points.sql for how this is kept in sync) ──
  points_balance    integer not null default 0,
  points_lifetime   integer not null default 0,
  tier_code         text,                       -- FK added once ht_tiers exists

  registered_at     timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint ht_members_merged_chk
    check ((status = 'merged') = (merged_into is not null)),
  constraint ht_members_pet_chk
    check (pet_types <@ array['dog','cat','rabbit','bird','reptile',
                              'fish','hamster','turtle','other']::text[])
);

-- phone is deliberately NOT unique: households share numbers, and it is also
-- how the Facebook/LINE channel finds a member's own orders -- see the
-- ownership check documented on ht_warranty_registrations.declared_phone.
create index if not exists ix_ht_members_phone
  on ht_members (phone) where phone is not null;
create index if not exists ix_ht_members_province    on ht_members (province_code);
create index if not exists ix_ht_members_registered  on ht_members (registered_at);
create index if not exists ix_ht_members_tier        on ht_members (tier_code);
create index if not exists ix_ht_members_points      on ht_members (points_balance);
create index if not exists ix_ht_members_pets        on ht_members using gin (pet_types);
create index if not exists ix_ht_members_name_trgm
  on ht_members using gin (full_name gin_trgm_ops);

-- The hottest index once segmentation/broadcast exist: everything starts here.
create index if not exists ix_ht_members_active_followed
  on ht_members (id) where status = 'active' and line_followed;

create or replace function ht_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_ht_members_touch on ht_members;
create trigger trg_ht_members_touch
  before update on ht_members
  for each row execute function ht_touch_updated_at();

comment on column ht_members.phone is
  'Generated from phone_raw via ht_normalize_phone_th(). NULL = unusable/unparseable input.';
comment on column ht_members.points_balance is
  'Denormalised cache of sum(ht_points_ledger.points) for this member. '
  'Maintained by the trigger in ht_points.sql; ht_rebuild_points_balances() is the drift detector.';

-- ── Secondary LINE identifiers ──────────────────────────────────────────────
-- A member can re-register from a different LINE account (new phone, second
-- OA friend-add, etc). Keep a link table rather than widening ht_members.
create table if not exists ht_member_line_ids (
  member_id  uuid not null references ht_members(id) on delete cascade,
  line_uid   text not null check (line_uid ~ '^U[0-9a-f]{32}$'),
  is_primary boolean not null default false,
  linked_at  timestamptz not null default now(),
  primary key (line_uid)
);
create index if not exists ix_ht_member_line_ids_member on ht_member_line_ids (member_id);
create unique index if not exists ux_ht_member_line_primary
  on ht_member_line_ids (member_id) where is_primary;

-- ── Merge log ────────────────────────────────────────────────────────────────
-- Needed because the legacy sheet will produce duplicates and any merge must
-- be explainable and reversible.
create table if not exists ht_member_merges (
  id          uuid primary key default gen_random_uuid(),
  winner_id   uuid not null references ht_members(id) on delete cascade,
  loser_id    uuid not null references ht_members(id) on delete cascade,
  reason      text not null check (reason in ('line_uid','phone','manual','legacy_composite')),
  moved_rows  jsonb not null default '{}'::jsonb,   -- e.g. {"warranty":3,"points":5}
  merged_by   uuid,                                  -- auth.users.id, null = migration script
  merged_at   timestamptz not null default now(),
  check (winner_id <> loser_id)
);
create index if not exists ix_ht_member_merges_loser on ht_member_merges (loser_id);
