import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLiffSession } from '@/lib/liff/session'

export const runtime = 'nodejs'

/** The member's own tier + recent points ledger entries, most recent first, for the สิทธิพิเศษ tab. */
export async function GET(req: Request) {
  const session = await readLiffSession(req)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const [{ data: member, error: memberErr }, { data: ledger, error: ledgerErr }, { data: tiers, error: tiersErr }] =
    await Promise.all([
      supabase
        .from('ht_members')
        .select('points_balance, points_lifetime, tier_code')
        .eq('id', session.memberId)
        .single(),
      supabase
        .from('ht_points_ledger')
        .select('id, kind, points, source_type, note, created_at')
        .eq('member_id', session.memberId)
        .order('created_at', { ascending: false })
        .limit(30),
      // The full active tier ladder, not just the member's own tier -- the
      // UI shows "N points to the next tier" and ht_tiers is a tiny table
      // (a handful of rows), so one query beats N.
      supabase
        .from('ht_tiers')
        .select('code, name_th, min_lifetime_pts, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
    ])

  if (memberErr || ledgerErr || tiersErr) {
    console.error('[api/liff/points GET]', memberErr?.message, ledgerErr?.message, tiersErr?.message)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  return NextResponse.json({
    pointsBalance: member?.points_balance ?? 0,
    pointsLifetime: member?.points_lifetime ?? 0,
    tierCode: member?.tier_code ?? null,
    tiers: tiers ?? [],
    ledger: ledger ?? [],
  })
}
