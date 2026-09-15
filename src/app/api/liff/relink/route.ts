import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLiffSession } from '@/lib/liff/session'
import { rateLimit } from '@/lib/rate-limit'
import { relinkLegacyMember } from '@/lib/orders/relink'

export const runtime = 'nodejs'

const BodySchema = z.object({ phone: z.string().trim().min(1) })

export async function POST(req: Request) {
  const session = await readLiffSession(req)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Tight on purpose: this endpoint accepts "knows a phone number" as proof
  // of identity (see relink.ts's security note), so it gets a much stricter
  // limit than order submission -- 5/hour, not 5/minute, to make scanning
  // through a list of phone numbers impractical.
  if (!(await rateLimit(`liff-relink:${session.memberId}`, 5, 60 * 60_000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const supabase = createAdminClient()

  let result: Awaited<ReturnType<typeof relinkLegacyMember>>
  try {
    result = await relinkLegacyMember(supabase, session.memberId, parsed.data.phone)
  } catch (err) {
    console.error('[api/liff/relink]', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // Every attempt is audit-logged, matched or not -- this is the trade-off
  // that makes accepting "knows the phone number" as identity proof
  // reviewable after the fact.
  await supabase.from('ht_audit_log').insert({
    actor_id: null,
    action: result.status === 'merged' ? 'liff_relink_merged' : 'liff_relink_not_found',
    entity: 'ht_members',
    entity_id: session.memberId,
    after: result.status === 'merged' ? { merged_from: result.member.id } : null,
  })

  if (result.status === 'not_found') {
    return NextResponse.json({ status: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ status: 'merged', member: result.member })
}
