import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { normalizeOrderKey } from './normalize'
import { normalizePhoneTh } from '@/lib/phone'

// No `import 'server-only'` for the same reason as resolve.ts: this module
// takes its Supabase client as a parameter and touches no env secret, so the
// backfill script can reuse it verbatim under plain tsx.

type Client = SupabaseClient<Database>

export type BindOutcome =
  /** A new binding was created. */
  | { status: 'bound'; shop: string; accountNo: string; accountName: string | null }
  /** This member already owns this account -- nothing to do. */
  | { status: 'already_bound'; shop: string; accountNo: string }
  /** Another member owns it. Never steal it; surface for an admin instead. */
  | { status: 'claimed_by_other'; shop: string; accountNo: string; ownerMemberId: string }
  /** No order_tracking row behind this reference (offline receipt, typo, not yet ETL'd). */
  | { status: 'not_found' }
  /** Found rows, but they point at more than one account -- a human must decide. */
  | { status: 'ambiguous'; reason: string }
  /** The account value itself is not a usable identity (data-entry template junk). */
  | { status: 'rejected'; reason: string }

/**
 * Only the per-platform storefronts. 'Agent Hosttail' (B2B, 6 rows, zero
 * account numbers) is excluded by the underscore, which is exactly the
 * distinction in the data.
 */
const BINDABLE_SHOP = /^[A-Za-z]+_hosttail$/

/**
 * Mirrors ht_mpa_account_shape_chk in the 20260915102000 migration. Kept in
 * both places on purpose: the DB constraint is the guarantee, this one is so
 * we can refuse with a reason instead of catching a constraint violation.
 */
export function isBindableAccountShape(accountNo: string): boolean {
  if (accountNo.length < 4 || accountNo.length > 64) return false
  // Printable ASCII, no spaces. Every real id observed is digits (SH/FB/TT/
  // LA/Web) or 'U'+32 hex (LOA); Thai text or a space means someone typed a
  // name or address into the field, e.g. 'ชื่อ__0999999999'.
  if (!/^[\x21-\x7E]+$/.test(accountNo)) return false
  if (/^(.)\1+$/.test(accountNo)) return false
  return true
}

interface BindInput {
  /** Order references to look up in order_tracking.online_order, most specific first. */
  orderRefs: (string | null | undefined)[]
  /** Facebook/LINE fallback: the phone the order was placed with. Only ever the member's own. */
  phone?: string | null
  registrationId?: string | null
  boundVia: 'registration' | 'backfill' | 'admin'
  /** Run every check and report the outcome, but skip the INSERT. For the backfill script's dry run. */
  dryRun?: boolean
}

/**
 * Binds `memberId` to the platform buyer account behind one of their orders,
 * so later purchases from that account can be attributed without the customer
 * entering anything.
 *
 * Callers MUST only reach here for an order that actually verified (matched in
 * sales_transaction, or admin-approved). A binding is worth more than the
 * single order that created it -- it claims every future order on that account
 * -- so it must never be granted on an unverified reference.
 *
 * Never throws: binding is an enhancement, and a failure here must not fail
 * the order submission that triggered it.
 */
