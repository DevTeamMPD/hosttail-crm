import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { roleAtLeast, type HtRole } from './permissions'

export interface StaffSession {
  userId: string
  staffId: string
  email: string
  displayName: string
  role: HtRole
}

/**
 * The authoritative staff identity for server components and server actions.
 *
 * Reads the role from ht_staff on every request rather than from the `ht_role`
 * cookie. The cookie exists only so src/proxy.ts can decide a redirect without
 * a database round-trip on every navigation -- it is user-editable and must
 * never be treated as an authorisation decision. Anything that reads or writes
 * data goes through here.
 *
 * Wrapped in React's `cache` so several components on one page share a single
 * lookup.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: staff } = await supabase
    .from('ht_staff')
    .select('id, email, display_name, role, is_active')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!staff) return null

  return {
    userId: user.id,
    staffId: staff.id,
    email: staff.email,
    displayName: staff.display_name,
    role: staff.role as HtRole,
  }
})

export class NotAuthorizedError extends Error {
  constructor(message = 'ไม่มีสิทธิ์ดำเนินการนี้') {
    super(message)
    this.name = 'NotAuthorizedError'
  }
}

/**
 * Guard for every server action that reads sensitive data or mutates
 * anything. The proxy only blocks navigation, so without this a viewer could
 * invoke an admin action straight from devtools.
 */
export async function requireRole(min: HtRole): Promise<StaffSession> {
  const session = await getStaffSession()
  if (!session) throw new NotAuthorizedError('กรุณาเข้าสู่ระบบ')
  if (!roleAtLeast(session.role, min)) throw new NotAuthorizedError()
  return session
}
