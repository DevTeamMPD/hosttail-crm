import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { normalizeOrderKey } from './normalize'
import { normalizePhoneTh } from '@/lib/phone'

// Deliberately no `import 'server-only'` here: unlike admin.ts/verify.ts,
// this module never touches an env secret -- it only takes a Supabase
// client as a parameter and runs queries. That makes it safe (and useful)
// to reuse verbatim from scripts/import-legacy.ts, which runs under plain
// tsx/node, outside Next's bundler, where `server-only` throws immediately
// on import regardless of runtime context.

type Client = SupabaseClient<Database>

const CANCELLED = 'Cancelled'

/**
 * Which slice of sales_transaction a reference is looked up in.
 *   online -- project 'Hosttail': Shopee/Lazada/TikTok/Facebook/Line/Website.
 *   event  -- brand receipts sold at trade shows. These are booked under
 *             project 'Head-Office' with customer_group1 'Event'; the receipt
 *             number is order_no ('901520260502-0009') and bill_no is a 6-digit
 *             number ('267122'). Restricted to customer_group1 'Event' so a
 *             receipt can never match a Head-Office wholesale or modern-trade
 *             bill.
 */
export type ResolveScope = 'online' | 'event'

export interface OrderLine {
  order_no: string
  bill_no: string | null
  sku: string | null
  product_name: string | null
  quantity: number | null
  amount: number | null
  keyword: string | null
  order_status: string | null
  txn_date: string | null
  transfer_date: string | null
}

export type ResolveOutcome =
  /** Found, live, has a settled amount — safe to grant warranty + points. */
  | { status: 'matched'; matchedOn: 'bill_no' | 'order_no'; orderNo: string; lines: OrderLine[]; netAmount: number }
  /** Found, but every line is cancelled — tell the customer, don't grant. */
  | { status: 'cancelled'; orderNo: string; lines: OrderLine[] }
  /** Found, but transfer_date is null — the daily ETL hasn't settled it yet. Retry later. */
  | { status: 'unsettled'; orderNo: string; lines: OrderLine[] }
  /** The reference matched more than one distinct order — a human must pick. */
  | { status: 'ambiguous'; candidates: { orderNo: string; netAmount: number; transferDate: string | null }[] }
  /** Nothing found anywhere. */
  | { status: 'not_found' }

const SELECT =
  'order_no,bill_no,sku,product_name,quantity,amount,keyword,order_status,txn_date,transfer_date'

/**
 * Resolve a customer-entered order reference against sales_transaction.
 *
 * Column semantics were verified against live data on 2026-09-15 — schema.sql
 * is stale on this point. `bill_no` (text, despite the DDL saying bigint) holds
 * the platform order id the customer sees: Shopee alphanumeric codes in 975/1000
 * sampled rows, and 15-20 digit ids for Lazada/TikTok/Facebook/Line. `order_no`
 * usually holds the 5-7 digit JST internal sequence. The two are populated
 * inconsistently across channels and eras, so BOTH are probed regardless of the
 * channel the customer picked — 8 of the 93 legacy rows chose the Shopee tab but
 * typed a JST internal number.
 *
 * Measured against the 80 distinct legacy order ids: bill_no matched 50,
 * order_no matched 6, combined 56 (70% overall; 84% of Shopee).
 */
