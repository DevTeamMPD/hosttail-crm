import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

const stripBom = (s: string | undefined): string => {
  if (!s) return s ?? ''
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

const supabaseUrl  = stripBom(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey      = stripBom(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const serviceKey   = stripBom(process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    supabaseUrl,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// Use plain supabase-js (no cookie/session handling) so the service role key
// is always sent as-is, bypassing RLS regardless of any user session in request cookies.
export function createServiceClient() {
  return Promise.resolve(
    createSupabaseClient<Database>(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  )
}
