import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { normalizePhoneTh } from '@/lib/phone'

type Client = SupabaseClient<Database>

export type RelinkResult =
  | { status: 'queued'; requestId: string }
  /** An identical claim is already waiting for review -- resubmitting is a no-op. */
  | { status: 'already_pending'; requestId: string }
  | { status: 'not_found' }

/**
 * "I was already a member" -- files a claim on a legacy account for an admin
 * to approve. It does NOT merge anything.
 *
 * Why it used to merge on the spot and no longer does: the only evidence here
 * is that the claimant typed a phone number that exists in our records, which
 * is not proof of ownership -- Thai mobile numbers are guessable and widely
 * shared. On 2026-09-15 that was demonstrated live in production: a developer
 * testing the button absorbed a real customer's account, along with (via the
 * platform-account backfill) that customer's Shopee account, which would have
 * diverted their future orders. See the 20260915103000 migration.
 *
 * What is captured instead is evidence for a human: the legacy row's own
 * details, plus any corroboration we can find automatically. The strongest
 * one available is that order_tracking's LINE OA rows carry buyer_account_no
 * values that ARE line_uids from our provider, so if the claimant's own
 * verified line_uid appears next to the phone being claimed, that is proof
 * from LINE rather than from the claimant.
 */
export async function createRelinkRequest(
  supabase: Client,
  claimantMemberId: string,
  claimantLineUid: string,
  rawPhone: string
): Promise<RelinkResult> {
  const phone = normalizePhoneTh(rawPhone)
  if (!phone) return { status: 'not_found' }

  // A test account claiming a real person's history would put a decision in
  // front of an admin that should never have been asked. Answer exactly as if
  // the phone were unknown, so testing this screen stays possible.
  const { data: claimant } = await supabase
    .from('ht_members')
    .select('is_test')
    .eq('id', claimantMemberId)
    .limit(1)
    .maybeSingle()
  if (claimant?.is_test) return { status: 'not_found' }

  const { data: legacy } = await supabase
    .from('ht_members')
    .select('id, full_name, points_balance, registered_at')
    .eq('phone', phone)
    .eq('source', 'legacy_sheet')
    .eq('status', 'active')
    .neq('id', claimantMemberId)
    .limit(1)
    .maybeSingle()

  if (!legacy) return { status: 'not_found' }

  const { data: existing } = await supabase
    .from('ht_relink_requests')
    .select('id')
    .eq('claimant_member_id', claimantMemberId)
    .eq('legacy_member_id', legacy.id)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()
  if (existing) return { status: 'already_pending', requestId: existing.id }

  const evidence = await gatherEvidence(supabase, claimantLineUid, phone, legacy.id)

  const { data: request, error } = await supabase
    .from('ht_relink_requests')
    .insert({
      claimant_member_id: claimantMemberId,
      legacy_member_id: legacy.id,
      claimed_phone: phone,
      origin: 'relink_button',
      evidence: {
        ...evidence,
        legacy_name: legacy.full_name,
        legacy_points: legacy.points_balance,
        legacy_registered_at: legacy.registered_at,
      },
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = a concurrent identical claim won the race on ux_ht_relink_open.
    if (error.code === '23505') {
      const { data: winner } = await supabase
        .from('ht_relink_requests')
        .select('id')
        .eq('claimant_member_id', claimantMemberId)
        .eq('legacy_member_id', legacy.id)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle()
      if (winner) return { status: 'already_pending', requestId: winner.id }
    }
    throw new Error(`relink request insert failed: ${error.message}`)
  }

  return { status: 'queued', requestId: request.id }
}

/** Facts a reviewer would otherwise have to dig for by hand. Never throws -- weaker evidence beats a failed request. */
async function gatherEvidence(
  supabase: Client,
  claimantLineUid: string,
  phone: string,
  legacyMemberId: string
): Promise<Record<string, unknown>> {
  const evidence: Record<string, unknown> = { phone_matched: true }

  try {
    // LINE OA orders store the buyer's line_uid in buyer_account_no. If the
    // claimant's own verified uid sits on a row carrying this phone, LINE
    // itself is vouching for the link.
    const { data: loa } = await supabase
      .from('order_tracking')
      .select('online_order, phone, shop')
      .eq('buyer_account_no', claimantLineUid)
      .limit(50)
    const uidRows = loa ?? []
    evidence.claimant_uid_seen_in_order_tracking = uidRows.length > 0
    evidence.claimant_uid_phone_matches_claim = uidRows.some((r) => normalizePhoneTh(r.phone) === phone)

    const { count: regCount } = await supabase
      .from('ht_warranty_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', legacyMemberId)
    evidence.legacy_registration_count = regCount ?? 0

    // Someone else already claiming the same legacy account is the single
    // most important thing for a reviewer to see.
    const { count: rivalCount } = await supabase
      .from('ht_relink_requests')
      .select('*', { count: 'exact', head: true })
      .eq('legacy_member_id', legacyMemberId)
      .eq('status', 'pending')
    evidence.other_pending_claims = rivalCount ?? 0
  } catch (err) {
    evidence.evidence_error = err instanceof Error ? err.message : String(err)
  }

  return evidence
}
