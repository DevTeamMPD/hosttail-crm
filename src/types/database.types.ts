/**
 * Minimal hand-written types for the shared Supabase project `nroyacasuchqniaiuirk`.
 *
 * Covers only the pre-existing tables this app reads. The `ht_*` tables are added
 * here as they are created by migrations.
 *
 * Regenerate the full file with `npm run types` once a Supabase access token is
 * available (`npx supabase login` — the service-role key does NOT authorise the
 * management API that `gen types` calls).
 *
 * ⚠️ `sales_transaction.bill_no` is typed `string` here, not `number`. The DDL in
 * dashboard/supabase/schema.sql declares `bigint`, but the live column returns
 * alphanumeric Shopee order codes — it was migrated to text and schema.sql was
 * never updated. Verified against live data 2026-09-15.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface SalesTransactionRow {
  id: string
  bill_no: string | null
  order_no: string | null
  order_status: string | null
  txn_date: string
  transfer_date: string | null
  customer_code: string | null
  shipping_cost: number | null
  sku: string | null
  product_name: string | null
  unit_price: number | null
  quantity: number | null
  amount: number | null
  sell_price: number | null
  project: string | null
  keyword: string | null
  channel_id: string | null
  customer_group1: string | null
  customer_group2: string | null
  product_group: string | null
  invoice_no: string | null
  salesperson: string | null
  source_file: string | null
  source_type: string | null
  line_seq: number
  created_at: string
}

export interface OrderTrackingRow {
  id: string
  online_order: string
  tracking_number: string
  /** Frequently masked ('******60' on SH_hosttail). Use normalizePhoneTh(), which returns null for masked values. */
  phone: string | null
  platform: string | null
  shop: string | null
  logistics: string | null
  order_status: string | null
  source_file: string | null
  created_at: string
  updated_at: string
}

export interface ProductDataRow {
  id: string
  sku: string
  product_name: string | null
  [key: string]: Json | undefined
}

type ReadOnlyTable<T> = { Row: T; Insert: never; Update: never; Relationships: [] }

export interface Database {
  public: {
    Tables: {
      // ── Owned by other projects in this shared database. READ ONLY. ──
      sales_transaction: ReadOnlyTable<SalesTransactionRow>
      order_tracking: ReadOnlyTable<OrderTrackingRow>
      product_data: ReadOnlyTable<ProductDataRow>
      // ── ht_* tables are appended here as migrations land. ──
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
