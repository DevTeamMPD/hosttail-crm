import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLiffSession } from '@/lib/liff/session'
import { rateLimit } from '@/lib/rate-limit'
import { UpdateProfileSchema } from '@/lib/orders/profile-schema'

export const runtime = 'nodejs'

const SELECT =
  'id, line_uid, line_display_name, line_picture_url, full_name, phone, province_code, pet_types, pet_other, note, points_balance, points_lifetime, tier_code, registered_at'

/** Updates the province/pet/note fields from the ข้อมูลสมาชิก tab. See profile-schema.ts for why fullName/phone aren't here. */
export async function PATCH(req: Request) {
  const session = await readLiffSession(req)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await rateLimit(`liff-profile:${session.memberId}`, 10, 60_000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: member, error } = await supabase
    .from('ht_members')
    .update({
      province_code: parsed.data.provinceCode,
      province_raw: parsed.data.provinceCode,
      pet_types: parsed.data.petTypes,
      pet_other: parsed.data.petTypes.includes('other') ? (parsed.data.petOther ?? null) : null,
      note: parsed.data.note ?? null,
    })
    .eq('id', session.memberId)
    .select(SELECT)
    .single()

  if (error || !member) {
    if (error?.code === '23503') return NextResponse.json({ error: 'invalid_province' }, { status: 400 })
    console.error('[api/liff/profile PATCH]', error?.message)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  return NextResponse.json({ member })
}