export async function bindPlatformAccount(
  supabase: Client,
  memberId: string,
  input: BindInput
): Promise<BindOutcome> {
  const candidates = await findTrackingAccounts(supabase, input)
  if (candidates.status !== 'ok') return candidates.outcome

  const { shop, accountNo, accountName } = candidates

  if (!BINDABLE_SHOP.test(shop)) return { status: 'rejected', reason: `shop_not_bindable:${shop}` }
  if (!isBindableAccountShape(accountNo)) return { status: 'rejected', reason: 'account_shape' }

  // Data-dependent checks the DB constraint cannot make. The template values
  // ('ชื่อ__0999999999') show up under as many as four shops at once; a real
  // platform account id belongs to exactly one storefront.
  const { data: acctRows, error: acctErr } = await supabase
    .from('order_tracking')
    .select('shop, buyer_name')
    .eq('buyer_account_no', accountNo)
    .limit(500)
  if (acctErr) return { status: 'rejected', reason: `lookup_failed:${acctErr.message}` }

  const shops = new Set((acctRows ?? []).map((r) => r.shop).filter(Boolean))
  if (shops.size > 1) return { status: 'rejected', reason: 'account_spans_multiple_shops' }

  // A name equal to the account number is the ETL's "no name" fallback (831
  // rows), not a second person -- ignore those when counting identities.
  const names = new Set(
    (acctRows ?? [])
      .map((r) => (r.buyer_name ?? '').trim())
      .filter((n) => n && n !== accountNo)
  )
  if (names.size > 1) return { status: 'ambiguous', reason: 'multiple_buyer_names' }

  const { data: existing, error: existingErr } = await supabase
    .from('ht_member_platform_accounts')
    .select('id, member_id')
    .eq('shop', shop)
    .eq('account_no', accountNo)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (existingErr) return { status: 'rejected', reason: `claim_check_failed:${existingErr.message}` }

  if (existing) {
    return existing.member_id === memberId
      ? { status: 'already_bound', shop, accountNo }
      : { status: 'claimed_by_other', shop, accountNo, ownerMemberId: existing.member_id }
  }

  if (input.dryRun) return { status: 'bound', shop, accountNo, accountName }

  const { error: insertErr } = await supabase.from('ht_member_platform_accounts').insert({
    member_id: memberId,
    shop,
    account_no: accountNo,
    account_name: accountName,
    bound_via: input.boundVia,
    source_registration_id: input.registrationId ?? null,
  })

  if (insertErr) {
    // 23505 = another request won the race on ux_ht_mpa_account. Re-read to
    // report who actually owns it rather than guessing.
    if (insertErr.code === '23505') {
      const { data: winner } = await supabase
        .from('ht_member_platform_accounts')
        .select('member_id')
        .eq('shop', shop)
        .eq('account_no', accountNo)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (winner?.member_id === memberId) return { status: 'already_bound', shop, accountNo }
      return { status: 'claimed_by_other', shop, accountNo, ownerMemberId: winner?.member_id ?? 'unknown' }
    }
    return { status: 'rejected', reason: `insert_failed:${insertErr.message}` }
  }

  return { status: 'bound', shop, accountNo, accountName }
}

type FindResult =
  | { status: 'ok'; shop: string; accountNo: string; accountName: string | null }
  | { status: 'no'; outcome: BindOutcome }

/** Resolves order references (or a phone, for Facebook/LINE) to exactly one buyer account. */
async function findTrackingAccounts(supabase: Client, input: BindInput): Promise<FindResult> {
  const refs = [
    ...new Set(
      input.orderRefs
        .flatMap((r) => [r?.toString().trim(), normalizeOrderKey(r)])
        .filter((r): r is string => Boolean(r))
    ),
  ]

  let rows: { shop: string | null; buyer_account_no: string | null; buyer_name: string | null }[] = []

  if (refs.length) {
    const { data, error } = await supabase
      .from('order_tracking')
      .select('shop, buyer_account_no, buyer_name')
      .in('online_order', refs)
      .limit(100)
    if (error) return { status: 'no', outcome: { status: 'rejected', reason: `tracking_lookup:${error.message}` } }
    rows = data ?? []
  }

  // Facebook/LINE: the customer supplied a phone, not an order id. Safe to use
  // here only because submitRegistration() already proved the phone is the
  // member's own (see the ownership check there).
  if (!rows.length && input.phone) {
    const phone = normalizePhoneTh(input.phone)
    if (phone) {
      // Fetch by the last 4 digits, then compare in full after normalising.
      // order_tracking stores the same number several ways ('0812345678',
      // '66812345678', '094-6565566'), so an `.in()` over a fixed variant
      // list silently misses every dashed row -- measured at 1 in 5 of a
      // sampled FB_hosttail batch. A suffix filter catches all spellings and
      // the exact comparison below is what actually decides the match.
      const { data, error } = await supabase
        .from('order_tracking')
        .select('shop, buyer_account_no, buyer_name, phone')
        .like('phone', `%${phone.slice(-4)}`)
        .ilike('shop', '%hosttail%')
        .limit(500)
      if (error) return { status: 'no', outcome: { status: 'rejected', reason: `tracking_phone:${error.message}` } }
      rows = (data ?? []).filter((r) => normalizePhoneTh(r.phone) === phone)
    }
  }

  const withAccount = rows.filter((r) => r.buyer_account_no?.trim() && r.shop)
  if (!withAccount.length) return { status: 'no', outcome: { status: 'not_found' } }

  const distinct = new Map<string, { shop: string; accountNo: string; accountName: string | null }>()
  for (const r of withAccount) {
    const shop = r.shop!
    const accountNo = r.buyer_account_no!.trim()
    distinct.set(`${shop}::${accountNo}`, { shop, accountNo, accountName: r.buyer_name?.trim() || null })
  }

  if (distinct.size > 1) {
    return { status: 'no', outcome: { status: 'ambiguous', reason: `${distinct.size}_accounts_for_reference` } }
  }

  return { status: 'ok', ...[...distinct.values()][0] }
}
