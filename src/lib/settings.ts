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

export interface BroadcastSettings {
  /** false = campaigns cannot be sent at all. */
  enabled: boolean
  /** true = campaigns go through every step except calling LINE. */
  dry_run: boolean
}

// Missing/malformed row = safe side: nothing reaches customers.
const BROADCAST_DEFAULTS: BroadcastSettings = { enabled: true, dry_run: true }

/** Reads ht_settings.broadcast (seeded as { enabled: true, dry_run: true }). */
export async function getBroadcastSettings(supabase: Client): Promise<BroadcastSettings> {
  const { data } = await supabase.from('ht_settings').select('value').eq('key', 'broadcast').maybeSingle()
  if (!data?.value || typeof data.value !== 'object' || Array.isArray(data.value)) return BROADCAST_DEFAULTS
  const v = data.value as Partial<BroadcastSettings>
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : BROADCAST_DEFAULTS.enabled,
    dry_run: typeof v.dry_run === 'boolean' ? v.dry_run : BROADCAST_DEFAULTS.dry_run,
  }
}
