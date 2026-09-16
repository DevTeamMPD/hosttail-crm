import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const res = NextResponse.json({ ok: true })
  res.cookies.set('ht_role', '', { path: '/', maxAge: 0 })
  return res
}
