import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLiffSession } from '@/lib/liff/session'
import { rateLimit } from '@/lib/rate-limit'
import { SubmitRegistrationSchema } from '@/lib/orders/schema'
import { submitRegistration, SubmitError, type SubmitResult } from '@/lib/orders/submit'
import { pushLineMessage } from '@/lib/line/push'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await readLiffSession(req)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 5 submissions / minute / member -- generous for real use, tight enough
  // to stop a scripted retry loop hammering the order resolver.
  if (!(await rateLimit(`liff-order:${session.memberId}`, 5, 60_000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = SubmitRegistrationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  try {
    const result = await submitRegistration(supabase, session.memberId, parsed.data)
    // Notify the customer in LINE OA after the response is sent -- a push
    // failure must never turn a successful registration into an error.
    after(() => notifyRegistration(supabase, session.memberId, result))
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof SubmitError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    console.error('[api/liff/orders POST]', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

async function notifyRegistration(
  supabase: ReturnType<typeof createAdminClient>,
  memberId: string,
  result: SubmitResult
) {
  const { data: member } = await supabase
    .from('ht_members')
    .select('line_uid, full_name')
    .eq('id', memberId)
    .maybeSingle()
  if (!member?.line_uid) return

  const greeting = member.full_name ? `สวัสดีคุณ ${member.full_name}\n` : ''
  const text =
    result.status === 'active'
      ? `${greeting}✅ ลงทะเบียนรับประกันสำเร็จ\nขอบคุณที่เลือกใช้สินค้า Hosttail ดูรายละเอียดการรับประกันและคะแนนได้ที่เมนูสมาชิก`
      : `${greeting}📥 ได้รับข้อมูลการลงทะเบียนแล้ว\n${result.message}\nเราจะแจ้งผลให้ทราบทาง LINE นี้`
  await pushLineMessage(member.line_uid, [{ type: 'text', text }])
}

/** The member's own registrations + warranty items, most recent first. */
export async function GET(req: Request) {
  const session = await readLiffSession(req)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: registrations, error } = await supabase
    .from('ht_warranty_registrations')
    .select(
      'id, channel, order_ref_raw, status, link_status, matched_order_no, matched_amount, submitted_at, activated_at, review_note'
    )
    .eq('member_id', session.memberId)
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('[api/liff/orders GET]', error.message)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const { data: items } = await supabase
    .from('ht_warranty_items')
    .select('id, registration_id, sku, product_name, quantity, warranty_start, warranty_end, status')
    .eq('member_id', session.memberId)
    .order('warranty_end', { ascending: true })

  return NextResponse.json({ registrations: registrations ?? [], items: items ?? [] })
}
