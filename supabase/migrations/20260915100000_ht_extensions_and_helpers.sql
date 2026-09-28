-- Hosttail CRM — extensions + helper functions. ADDITIVE ONLY.
-- Touches nothing outside ht_* / functions prefixed ht_.
-- Rollback: drop function ht_normalize_phone_th, ht_norm_order_key, ht_pet_tokens;
--           drop extension if the whole project is being torn down (unlikely — shared).

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "pg_trgm";   -- ilike search on member name/province

-- ── Thai phone canonicaliser ────────────────────────────────────────────────
-- Mirrors src/lib/phone.ts normalizePhoneTh() exactly. IMMUTABLE so it can
-- back a generated column.
--   081-234-5678 -> 0812345678
--   0812345678   -> 0812345678
--   +66812345678 -> 0812345678
--   0066812345678-> 0812345678
--   ******60     -> NULL  (masked — order_tracking on Shopee)
--   anything else-> NULL
--
-- Deliberately does NOT guess a missing leading zero on a bare 9-digit
-- string. That repair is legacy-migration-only (see scripts/import-legacy.ts
-- recoverLegacySheetPhone) — applying it generally would silently "fix" a
-- genuinely mistyped live phone number, which matters here because the
-- Facebook/LINE channel uses this function to resolve orders by phone.
create or replace function ht_normalize_phone_th(raw text)
returns text language plpgsql immutable as $$
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
  if    d ~ '^0[689][0-9]{8}$' then return d;   -- mobile
  elsif d ~ '^0[2-7][0-9]{7}$' then return d;   -- landline
  end if;
  return null;
end;
$$;

-- ── Marketplace order-reference canonicaliser ───────────────────────────────
-- Mirrors src/lib/orders/normalize.ts normalizeOrderKey() exactly.
-- Strips whitespace/zero-width chars, a leading '#', interior spaces/dashes;
-- uppercases. Never strips leading zeros — order ids are strings, not numbers.
create or replace function ht_norm_order_key(raw text)
returns text language sql immutable as $$
  select nullif(
    upper(regexp_replace(
      regexp_replace(
        regexp_replace(btrim(coalesce(raw,'')), '[​‌‍﻿]', '', 'g'),
        '^#+\s*', ''),
      '[\s\-]', '', 'g')),
    '')
$$;

-- ── Pet-type tokeniser ──────────────────────────────────────────────────────
-- Legacy sheet stores "dog, cat, อื่นๆ (เม่น)". Returns the canonical keys
-- only; the free text inside parentheses is extracted separately.
create or replace function ht_pet_tokens(raw text)
returns text[] language sql immutable as $$
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

comment on function ht_normalize_phone_th(text) is
  'Hosttail CRM: canonical Thai phone. Mirror of src/lib/phone.ts normalizePhoneTh() — keep in sync.';
comment on function ht_norm_order_key(text) is
  'Hosttail CRM: canonical order reference key. Mirror of src/lib/orders/normalize.ts normalizeOrderKey() — keep in sync.';
