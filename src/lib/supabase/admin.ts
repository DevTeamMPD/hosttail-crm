import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const stripBom = (s: string | undefined): string => {
  if (!s) return s ?? ''
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Service-role client. Plain supabase-js (NOT the SSR client) so request
 * cookies can never downgrade the service role. Server-only by construction.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    stripBom(process.env.NEXT_PUBLIC_SUPABASE_URL),
    stripBom(process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
