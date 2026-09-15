/**
 * Types for the shared Supabase project `nroyacasuchqniaiuirk`.
 *
 * Generated from the live schema via the Supabase MCP server's
 * `generate_typescript_types` (2026-09-15), then filtered down to only the
 * tables/views/functions this app actually touches -- the full generated
 * output covers 60+ tables across every app sharing this database and is
 * 700+ KB.
 *
 * Regenerate + re-filter whenever a new ht_* migration adds a table/function
 * this app needs to query. `npm run types` will not work here (it shells out
 * to `supabase gen types`, which needs a CLI access token this environment
 * doesn't have) -- use the MCP tool instead and re-extract by hand.
 *
 * ⚠️ `sales_transaction.bill_no` is `string`, not `number`. The DDL comment
 * in dashboard/supabase/schema.sql still says `bigint`, but the live column
 * was migrated to text (confirmed via both this generator and a direct
 * information_schema query on 2026-09-15) -- it holds alphanumeric Shopee
 * order codes, which cannot fit in a bigint at all.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      // ── Owned by other apps in this shared database. READ ONLY -- never
      //    migrate or write to these from hosttail_crm. ──────────────────
      sales_transaction: {
        Row: {
          amount: number | null
          bill_no: string | null
          channel_id: string | null
          created_at: string
          customer_code: string | null
          customer_group1: string | null
          customer_group2: string | null
          id: string
          invoice_no: string | null
          keyword: string | null
          line_seq: number
          numeric_order_sku_key: string | null
          order_no: string | null
          order_status: string | null
          product_group: string | null
          product_name: string | null
          project: string | null
          quantity: number | null
          salesperson: string | null
          sell_price: number | null
          shipping_cost: number | null
          sku: string | null
          source_file: string | null
          source_type: string | null
          transfer_date: string | null
          txn_date: string
          unit_price: number | null
        }
        Insert: {
          amount?: number | null
          bill_no?: string | null
          channel_id?: string | null
          created_at?: string
          customer_code?: string | null
          customer_group1?: string | null
          customer_group2?: string | null
          id?: string
          invoice_no?: string | null
          keyword?: string | null
          line_seq?: number
          numeric_order_sku_key?: string | null
          order_no?: string | null
          order_status?: string | null
          product_group?: string | null
          product_name?: string | null
          project?: string | null
          quantity?: number | null
          salesperson?: string | null
          sell_price?: number | null
          shipping_cost?: number | null
          sku?: string | null
          source_file?: string | null
          source_type?: string | null
          transfer_date?: string | null
          txn_date: string
          unit_price?: number | null
        }
        Update: {
          amount?: number | null
          bill_no?: string | null
          channel_id?: string | null
          created_at?: string
          customer_code?: string | null
          customer_group1?: string | null
          customer_group2?: string | null
          id?: string
          invoice_no?: string | null
          keyword?: string | null
          line_seq?: number
          numeric_order_sku_key?: string | null
          order_no?: string | null
          order_status?: string | null
          product_group?: string | null
          product_name?: string | null
          project?: string | null
          quantity?: number | null
          salesperson?: string | null
          sell_price?: number | null
          shipping_cost?: number | null
          sku?: string | null
          source_file?: string | null
          source_type?: string | null
          transfer_date?: string | null
          txn_date?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'sales_transaction_channel_id_fkey'
            columns: ['channel_id']
            isOneToOne: false
            referencedRelation: 'salechannel'
            referencedColumns: ['id']
          },
        ]
      }
      order_tracking: {
        Row: {
          buyer_account_no: string | null
          buyer_name: string | null
          created_at: string
          id: string
          logistics: string | null
          online_order: string
          order_status: string | null
          /** Frequently masked ('******60' on SH_hosttail). ht_normalize_phone_th() / normalizePhoneTh() both return null for masked values. */
          phone: string | null
          platform: string | null
          shop: string | null
          source_file: string | null
          tracking_number: string
          updated_at: string
        }
        Insert: {
          buyer_account_no?: string | null
          buyer_name?: string | null
          created_at?: string
          id?: string
          logistics?: string | null
          online_order: string
          order_status?: string | null
          phone?: string | null
          platform?: string | null
          shop?: string | null
          source_file?: string | null
          tracking_number: string
          updated_at?: string
        }
        Update: {
          buyer_account_no?: string | null
          buyer_name?: string | null
          created_at?: string
          id?: string
          logistics?: string | null
          online_order?: string
          order_status?: string | null
          phone?: string | null
          platform?: string | null
          shop?: string | null
          source_file?: string | null
          tracking_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_data: {
        Row: {
          alert_days: number | null
          barcode: string | null
          barcode_extra: string | null
          box_qty: number | null
          brand: string | null
          buy_price: number | null
          category: string | null
          cost_price: number | null
          created_at: string
          expire_days: number | null
          extra_shipping: number | null
          height_cm: number | null
          id: string
          image_sku_url: string | null
          image_spu_url: string | null
          is_active: boolean
          keyword: string | null
          length_cm: number | null
          list_price: number | null
          locked_at: string | null
          locked_quote_id: string | null
          locked_quote_number: string | null
          max_stock: number | null
          min_stock: number | null
          one_time_use: boolean
          product_name: string
          remarks: string | null
          sell_price: number | null
          short_name: string | null
          sku: string
          source_url: string | null
          stock_qty: number | null
          supplier: string | null
          unit: string | null
          updated_at: string
          variant: string | null
          variant_code: string | null
          video_url: string | null
          weight_g: number | null
          width_cm: number | null
        }
        Insert: {
          alert_days?: number | null
          barcode?: string | null
          barcode_extra?: string | null
          box_qty?: number | null
          brand?: string | null
          buy_price?: number | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          expire_days?: number | null
          extra_shipping?: number | null
          height_cm?: number | null
          id?: string
          image_sku_url?: string | null
          image_spu_url?: string | null
          is_active?: boolean
          keyword?: string | null
          length_cm?: number | null
          list_price?: number | null
          locked_at?: string | null
          locked_quote_id?: string | null
          locked_quote_number?: string | null
          max_stock?: number | null
          min_stock?: number | null
          one_time_use?: boolean
          product_name: string
          remarks?: string | null
          sell_price?: number | null
          short_name?: string | null
          sku: string
          source_url?: string | null
          stock_qty?: number | null
          supplier?: string | null
          unit?: string | null
          updated_at?: string
          variant?: string | null
          variant_code?: string | null
          video_url?: string | null
          weight_g?: number | null
          width_cm?: number | null
        }
        Update: {
          alert_days?: number | null
          barcode?: string | null
          barcode_extra?: string | null
          box_qty?: number | null
          brand?: string | null
          buy_price?: number | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          expire_days?: number | null
          extra_shipping?: number | null
          height_cm?: number | null
          id?: string
          image_sku_url?: string | null
          image_spu_url?: string | null
          is_active?: boolean
          keyword?: string | null
          length_cm?: number | null
          list_price?: number | null
          locked_at?: string | null
          locked_quote_id?: string | null
          locked_quote_number?: string | null
          max_stock?: number | null
          min_stock?: number | null
          one_time_use?: boolean
          product_name?: string
          remarks?: string | null
          sell_price?: number | null
          short_name?: string | null
          sku?: string
          source_url?: string | null
          stock_qty?: number | null
          supplier?: string | null
          unit?: string | null
          updated_at?: string
          variant?: string | null
          variant_code?: string | null
          video_url?: string | null
          weight_g?: number | null
          width_cm?: number | null
        }
        Relationships: []
      }

      // ── Owned by this app. ──────────────────────────────────────────────
      ht_members: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          line_display_name: string | null
          line_followed: boolean
          line_picture_url: string | null
          line_uid: string | null
          merged_into: string | null
          note: string | null
          pet_other: string | null
          pet_types: string[]
          phone: string | null
          phone_raw: string | null
          points_balance: number
          points_lifetime: number
          province_code: string | null
          province_raw: string | null
          registered_at: string
          source: string
          status: string
          tier_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          line_display_name?: string | null
          line_followed?: boolean
          line_picture_url?: string | null
          line_uid?: string | null
          merged_into?: string | null
          note?: string | null
          pet_other?: string | null
          pet_types?: string[]
          phone?: string | null
          phone_raw?: string | null
          points_balance?: number
          points_lifetime?: number
          province_code?: string | null
          province_raw?: string | null
          registered_at?: string
          source?: string
          status?: string
          tier_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          line_display_name?: string | null
          line_followed?: boolean
          line_picture_url?: string | null
          line_uid?: string | null
          merged_into?: string | null
          note?: string | null
          pet_other?: string | null
          pet_types?: string[]
          phone?: string | null
          phone_raw?: string | null
          points_balance?: number
          points_lifetime?: number
          province_code?: string | null
          province_raw?: string | null
          registered_at?: string
          source?: string
          status?: string
          tier_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ht_members_merged_into_fkey'
            columns: ['merged_into']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ht_members_province_code_fkey'
            columns: ['province_code']
            isOneToOne: false
            referencedRelation: 'ht_provinces'
            referencedColumns: ['code']
          },
          {
            foreignKeyName: 'ht_members_tier_fk'
            columns: ['tier_code']
            isOneToOne: false
            referencedRelation: 'ht_tiers'
            referencedColumns: ['code']
          },
        ]
      }
      ht_member_line_ids: {
        Row: { is_primary: boolean; line_uid: string; linked_at: string; member_id: string }
        Insert: { is_primary?: boolean; line_uid: string; linked_at?: string; member_id: string }
        Update: { is_primary?: boolean; line_uid?: string; linked_at?: string; member_id?: string }
        Relationships: [
          {
            foreignKeyName: 'ht_member_line_ids_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
        ]
      }
      ht_member_merges: {
        Row: {
          id: string
          loser_id: string
          merged_at: string
          merged_by: string | null
          moved_rows: Json
          reason: string
          winner_id: string
        }
        Insert: {
          id?: string
          loser_id: string
          merged_at?: string
          merged_by?: string | null
          moved_rows?: Json
          reason: string
          winner_id: string
        }
        Update: {
          id?: string
          loser_id?: string
          merged_at?: string
          merged_by?: string | null
          moved_rows?: Json
          reason?: string
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ht_member_merges_loser_id_fkey'
            columns: ['loser_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ht_member_merges_winner_id_fkey'
            columns: ['winner_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
        ]
      }
      ht_provinces: {
        Row: { code: string; name_en: string; name_th: string; region: string; sort_order: number }
        Insert: { code: string; name_en: string; name_th: string; region: string; sort_order?: number }
        Update: { code?: string; name_en?: string; name_th?: string; region?: string; sort_order?: number }
        Relationships: []
      }
      ht_province_aliases: {
        Row: { alias: string; province_code: string }
        Insert: { alias: string; province_code: string }
        Update: { alias?: string; province_code?: string }
        Relationships: [
          {
            foreignKeyName: 'ht_province_aliases_province_code_fkey'
            columns: ['province_code']
            isOneToOne: false
            referencedRelation: 'ht_provinces'
            referencedColumns: ['code']
          },
        ]
      }
      ht_warranty_registrations: {
        Row: {
          activated_at: string | null
          attempt_no: number
          auto_match_candidates: Json
          channel: string
          created_at: string
          declared_phone: string | null
          id: string
          link_status: string
          matched_amount: number | null
          matched_order_no: string | null
          matched_skus: Json
          member_id: string
          order_key: string | null
          order_ref_kind: string
          order_ref_raw: string
          receipt_bytes: number | null
          receipt_mime: string | null
          receipt_path: string | null
          rejection_history: Json
          requires_receipt: boolean
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sla_due_at: string | null
          source: string
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          attempt_no?: number
          auto_match_candidates?: Json
          channel: string
          created_at?: string
          declared_phone?: string | null
          id?: string
          link_status?: string
          matched_amount?: number | null
          matched_order_no?: string | null
          matched_skus?: Json
          member_id: string
          order_key?: string | null
          order_ref_kind: string
          order_ref_raw: string
          receipt_bytes?: number | null
          receipt_mime?: string | null
          receipt_path?: string | null
          rejection_history?: Json
          requires_receipt?: boolean
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sla_due_at?: string | null
          source?: string
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          attempt_no?: number
          auto_match_candidates?: Json
          channel?: string
          created_at?: string
          declared_phone?: string | null
          id?: string
          link_status?: string
          matched_amount?: number | null
          matched_order_no?: string | null
          matched_skus?: Json
          member_id?: string
          order_key?: string | null
          order_ref_kind?: string
          order_ref_raw?: string
          receipt_bytes?: number | null
          receipt_mime?: string | null
          receipt_path?: string | null
          rejection_history?: Json
          requires_receipt?: boolean
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sla_due_at?: string | null
          source?: string
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ht_warranty_registrations_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
        ]
      }
      ht_warranty_items: {
        Row: {
          created_at: string
          id: string
          member_id: string
          product_name: string | null
          quantity: number
          registration_id: string
          sku: string | null
          status: string
          warranty_days: number
          warranty_end: string | null
          warranty_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          product_name?: string | null
          quantity?: number
          registration_id: string
          sku?: string | null
          status?: string
          warranty_days?: number
          warranty_end?: string | null
          warranty_start: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          product_name?: string | null
          quantity?: number
          registration_id?: string
          sku?: string | null
          status?: string
          warranty_days?: number
          warranty_end?: string | null
          warranty_start?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ht_warranty_items_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ht_warranty_items_registration_id_fkey'
            columns: ['registration_id']
            isOneToOne: false
            referencedRelation: 'ht_warranty_registrations'
            referencedColumns: ['id']
          },
        ]
      }
      ht_points_config: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          expiry_months: number | null
          id: number
          min_order_amount: number
          note: string | null
          rounding: string
          signup_bonus_points: number
          thb_per_point: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          expiry_months?: number | null
          id?: never
          min_order_amount?: number
          note?: string | null
          rounding?: string
          signup_bonus_points?: number
          thb_per_point: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          expiry_months?: number | null
          id?: never
          min_order_amount?: number
          note?: string | null
          rounding?: string
          signup_bonus_points?: number
          thb_per_point?: number
        }
        Relationships: []
      }
      ht_tiers: {
        Row: {
          code: string
          earn_multiplier: number
          is_active: boolean
          min_lifetime_pts: number
          name_en: string
          name_th: string
          perks: Json
          sort_order: number
        }
        Insert: {
          code: string
          earn_multiplier?: number
          is_active?: boolean
          min_lifetime_pts: number
          name_en: string
          name_th: string
          perks?: Json
          sort_order: number
        }
        Update: {
          code?: string
          earn_multiplier?: number
          is_active?: boolean
          min_lifetime_pts?: number
          name_en?: string
          name_th?: string
          perks?: Json
          sort_order?: number
        }
        Relationships: []
      }
      ht_points_ledger: {
        Row: {
          actor_id: string | null
          basis_amount: number | null
          config_id: number | null
          created_at: string
          expired_points: number
          expires_on: string | null
          id: number
          kind: string
          member_id: string
          note: string | null
          points: number
          rate_applied: number | null
          registration_id: string | null
          revision: number
          source_ref: string | null
          source_type: string
        }
        Insert: {
          actor_id?: string | null
          basis_amount?: number | null
          config_id?: number | null
          created_at?: string
          expired_points?: number
          expires_on?: string | null
          id?: never
          kind: string
          member_id: string
          note?: string | null
          points: number
          rate_applied?: number | null
          registration_id?: string | null
          revision?: number
          source_ref?: string | null
          source_type: string
        }
        Update: {
          actor_id?: string | null
          basis_amount?: number | null
          config_id?: number | null
          created_at?: string
          expired_points?: number
          expires_on?: string | null
          id?: never
          kind?: string
          member_id?: string
          note?: string | null
          points?: number
          rate_applied?: number | null
          registration_id?: string | null
          revision?: number
          source_ref?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ht_points_ledger_config_id_fkey'
            columns: ['config_id']
            isOneToOne: false
            referencedRelation: 'ht_points_config'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ht_points_ledger_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ht_points_ledger_registration_id_fkey'
            columns: ['registration_id']
            isOneToOne: false
            referencedRelation: 'ht_warranty_registrations'
            referencedColumns: ['id']
          },
        ]
      }
      ht_consent_documents: {
        Row: {
          body_md: string
          id: string
          is_current: boolean
          kind: string
          locale: string
          published_at: string
          version: string
        }
        Insert: {
          body_md: string
          id?: string
          is_current?: boolean
          kind: string
          locale?: string
          published_at?: string
          version: string
        }
        Update: {
          body_md?: string
          id?: string
          is_current?: boolean
          kind?: string
          locale?: string
          published_at?: string
          version?: string
        }
        Relationships: []
      }
      ht_member_consents: {
        Row: {
          document_id: string
          granted: boolean
          id: number
          ip_hash: string | null
          kind: string
          member_id: string
          recorded_at: string
          source: string
          user_agent: string | null
        }
        Insert: {
          document_id: string
          granted: boolean
          id?: never
          ip_hash?: string | null
          kind: string
          member_id: string
          recorded_at?: string
          source?: string
          user_agent?: string | null
        }
        Update: {
          document_id?: string
          granted?: boolean
          id?: never
          ip_hash?: string | null
          kind?: string
          member_id?: string
          recorded_at?: string
          source?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ht_member_consents_document_id_fkey'
            columns: ['document_id']
            isOneToOne: false
            referencedRelation: 'ht_consent_documents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ht_member_consents_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
        ]
      }
      ht_staff: {
        Row: {
          auth_user_id: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_active?: boolean
          role: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      ht_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
        }
        Relationships: []
      }
      ht_settings: {
        Row: { key: string; updated_at: string; updated_by: string | null; value: Json }
        Insert: { key: string; updated_at?: string; updated_by?: string | null; value: Json }
        Update: { key?: string; updated_at?: string; updated_by?: string | null; value?: Json }
        Relationships: []
      }
      ht_rate_limits: {
        Row: { count: number; key: string; window_start: string }
        Insert: { count?: number; key: string; window_start?: string }
        Update: { count?: number; key?: string; window_start?: string }
        Relationships: []
      }
    }
    Views: {
      ht_v_member_consent: {
        Row: {
          granted: boolean | null
          kind: string | null
          member_id: string | null
          recorded_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ht_member_consents_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'ht_members'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      ht_check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_ms: number }
        Returns: boolean
      }
      ht_finalize_registration: {
        Args: {
          p_items: Json
          p_matched_order_no: string
          p_note?: string
          p_order_amount: number
          p_registration_id: string
          p_reviewed_by?: string
        }
        Returns: Database['public']['Tables']['ht_warranty_registrations']['Row']
      }
      ht_reject_registration: {
        Args: { p_reason: string; p_registration_id: string; p_reviewer: string }
        Returns: Database['public']['Tables']['ht_warranty_registrations']['Row']
      }
      ht_resubmit_registration: {
        Args: { p_new_order_ref?: string; p_new_receipt_path?: string; p_registration_id: string }
        Returns: Database['public']['Tables']['ht_warranty_registrations']['Row']
      }
      ht_normalize_phone_th: { Args: { raw: string }; Returns: string }
      ht_norm_order_key: { Args: { raw: string }; Returns: string }
      ht_resolve_province: { Args: { raw: string }; Returns: string }
      ht_points_config_at: {
        Args: { p_on?: string }
        Returns: Database['public']['Tables']['ht_points_config']['Row']
      }
      ht_rebuild_points_balances: {
        Args: Record<PropertyKey, never>
        Returns: { members_fixed: number; total_balance: number }[]
      }
      ht_is_staff: { Args: { p_min_role?: string }; Returns: boolean }
      ht_current_staff_role: { Args: Record<PropertyKey, never>; Returns: string }
      ht_merge_members: {
        Args: { p_winner: string; p_loser: string; p_reason: string; p_actor?: string }
        Returns: Database['public']['Tables']['ht_members']['Row']
      }
      ht_pet_tokens: { Args: { raw: string }; Returns: string[] }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
