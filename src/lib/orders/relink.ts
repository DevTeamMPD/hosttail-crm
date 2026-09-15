import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { normalizePhoneTh } from '@/lib/phone'

type Client = SupabaseClient<Database>
type Member = Database['public']['Tables']['ht_members']['Row']

export type RelinkResult =
  | { status: 'merged'; member: Member }
  | { status: 'not_found' }

/**
 * Standalone "check for an existing account" flow, separate from
 * submitRegistration() -- lets a legacy member re-link their history by
 * phone alone, without also having to place a new order in the same
 * request. Added because the 72 real legacy members (see ht_merge_members
 * in the 20260915101500 migration for why their old line_uid is dead) may
 * open the new LIFF app just to check their old points/warranty, with
 * nothing new to register right now.
 *
 * ⚠️ SECURITY TRADE-OFF, stated plainly: this treats "knows the phone
 * number on file" as sufficient proof of identity. That is weaker than the
 * order-submission path, where a phone/order match is corroborated by a
 * real purchase in sales_transaction/order_tracking. A phone number is
 * guessable/knowable by someone other than its owner, so this endpoint is
 * rate-limited hard (see the route handler) and every attempt -- matched or
 * not -- should be auditable. What's at stake if abused is limited to
 * warranty coverage visibility and a points balance (not a cash-out path),
 * which is why this was accepted as a v1 trade-off rather than building
 * OTP verification up front. Revisit if it's ever actually abused.
 */
export async function relinkLegacyMember(
  supabase: Client,
  memberId: string,
  rawPhone: string
): Promise<RelinkResult> {
  const phone = normalizePhoneTh(rawPhone)
  if (!phone) return { status: 'not_found' }

  const { data: legacy } = await supabase
    .from('ht_members')
    .select('id, full_name, province_code, province_raw, pet_types, pet_other, note')
    .eq('phone', phone)
    .eq('source', 'legacy_sheet')
    .eq('status', 'active')
    .neq('id', memberId)
    .limit(1)
    .maybeSingle()

  if (!legacy) return { status: 'not_found' }

  const { error: mergeErr } = await supabase.rpc('ht_merge_members', {
    p_winner: memberId,
    p_loser: legacy.id,
    p_reason: 'legacy_composite',
  })
  if (mergeErr) throw new Error(`relink merge failed: ${mergeErr.message}`)

  // ht_merge_members() deliberately does not touch profile fields (it must
  // stay safe to call from submitRegistration(), where the winner's fields
  // were just set from what the customer typed THIS request and must not
  // be clobbered by older data). Here the winner is a fresh session with no
  // profile yet, so backfill from the now-merged legacy row -- but still
  // only into fields that are actually empty, in case this is somehow
  // called on a partially-filled member.
  const { data: winner } = await supabase.from('ht_members').select('*').eq('id', memberId).single()
  if (!winner) throw new Error('winner member vanished mid-relink')

  const patch: Partial<Member> = {}
  if (!winner.full_name && legacy.full_name) patch.full_name = legacy.full_name
  if (!winner.province_code && legacy.province_code) patch.province_code = legacy.province_code
  if (!winner.province_code && legacy.province_raw) patch.province_raw = legacy.province_raw
  if ((!winner.pet_types || winner.pet_types.length === 0) && legacy.pet_types?.length) {
    patch.pet_types = legacy.pet_types
  }
  if (!winner.pet_other && legacy.pet_other) patch.pet_other = legacy.pet_other
  if (!winner.note && legacy.note) patch.note = legacy.note
  // phone_raw/phone are already set to what the customer just typed (that's
  // how the match was found in the first place) -- never overwritten here.

  let finalMember = winner
  if (Object.keys(patch).length > 0) {
    const { data: updated, error: patchErr } = await supabase
      .from('ht_members')
      .update(patch)
      .eq('id', memberId)
      .select()
      .single()
    if (patchErr) throw new Error(`relink profile backfill failed: ${patchErr.message}`)
    finalMember = updated
  }

  return { status: 'merged', member: finalMember }
}
