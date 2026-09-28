import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { OrderChannel } from '@/lib/brand'

type Client = SupabaseClient<Database>

/** Storefronts an admin can connect by hand from the customer page. */
export const CONNECTABLE_PLATFORMS = [
  { value: 'shopee', label: 'Shopee', shop: 'SH_hosttail' },
  { value: 'lazada', label: 'Lazada', shop: 'LA_hosttail' },
  { value: 'tiktok', label: 'TikTok', shop: 'TT_hosttail' },
] as const

export type ConnectablePlatform = (typeof CONNECTABLE_PLATFORMS)[number]['value']

/** order_tracking.shop -> the warranty channel an order from it is registered under. */
const SHOP_CHANNEL: Record<string, OrderChannel> = {
  SH_hosttail: 'shopee',
  LA_hosttail: 'lazada',
  TT_hosttail: 'tiktok',
  FB_hosttail: 'facebook',
  LOA_hosttail: 'line',
  Line_hosttail: 'line',
}

export function channelForShop(shop: string): OrderChannel | null {
  return SHOP_CHANNEL[shop] ?? null
}

export interface BoundOrder {
  shop: string
  channel: OrderChannel | null
  /** The id the customer sees (sales_transaction.bill_no / order_tracking.online_order). */
  billNo: string
  orderNo: string
  txnDate: string | null
  amount: number
  products: string[]
  cancelled: boolean
  settled: boolean
}

/**
 * Every Hosttail order placed from the member's ACTIVE bound accounts:
 *   ht_member_platform_accounts (shop, account_no)
 *     -> order_tracking (shop, buyer_account_no) -> online_order
 *     -> sales_transaction (project Hosttail, bill_no)
 * Newest first. Only ever reads accounts bound to this member, so it cannot
 * surface anyone else's orders.
 */
export async function listBoundOrders(supabase: Client, memberId: string, limit = 50): Promise<BoundOrder[]> {
  const { data: accounts } = await supabase
    .from('ht_member_platform_accounts')
    .select('shop, account_no')
    .eq('member_id', memberId)
    .eq('status', 'active')
  if (!accounts?.length) return []

  const refToShop = new Map<string, string>()
  for (const a of accounts) {
    const { data: rows } = await supabase
      .from('order_tracking')
      .select('online_order')
      .eq('shop', a.shop)
      .eq('buyer_account_no', a.account_no)
      .limit(200)
    for (const r of rows ?? []) if (r.online_order) refToShop.set(r.online_order, a.shop)
  }
  if (!refToShop.size) return []

  const { data: lines } = await supabase
    .from('sales_transaction')
    .select('order_no, bill_no, product_name, amount, order_status, txn_date, transfer_date')
    .eq('project', 'Hosttail')
    .in('bill_no', [...refToShop.keys()])
  const byOrder = new Map<string, BoundOrder>()
  for (const l of lines ?? []) {
    if (!l.order_no || !l.bill_no) continue
    const shop = refToShop.get(l.bill_no) ?? ''
    const fresh: BoundOrder = {
      shop,
      channel: channelForShop(shop),
      billNo: l.bill_no,
      orderNo: l.order_no,
      txnDate: l.txn_date,
      amount: 0,
      products: [],
      cancelled: true,
      settled: false,
    }
    const o = byOrder.get(l.order_no) ?? fresh
    const live = (l.order_status ?? '') !== 'Cancelled'
    if (live) {
      o.cancelled = false
      o.amount += Number(l.amount) || 0
    }
    if (l.transfer_date) o.settled = true
    if (l.product_name && !o.products.includes(l.product_name)) o.products.push(l.product_name)
    byOrder.set(l.order_no, o)
  }
  return [...byOrder.values()]
    .sort((a, b) => (b.txnDate ?? '').localeCompare(a.txnDate ?? ''))
    .slice(0, limit)
}
