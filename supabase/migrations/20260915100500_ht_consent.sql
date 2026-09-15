-- Hosttail CRM — terms/PDPA consent records. ADDITIVE ONLY, append-only by design.
-- Rollback: drop view ht_v_member_consent; drop table ht_member_consents, ht_consent_documents cascade;
--
-- Why this exists: the legacy form required a "ยอมรับเงื่อนไขการรับประกัน"
-- checkbox but never persisted the acceptance -- termsAccepted only gated the
-- client-side submit button (index.html:710-717) and was never part of the
-- payload sent to the backend. There is no server-side record that any of
-- the 93 legacy members ever agreed to anything, and no PDPA/marketing
-- consent was ever collected at all. This table fixes both gaps going
-- forward; it does NOT retroactively fabricate consent for legacy rows (see
-- the migration script notes once written).

create table if not exists ht_consent_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('terms','pdpa','marketing')),
  version      text not null,
  locale       text not null default 'th',
  body_md      text not null,
  published_at timestamptz not null default now(),
  is_current   boolean not null default false,
  unique (kind, version, locale)
);
create unique index if not exists ux_ht_consent_doc_current
  on ht_consent_documents (kind, locale) where is_current;

-- A withdrawal is a new row with granted=false, never an update or delete.
create table if not exists ht_member_consents (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references ht_members(id) on delete cascade,
  document_id uuid not null references ht_consent_documents(id),
  kind        text not null check (kind in ('terms','pdpa','marketing')),
  granted     boolean not null,
  source      text not null default 'liff'
                check (source in ('liff','dashboard','import','line_unfollow')),
  ip_hash     text,       -- sha256(ip + app-level salt), never the raw IP
  user_agent  text,
  recorded_at timestamptz not null default now()
);
create index if not exists ix_ht_consents_member on ht_member_consents (member_id, kind, recorded_at desc);

create or replace function ht_consents_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'ht_member_consents is append-only. Insert a new row (e.g. granted=false) instead.';
end;
$$;
drop trigger if exists trg_ht_consents_immutable on ht_member_consents;
create trigger trg_ht_consents_immutable
  before update or delete on ht_member_consents
  for each row execute function ht_consents_immutable();

-- Current effective consent state per member/kind -- what the broadcast
-- sender and the review queue actually check.
create or replace view ht_v_member_consent with (security_invoker = true) as
select distinct on (member_id, kind)
       member_id, kind, granted, recorded_at
from ht_member_consents
order by member_id, kind, recorded_at desc;
