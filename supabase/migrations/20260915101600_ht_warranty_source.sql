-- Hosttail CRM — track provenance on warranty registrations + exempt
-- legacy-imported offline claims from the receipt requirement. ADDITIVE ONLY.
-- Rollback: alter table ht_warranty_registrations drop column source;
--           (constraint reverts automatically when the column backing it is dropped)
--
-- Why: ht_members already has `source` (liff/legacy_sheet/manual/import) but
-- ht_warranty_registrations never got the same column. The migration script
-- (scripts/import-legacy.ts) needs it for two reasons: (1) so the dashboard
-- can later show "imported from legacy sheet" on old rows, and (2) more
-- urgently, to exempt legacy 'receipt'/'homepro'/'makropro' rows from
-- ht_warranty_receipt_chk. Those 23 legacy rows genuinely have no receipt
-- photo on file -- the legacy page told customers to attach one but never
-- actually built the upload (see the Phase 0 audit) -- so requiring one to
-- satisfy the constraint is impossible for real historical data. Every LIVE
-- submission (source='liff') still strictly requires a receipt; only
-- source='legacy_sheet' rows are exempt, and only because the gap is
-- permanent and already known, not because the rule is being loosened.

alter table ht_warranty_registrations
  add column if not exists source text not null default 'liff'
    check (source in ('liff', 'legacy_sheet', 'manual'));

alter table ht_warranty_registrations
  drop constraint if exists ht_warranty_receipt_chk;

alter table ht_warranty_registrations
  add constraint ht_warranty_receipt_chk
  check (not requires_receipt or receipt_path is not null or source = 'legacy_sheet');

create index if not exists ix_ht_warranty_source on ht_warranty_registrations (source);
