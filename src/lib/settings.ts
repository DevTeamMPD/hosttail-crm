import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type Client = SupabaseClient<Database>

export interface WarrantySettings {
  warranty_days: number
  review_sla_business_days: number
  max_resubmit_attempts: number
}

const WARRANTY_DEFAULTS: WarrantySettings = {
  warranty_days: 365,
  review_sla_business_days: 2,
  max_resubmit_attempts: 3,
}

/** Reads ht_settings.warranty, falling back to defaults if the row is missing or malformed. */
export async function getWarrantySettings(supabase: Client): Promise<WarrantySettings> {
  const { data } = await supabase.from('ht_settings').select('value').eq('key', 'warranty').maybeSingle()
  if (!data?.value || typeof data.value !== 'object' || Array.isArray(data.value)) return WARRANTY_DEFAULTS
  return { ...WARRANTY_DEFAULTS, ...(data.value as Partial<WarrantySettings>) }
}
