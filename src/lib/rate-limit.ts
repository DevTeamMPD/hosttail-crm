import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Returns true if the request is allowed, false if rate limited.
 * Backed by ht_check_rate_limit() (a fixed-window counter in Postgres, so it
 * works correctly across Vercel serverless instances).
 *
 * NOTE: this is namespaced under ht_ and defined in
 * supabase/migrations/20260915101100_ht_rate_limit.sql -- it does NOT call
 * crm-next's `check_rate_limit` RPC, which does not actually exist in the
 * shared project despite being referenced there.
 *
 * key: unique identifier (e.g. "liff-session:1.2.3.4")
 * limit: max requests per window
 * windowMs: window duration in milliseconds
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('ht_check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    })
    if (error) {
      console.error('[rate-limit]', error.message)
      return true // fail open -- don't block requests on store failure
    }
    return data === true
  } catch (err) {
    console.error('[rate-limit]', err)
    return true // fail open
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
