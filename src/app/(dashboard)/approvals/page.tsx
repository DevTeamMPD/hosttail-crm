import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffSession } from '@/lib/session'
import { roleAtLeast } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/format-th'
import { channelMeta } from '@/lib/brand'
import { WarrantyCard } from './warranty-card'
import { RelinkCard } from './relink-card'

export const metadata: Metadata = { title: 'รออนุมัติ — Hosttail CRM' }
export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const session = await getStaffSession()
  const canAct = roleAtLeast(session?.role, 'marketing')
  const isAdmin = roleAtLeast(session?.role, 'admin')

  const supabase = await createClient()

  const [{ data: regs }, { data: relinks }] = await Promise.all([
    supabase
      .from('ht_warranty_registrations')
      .select(
        'id, member_id, channel, order_ref_raw, status, link_status, auto_match_candidates, receipt_path, submitted_at, sla_due_at, attempt_no'
      )
      .eq('status', 'pending')
      .order('submitted_at'),
    supabase
      .from('ht_relink_requests')
      .select('id, claimant_member_id, legacy_member_id, claimed_phone, origin, evidence, requested_at')
      .eq('status', 'pending')
      .order('requested_at'),
  ])

  const memberIds = [
    ...new Set([
      ...(regs ?? []).map((r) => r.member_id),
      ...(relinks ?? []).flatMap((r) => [r.claimant_member_id, r.legacy_member_id]),
    ]),
  ]
  const { data: members } = memberIds.length
    ? await supabase
        .from('ht_members')
        .select('id, full_name, line_display_name, phone, points_balance, is_test')
        .in('id', memberIds)
    : { data: [] }
  const byId = new Map((members ?? []).map((m) => [m.id, m]))

  // Receipts live in a private bucket; hand out short-lived signed URLs rather
  // than making the bucket public. Service role because signing is not a
  // customer-facing read path.
  const withReceipt = (regs ?? []).filter((r) => r.receipt_path)
  const signed = new Map<string, string>()
  if (withReceipt.length) {
    const admin = createAdminClient()
    const { data: urls } = await admin.storage
      .from('ht-receipts')
      .createSignedUrls(withReceipt.map((r) => r.receipt_path as string), 60 * 10)
    for (const [i, u] of (urls ?? []).entries()) {
      const path = withReceipt[i]?.receipt_path
      if (path && u.signedUrl) signed.set(path, u.signedUrl)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">รออนุมัติ</h1>
        <p className="text-sm text-gray-500">
          ใบเสร็จ/ออเดอร์ {regs?.length ?? 0} รายการ · ขอเชื่อมบัญชีเดิม {relinks?.length ?? 0} รายการ
        </p>
      </div>

      {!canAct && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--ht-returning-bg)', color: 'var(--ht-returning)' }}>
          บัญชีของคุณมีสิทธิ์ดูอย่างเดียว จึงอนุมัติหรือปฏิเสธไม่ได้
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          คำขอเชื่อมข้อมูลสมาชิกเดิม
          {!isAdmin && <span className="ml-2 text-xs font-normal text-gray-400">(เฉพาะผู้ดูแลระบบเท่านั้นที่อนุมัติได้)</span>}
        </h2>
        {!relinks?.length ? (
          <p className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
            ไม่มีคำขอค้างอยู่
          </p>
        ) : (
          relinks.map((r) => (
            <RelinkCard
              key={r.id}
              request={{
                id: r.id,
                claimedPhone: r.claimed_phone,
                origin: r.origin,
                requestedAt: formatThaiDate(r.requested_at),
                evidence: (r.evidence ?? {}) as Record<string, unknown>,
              }}
              claimant={{
                name: byId.get(r.claimant_member_id)?.line_display_name ?? byId.get(r.claimant_member_id)?.full_name ?? '—',
                id: r.claimant_member_id,
                isTest: byId.get(r.claimant_member_id)?.is_test ?? false,
              }}
              legacy={{
                name: byId.get(r.legacy_member_id)?.full_name ?? '—',
                id: r.legacy_member_id,
                points: byId.get(r.legacy_member_id)?.points_balance ?? 0,
              }}
              canAct={isAdmin}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">ใบเสร็จ / ออเดอร์ที่ยังจับคู่ไม่ได้</h2>
        {!regs?.length ? (
          <p className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
            ไม่มีรายการค้างอยู่
          </p>
        ) : (
          regs.map((r) => {
            const m = byId.get(r.member_id)
            const candidates = Array.isArray(r.auto_match_candidates)
              ? (r.auto_match_candidates as { orderNo?: string }[]).map((c) => c.orderNo).filter(Boolean as never)
              : []
            return (
              <WarrantyCard
                key={r.id}
                registration={{
                  id: r.id,
                  channelLabel: `${channelMeta(r.channel).icon} ${channelMeta(r.channel).label}`,
                  orderRef: r.order_ref_raw,
                  submittedAt: formatThaiDate(r.submitted_at),
                  slaDue: r.sla_due_at ? formatThaiDate(r.sla_due_at) : null,
                  attemptNo: r.attempt_no ?? 1,
                  receiptUrl: r.receipt_path ? (signed.get(r.receipt_path) ?? null) : null,
                  candidates: candidates as string[],
                }}
                member={{
                  id: r.member_id,
                  name: m?.full_name ?? m?.line_display_name ?? '—',
                  phone: m?.phone ?? null,
                }}
                canAct={canAct}
              />
            )
          })
        )}
      </section>

      <p className="text-xs text-gray-400">
        ดูรายละเอียดลูกค้าแต่ละคนได้ที่ <Link href="/customers" style={{ color: 'var(--ht-primary)' }}>หน้าลูกค้า</Link>
      </p>
    </div>
  )
}
