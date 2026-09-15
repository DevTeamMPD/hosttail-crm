import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyLineIdToken } from '@/lib/liff/verify'
import { mintLiffSession, LIFF_SESSION_TTL_SEC } from '@/lib/liff/session'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/**
 * Exchanges a verified LINE ID token for our own short-lived app token, and
 * upserts a member shell keyed ONLY on the server-derived `sub` claim.
 *
 * This is the fix for the legacy page's core vulnerability: it called
 * liff.getProfile() and posted `userId` as a plain form field with zero
 * server-side verification, so anyone could impersonate any LINE user by
 * editing the request. Here, line_uid never comes from the request body --
 * only from LINE's own /oauth2/v2.1/verify response.
 */
export async function POST(req: Request) {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'missing_id_token' }, { status: 401 })
  }

  // 20 exchanges / minute / IP. Deliberately loose -- LINE's own in-app
  // webview shares an IP per carrier NAT, so this only stops a scripted
  // hammer on the verify endpoint, not normal traffic.
  if (!(await rateLimit(`liff-session:${getClientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const claims = await verifyLineIdToken(header.slice(7))
  if (!claims) {
    return NextResponse.json({ error: 'invalid_id_token' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: member, error } = await supabase
    .from('ht_members')
    .upsert(
      {
        line_uid: claims.sub,
        line_display_name: claims.name ?? null,
        line_picture_url: claims.picture ?? null,
        line_followed: true,
      },
      { onConflict: 'line_uid' }
    )
    .select(
      'id, line_uid, line_display_name, line_picture_url, full_name, phone, province_code, pet_types, pet_other, points_balance, tier_code, registered_at'
    )
    .single()

  if (error || !member) {
    console.error('[api/liff/session]', error?.message)
    return NextResponse.json({ error: 'member_upsert_failed' }, { status: 500 })
  }

  const token = await mintLiffSession(member.id, claims.sub)

  return NextResponse.json({
    token,
    expiresIn: LIFF_SESSION_TTL_SEC,
    member,
  })
}
