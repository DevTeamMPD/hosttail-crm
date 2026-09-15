-- Hosttail CRM — receipt photo storage. ADDITIVE ONLY.
-- Rollback: drop policy ... on storage.objects (per policy below);
--           delete from storage.buckets where id = 'ht-receipts';
--
-- Private bucket. Customers never talk to Storage directly for writes: the
-- LIFF route handler mints a short-lived signed UPLOAD url via the service
-- role, choosing the object key itself (<member_id>/<uuid>.<ext>) so a
-- client can never write outside its own prefix. The dashboard reads via a
-- short-lived signed URL minted server-side per render -- never
-- getPublicUrl(), because a receipt photo commonly contains a name, address,
-- and partial card/account numbers.
--
-- Server-side upload (instead of a signed URL) was considered and rejected:
-- Vercel serverless functions cap request bodies at 4.5 MB, and a modern
-- phone photo is routinely 3-8 MB -- server-side upload would silently fail
-- on a meaningful fraction of real receipts, the same class of bug the
-- legacy page already had (it promised a receipt upload that was never
-- built at all).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ht-receipts', 'ht-receipts', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = excluded.allowed_mime_types;

-- Staff (viewer+) may view receipts in the approvals queue and customer drawer.
create policy ht_receipts_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'ht-receipts' and ht_is_staff('viewer'));

-- Only admins can remove a receipt (PDPA retention cleanup).
create policy ht_receipts_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'ht-receipts' and ht_current_staff_role() = 'admin');

-- No insert/update policy for `authenticated` or `anon`: every upload goes
-- through a service-role-minted signed upload URL, which bypasses RLS by
-- design (the service role does).
