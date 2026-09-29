-- Hosttail CRM — marketing campaigns (LINE broadcast to a segment). ADDITIVE ONLY.
-- Rollback: drop view ht_v_campaign_stats, ht_v_campaign_link_stats;
--           drop function ht_record_campaign_click;
--           drop table ht_campaign_clicks, ht_campaign_recipients, ht_campaigns;
--           delete from storage.buckets where id = 'ht-campaign-media';
--
-- A campaign is up to 5 LINE message bubbles (text / image, like the LINE OA
-- Manager composer) sent to one ht_segments group.
--
-- Sending is one PUSH per recipient, not one multicast for everybody: each
-- recipient's copy carries their own tracked links (/c/<token>/<n>), which is
-- the only way to know WHO clicked. LINE bills push and multicast the same
-- (one message per recipient), so this costs nothing extra in quota.
--
-- "Who saw it" per person is NOT something LINE exposes to any bot -- there
-- is no read receipt for Messaging API messages. What LINE does give is an
-- aggregate count (unique impressions / clicks) per customAggregationUnit,
-- which every push of a campaign is tagged with; it is pulled into
-- ht_campaigns.insight on demand. LINE hides those numbers below 20 users.

create table if not exists ht_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(btrim(name)) between 1 and 120),
  segment_id         uuid references ht_segments(id) on delete set null,
  segment_name       text,          -- snapshot at send time; the group may be renamed/deleted later
  -- [{type:'text', text} | {type:'image', path, previewPath, width, height, linkUrl?}], 1..5
  messages           jsonb not null default '[]'::jsonb,
  status             text not null default 'draft'
                       check (status in ('draft','sending','sent')),
  dry_run            boolean not null default false,  -- ht_settings.broadcast.dry_run at send time
  aggregation_unit   text unique,   -- LINE customAggregationUnit, set when sending starts
  recipient_count    integer not null default 0,
  created_by         uuid,          -- ht_staff.id
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  sent_by            uuid,          -- ht_staff.id
  sending_started_at timestamptz,
  sent_at            timestamptz,
  insight            jsonb,         -- last response of LINE's aggregation insight API
  insight_fetched_at timestamptz
);
create index if not exists ix_ht_campaigns_created on ht_campaigns (created_at desc);

drop trigger if exists trg_ht_campaigns_touch on ht_campaigns;
create trigger trg_ht_campaigns_touch
  before update on ht_campaigns
  for each row execute function ht_touch_updated_at();

-- One row per member a campaign was addressed to, frozen when sending starts
-- (a filter segment is live, so "who was in it" must be captured then).
create table if not exists ht_campaign_recipients (
  id               uuid primary key default gen_random_uuid(),  -- also the LINE X-Line-Retry-Key
  campaign_id      uuid not null references ht_campaigns(id) on delete cascade,
  member_id        uuid not null references ht_members(id) on delete cascade,
  line_uid         text not null,
  token            text not null unique,   -- random, goes in the tracked link URL
  status           text not null default 'pending'
                     check (status in ('pending','sent','failed')),
  error            text,
  sent_at          timestamptz,
  click_count      integer not null default 0,
  first_clicked_at timestamptz,
  last_clicked_at  timestamptz,
  unique (campaign_id, member_id)
);
create index if not exists ix_ht_campaign_recipients_pending
  on ht_campaign_recipients (campaign_id) where status = 'pending';
create index if not exists ix_ht_campaign_recipients_member on ht_campaign_recipients (member_id);

-- Every click, for per-link stats. link_index is the order of the link in the
-- campaign (see src/lib/campaigns/messages.ts, campaignLinks()).
create table if not exists ht_campaign_clicks (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references ht_campaign_recipients(id) on delete cascade,
  campaign_id  uuid not null references ht_campaigns(id) on delete cascade,
  link_index   integer not null,
  url          text not null,
  user_agent   text,
  clicked_at   timestamptz not null default now()
);
create index if not exists ix_ht_campaign_clicks_campaign on ht_campaign_clicks (campaign_id, link_index);

-- Atomic click counter, called by the /c/<token>/<n> redirect route.
create or replace function ht_record_campaign_click(p_token text, p_link_index integer, p_url text, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r ht_campaign_recipients%rowtype;
begin
  update ht_campaign_recipients
     set click_count = click_count + 1,
         first_clicked_at = coalesce(first_clicked_at, now()),
         last_clicked_at = now()
   where token = p_token
  returning * into r;
  if not found then return; end if;
  insert into ht_campaign_clicks (recipient_id, campaign_id, link_index, url, user_agent)
  values (r.id, r.campaign_id, p_link_index, p_url, left(p_user_agent, 300));
end;
$$;
revoke all on function ht_record_campaign_click(text, integer, text, text) from public, anon, authenticated;
grant execute on function ht_record_campaign_click(text, integer, text, text) to service_role;

-- ── Stats views (security_invoker: the caller's RLS applies) ───────────────
create or replace view ht_v_campaign_stats with (security_invoker = true) as
select campaign_id,
       count(*)                                      as recipients,
       count(*) filter (where status = 'sent')       as sent,
       count(*) filter (where status = 'failed')     as failed,
       count(*) filter (where status = 'pending')    as pending,
       count(*) filter (where click_count > 0)       as clickers,
       coalesce(sum(click_count), 0)::integer        as clicks
from ht_campaign_recipients
group by campaign_id;

create or replace view ht_v_campaign_link_stats with (security_invoker = true) as
select campaign_id, link_index,
       count(*)                     as clicks,
       count(distinct recipient_id) as clickers
from ht_campaign_clicks
group by campaign_id, link_index;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Writes go through server actions using the service role (after
-- requireRole('marketing')); these policies are for the RLS-scoped reads.
alter table ht_campaigns enable row level security;
alter table ht_campaign_recipients enable row level security;
alter table ht_campaign_clicks enable row level security;
revoke all on ht_campaigns, ht_campaign_recipients, ht_campaign_clicks from anon;
revoke all on ht_v_campaign_stats, ht_v_campaign_link_stats from anon;

create policy ht_staff_read_campaigns on ht_campaigns
  for select to authenticated using (ht_is_staff('viewer'));
create policy ht_marketing_write_campaigns on ht_campaigns
  for all to authenticated using (ht_is_staff('marketing')) with check (ht_is_staff('marketing'));
create policy ht_staff_read_campaign_recipients on ht_campaign_recipients
  for select to authenticated using (ht_is_staff('viewer'));
create policy ht_staff_read_campaign_clicks on ht_campaign_clicks
  for select to authenticated using (ht_is_staff('viewer'));

-- ── Image storage ───────────────────────────────────────────────────────────
-- PUBLIC on purpose, unlike ht-receipts: LINE's servers and every recipient's
-- app fetch the image by plain URL, so it cannot sit behind a signed link
-- that expires. Only marketing artwork goes here. Uploads use a signed
-- upload URL minted by a server action (key chosen server-side).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ht-campaign-media', 'ht-campaign-media', true, 10485760, array['image/jpeg','image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 10485760,
      allowed_mime_types = excluded.allowed_mime_types;
