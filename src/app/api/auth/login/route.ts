import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const BodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

/**
 * Signs a staff member in and mints the `ht_role` hint cookie src/proxy.ts
 * reads. The password never reaches the browser bundle -- sign-in happens
 * here, server-side, so the Supabase session cookies are set by the SSR
 * client's own cookie adapter.
 *
 * `ht_role` is a NAVIGATION hint, not an authorisation decision: a user can
 * edit their own cookies, so every server action re-reads the real role from
 * ht_staff via requireRole() (src/lib/session.ts).
 */
export async function POST(req: Request) {
  if (!(await rateLimit(`auth-login:${getClientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ error: 'rate_limited', message: 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' }, { status: 429 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', message: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error || !data.user) {
    // Deliberately vague: distinguishing "no such account" from "wrong
    // password" tells an attacker which staff emails exist.
    return NextResponse.json(
      { error: 'invalid_credentials', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' },
      { status: 401 }
    )
  }

  const { data: staff } = await supabase
    .from('ht_staff')
    .select('role, display_name, is_active')
    .eq('auth_user_id', data.user.id)
    .limit(1)
    .maybeSingle()

  if (!staff?.is_active) {
    // Authenticated with Supabase but not a staff member here. Drop the
    // session again so a half-logged-in state can't linger.
    await supabase.auth.signOut()
    return NextResponse.json(
      { error: 'not_staff', message: 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบหลังบ้าน' },
      { status: 403 }
    )
  }

  const res = NextResponse.json({ ok: true, role: staff.role, displayName: staff.display_name })
  res.cookies.set('ht_role', staff.role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}
