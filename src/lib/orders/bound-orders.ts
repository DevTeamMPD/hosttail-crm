import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { OrderChannel } from '@/lib/brand'
import { collapseSplitBill, type OrderLine } from './resolve'

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
    .select('order_no, bill_no, sku, product_name, quantity, amount, keyword, order_status, txn_date, transfer_date')
    .eq('project', 'Hosttail')
    .in('bill_no', [...refToShop.keys()])

  // One row per platform order id. JST may split it into several internal
  // orders (shipments); collapseSplitBill keeps the children and drops a
  // split parent, exactly as resolveByOrderRef does when it is registered.
  const byBill = new Map<string, OrderLine[]>()
  for (const l of (lines ?? []) as OrderLine[]) {
    if (!l.order_no || !l.bill_no) continue
    byBill.set(l.bill_no, [...(byBill.get(l.bill_no) ?? []), l])
  }

  const byOrder = new Map<string, BoundOrder>()
  for (const [billNo, group] of byBill) {
    const merged = collapseSplitBill(group) ?? { orderNo: [...new Set(group.map((l) => l.order_no))].sort().join('+'), lines: group }
    const live = merged.lines.filter((l) => (l.order_status ?? '') !== 'Cancelled')
    const shop = refToShop.get(billNo) ?? ''
    byOrder.set(billNo, {
      shop,
      channel: channelForShop(shop),
      billNo,
      orderNo: merged.orderNo,
      txnDate: merged.lines.map((l) => l.txn_date).filter(Boolean).sort()[0] ?? null,
      amount: live.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
      products: [...new Set(merged.lines.map((l) => l.product_name).filter(Boolean) as string[])],
      cancelled: live.length === 0,
      settled: live.some((l) => l.transfer_date),
    })
  }
  return [...byOrder.values()]
    .sort((a, b) => (b.txnDate ?? '').localeCompare(a.txnDate ?? ''))
    .slice(0, limit)
}
