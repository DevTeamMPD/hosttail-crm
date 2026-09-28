-- Hosttail CRM — add the 'event' channel: brand receipts from trade shows
-- (Event Pet Expo, Event BBB, ...). Those sales live in sales_transaction under
-- project 'Head-Office' with customer_group1 = 'Event'; the receipt number is
-- order_no ('9015YYYYMMDD-NNNN') and bill_no is a 6-digit number.
-- Rollback: re-create the constraint without 'event' (fails if any row uses it).
alter table ht_warranty_registrations
  drop constraint if exists ht_warranty_registrations_channel_check;

alter table ht_warranty_registrations
  add constraint ht_warranty_registrations_channel_check check (
    channel = any (array[
      'shopee', 'lazada', 'tiktok', 'facebook', 'line',
      'homepro', 'makropro', 'receipt', 'event'
    ])
  );
