import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { normalizeOrderKey } from './normalize'
import { normalizePhoneTh } from '@/lib/phone'

type Client = SupabaseClient<Database>

const PROJECT = 'Hosttail'
const CANCELLED = 'Cancelled'

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
  rawRef: string
): Promise<ResolveOutcome> {
  const key = normalizeOrderKey(rawRef)
  if (!key) return { status: 'not_found' }

  // bill_no first: it carries the id the customer actually sees.
  for (const column of ['bill_no', 'order_no'] as const) {
    const { data, error } = await supabase
      .from('sales_transaction')
      .select(SELECT)
      .eq('project', PROJECT)
      .eq(column, key)
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
  // '66812345678', '081-234-5678'), so probe the known variants.
  const variants = [phone, `66${phone.slice(1)}`, `(+66)${phone.slice(1)}`]
  const { data, error } = await supabase
    .from('order_tracking')
    .select('online_order,phone,platform,shop')
    .in('phone', variants)
    .ilike('shop', '%hosttail%')
  if (error) throw new Error(`resolveByPhone: ${error.message}`)
  if (!data?.length) return [{ status: 'not_found' }]

  const refs = [...new Set(data.map(r => r.online_order).filter(Boolean) as string[])]
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