export async function resolveByOrderRef(
  supabase: Client,
  rawRef: string,
  scope: ResolveScope = 'online'
): Promise<ResolveOutcome> {
  const key = normalizeOrderKey(rawRef)
  if (!key) return { status: 'not_found' }
  // normalizeOrderKey drops dashes, but event receipt numbers are stored WITH
  // them ('901520260502-0009'), so also probe the trimmed, uppercased input.
  const asTyped = String(rawRef).trim().replace(/^#+\s*/, '').toUpperCase()
  const keys = [...new Set([key, asTyped].filter(Boolean))]

  // bill_no first: it carries the id the customer actually sees.
  for (const column of ['bill_no', 'order_no'] as const) {
    let query = supabase.from('sales_transaction').select(SELECT).in(column, keys)
    query =
      scope === 'event'
        ? query.eq('project', 'Head-Office').eq('customer_group1', 'Event')
        : query.eq('project', 'Hosttail')
    const { data, error } = await query
    if (error) throw new Error(`resolveByOrderRef(${column}): ${error.message}`)
    if (!data?.length) continue

    const lines = data as OrderLine[]
    const orderNos = [...new Set(lines.map(l => l.order_no))]

    // A short numeric reference can collide across months — the unique key is
    // (order_no, sku, transfer_date, line_seq), so order_no alone is not unique.
    if (orderNos.length > 1) {
      return {
        status: 'ambiguous',
        candidates: orderNos.map(no => {
          const group = lines.filter(l => l.order_no === no)
          return {
            orderNo: no,
            netAmount: sumLive(group),
            transferDate: group.find(l => l.transfer_date)?.transfer_date ?? null,
          }
        }),
      }
    }

    const orderNo = orderNos[0]
    const live = lines.filter(l => (l.order_status ?? '') !== CANCELLED)
    if (!live.length) return { status: 'cancelled', orderNo, lines }
    if (!live.some(l => l.transfer_date)) return { status: 'unsettled', orderNo, lines }

    return { status: 'matched', matchedOn: column, orderNo, lines, netAmount: sumLive(lines) }
  }

  return { status: 'not_found' }
}

/**
 * Resolve orders for the Facebook / LINE channels, where the customer supplies a
 * phone number because sales_transaction has no phone column at all.
 *
 *   order_tracking.phone -> order_tracking.online_order -> sales_transaction
 *
 * Phone usability in order_tracking is highly channel-dependent (measured over
 * the 10,304 Hosttail rows): FB_hosttail 64% full, LOA_hosttail 64% full, but
 * SH_hosttail is 98% masked to the last two digits ('******60'). Hence this path
 * is offered only for the Facebook and LINE tabs.
 *
 * SECURITY: a phone number is not a secret the way an order id is. The caller
 * MUST confirm `phone` equals the phone already on the member's own profile
 * before calling this — otherwise anyone who knows a customer's number can claim
 * their orders and points.
 */
export async function resolveByPhone(
  supabase: Client,
  rawPhone: string
): Promise<ResolveOutcome[]> {
  const phone = normalizePhoneTh(rawPhone)
  if (!phone) return [{ status: 'not_found' }]

  // order_tracking stores the same number several ways ('0812345678',
  // '66812345678', '094-6565566'). Fetch by the last 4 digits and compare in
  // full after normalising -- an .in() over fixed variants missed every dashed
  // row (1 in 5 of a sampled FB batch). Same approach as bind-account.ts.
  const { data, error } = await supabase
    .from('order_tracking')
    .select('online_order,phone,platform,shop')
    .like('phone', `%${phone.slice(-4)}`)
    .ilike('shop', '%hosttail%')
    .limit(500)
  if (error) throw new Error(`resolveByPhone: ${error.message}`)
  const own = (data ?? []).filter(r => normalizePhoneTh(r.phone) === phone)
  if (!own.length) return [{ status: 'not_found' }]

  const refs = [...new Set(own.map(r => r.online_order).filter(Boolean) as string[])]
  const out: ResolveOutcome[] = []
  for (const ref of refs) out.push(await resolveByOrderRef(supabase, ref))
  return out
}

/** Net revenue using the same predicate as v_sales_enriched, so CRM totals
 *  never disagree with the existing sales dashboards. */
function sumLive(lines: OrderLine[]): number {
  return lines
    .filter(l => (l.order_status ?? '') !== CANCELLED)
    .filter(l => !(l.keyword ?? '').includes('ฝากขาย'))
    .reduce((acc, l) => acc + (Number(l.amount) || 0), 0)
}
