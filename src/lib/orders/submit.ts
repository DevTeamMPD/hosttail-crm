import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { SubmitRegistrationInput } from './schema'
import { resolveByOrderRef, resolveByPhone, type ResolveOutcome } from './resolve'
import { normalizePhoneTh } from '@/lib/phone'
import { channelMeta } from '@/lib/brand'
import { getWarrantySettings } from '@/lib/settings'

type Client = SupabaseClient<Database>

export interface SubmitResult {
  registrationId: string
  status: 'active' | 'pending'
  linkStatus: string
  message: string
}

export class SubmitError extends Error {
  code: string
  status: number
  constructor(code: string, status: number, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay() // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

/**
 * One combined submission -- matches how the legacy page actually worked
 * (profile + order + terms in a single "register_warranty" payload), which
 * is simpler for the customer than separate API calls, and safe to resend
 * on every order since the profile fields are upserted idempotently.
 *
 * `memberId` MUST come from a verified LINE session (readLiffSession), never
 * from the request body -- see src/lib/liff/session.ts.
 */
export async function submitRegistration(
  supabase: Client,
  memberId: string,
  input: SubmitRegistrationInput
): Promise<SubmitResult> {
  const meta = channelMeta(input.channel)
  const phone = normalizePhoneTh(input.phone)
  if (!phone) throw new SubmitError('invalid_phone', 400, 'เบอร์โทรศัพท์ไม่ถูกต้อง')

  // Phone-channel ownership check: the order-lookup phone MUST equal the
  // member's own contact phone submitted in this same request. A phone
  // number is not a secret the way an order id is -- without this check,
  // anyone who knows a customer's number could claim their orders and
  // points. See resolve.ts for the full rationale.
  if (meta.refKind === 'phone') {
    const orderPhone = normalizePhoneTh(input.orderRef)
    if (!orderPhone || orderPhone !== phone) {
      throw new SubmitError(
        'phone_mismatch',
        403,
        'เบอร์โทรที่ใช้สั่งซื้อต้องตรงกับเบอร์โทรศัพท์ที่ลงทะเบียนไว้เท่านั้น'
      )
    }
  }

  if (meta.requiresReceipt && !input.receiptObjectKey) {
    throw new SubmitError('receipt_required', 422, 'กรุณาแนบรูปใบเสร็จ')
  }

  const warranty = await getWarrantySettings(supabase)

  // 1. Upsert profile fields.
  const { error: memberErr } = await supabase
    .from('ht_members')
    .update({
      full_name: input.fullName,
      phone_raw: input.phone,
      province_code: input.provinceCode,
      province_raw: input.provinceCode,
      pet_types: input.petTypes,
      pet_other: input.petTypes.includes('other') ? (input.petOther ?? null) : null,
      note: input.note ?? null,
    })
    .eq('id', memberId)
  if (memberErr) {
    if (memberErr.code === '23503') throw new SubmitError('invalid_province', 400, 'จังหวัดไม่ถูกต้อง')
    throw new SubmitError('profile_update_failed', 500, memberErr.message)
  }

  // 1b. Re-link a legacy member by phone. The 72 real members imported from
  // the old Google Sheet were registered under a LINE Login channel that
  // turned out to belong to a different LINE Developers PROVIDER than the
  // org-owned one this app now uses -- LINE user IDs are scoped per
  // provider, so their old line_uid can never appear again. The first time
  // one of them opens the new LIFF app, POST /api/liff/session mints them a
  // brand-new, historyless ht_members row (their old line_uid was never
  // seen before under the new provider). The moment they type in the same
  // phone number here, merge that dead legacy row's warranty/points history
  // into this live one. See ht_merge_members() for exactly what does and
  // does not get moved (the points ledger itself is append-only and never
  // touched -- only the net balance carries forward as one new entry).
  const { data: legacyDupe } = await supabase
    .from('ht_members')
    .select('id')
    .eq('phone', phone)
    .eq('source', 'legacy_sheet')
    .eq('status', 'active')
    .neq('id', memberId)
    .limit(1)
    .maybeSingle()

  if (legacyDupe) {
    const { error: mergeErr } = await supabase.rpc('ht_merge_members', {
      p_winner: memberId,
      p_loser: legacyDupe.id,
      p_reason: 'legacy_composite',
    })
    if (mergeErr) console.error('[submitRegistration] legacy merge failed', mergeErr.message)
    // Not fatal -- worst case the customer keeps two rows and an admin
    // merges them by hand later (ht_member_merges/manual dashboard action).
  }

  // 2. Record consent -- idempotent (only inserted once per current document
  // version), and against BOTH 'terms' and 'pdpa' from the single checkbox
  // the form shows: the legacy page only ever asked about warranty terms
  // and never recorded PDPA consent at all. See ht_consent.sql.
  const { data: currentDoc } = await supabase
    .from('ht_consent_documents')
    .select('id')
    .eq('kind', 'terms')
    .eq('locale', 'th')
    .eq('is_current', true)
    .maybeSingle()

  if (currentDoc) {
    const { data: existing } = await supabase
      .from('ht_member_consents')
      .select('id')
      .eq('member_id', memberId)
      .eq('document_id', currentDoc.id)
      .eq('granted', true)
      .limit(1)
      .maybeSingle()

    if (!existing) {
      await supabase.from('ht_member_consents').insert([
        { member_id: memberId, document_id: currentDoc.id, kind: 'terms', granted: true, source: 'liff' },
        { member_id: memberId, document_id: currentDoc.id, kind: 'pdpa', granted: true, source: 'liff' },
      ])
    }
  }

  // 3. Create the registration row.
  const submittedAt = new Date()
  const { data: reg, error: regErr } = await supabase
    .from('ht_warranty_registrations')
    .insert({
      member_id: memberId,
      channel: input.channel,
      order_ref_kind: meta.refKind,
      order_ref_raw: input.orderRef,
      requires_receipt: meta.requiresReceipt,
      receipt_path: input.receiptObjectKey ?? null,
      sla_due_at: addBusinessDays(submittedAt, warranty.review_sla_business_days).toISOString(),
      submitted_at: submittedAt.toISOString(),
    })
    .select()
    .single()

  if (regErr) {
    if (regErr.code === '23505') {
      throw new SubmitError('order_already_claimed', 409, 'ออเดอร์นี้เคยลงทะเบียนไว้แล้ว')
    }
    throw new SubmitError('registration_failed', 500, regErr.message)
  }

  // 4. Offline channels ALWAYS go to the review queue -- never auto-approve,
  // per the confirmed business rule (auto-match may still run to help the
  // admin, but points/warranty only activate once an admin approves).
  if (meta.requiresReceipt) {
    return {
      registrationId: reg.id,
      status: 'pending',
      linkStatus: 'pending_review',
      message: `ได้รับเรื่องแล้ว ทีมงานจะตรวจสอบภายใน ${warranty.review_sla_business_days} วันทำการ`,
    }
  }

  // 5. Try to auto-resolve. A phone-kind reference can match SEVERAL
  // distinct historical orders (a phone isn't a per-purchase reference the
  // way an order id is) -- only a single clean match auto-activates; any
  // ambiguity or non-match leaves the registration pending for the review
  // queue, never silently dropped.
  let outcome: ResolveOutcome | null = null
  let candidates: ResolveOutcome[] = []

  if (meta.refKind === 'order_id') {
    outcome = await resolveByOrderRef(supabase, input.orderRef)
  } else {
    candidates = await resolveByPhone(supabase, input.orderRef)
    const matched = candidates.filter((c) => c.status === 'matched')
    outcome = matched.length === 1 ? matched[0] : null
  }

  if (outcome && outcome.status === 'matched') {
    const items = outcome.lines.map((l) => ({
      sku: l.sku,
      product_name: l.product_name,
      quantity: l.quantity ?? 1,
    }))
    const { error: finalizeErr } = await supabase.rpc('ht_finalize_registration', {
      p_registration_id: reg.id,
      p_matched_order_no: outcome.orderNo,
      p_order_amount: outcome.netAmount,
      p_items: items,
    })
    if (finalizeErr) throw new SubmitError('finalize_failed', 500, finalizeErr.message)

    return {
      registrationId: reg.id,
      status: 'active',
      linkStatus: 'auto_matched',
      message: 'ลงทะเบียนรับประกันสำเร็จ',
    }
  }

  const linkStatus =
    outcome?.status === 'cancelled'
      ? 'not_found'
      : (outcome?.status === 'ambiguous' || candidates.some((c) => c.status === 'matched'))
        ? 'needs_info'
        : 'pending_review'

  await supabase
    .from('ht_warranty_registrations')
    .update({
      link_status: linkStatus,
      // Snapshot as plain JSON -- these are hints for the admin queue, never
      // read back as live typed objects, so erasing to Json here is correct,
      // not just a type-checker workaround.
      auto_match_candidates: JSON.parse(
        JSON.stringify(candidates.length ? candidates : outcome ? [outcome] : [])
      ),
    })
    .eq('id', reg.id)

  return {
    registrationId: reg.id,
    status: 'pending',
    linkStatus,
    message: `อยู่ระหว่างตรวจสอบ ทีมงานจะดำเนินการภายใน ${warranty.review_sla_business_days} วันทำการ`,
  }
}
