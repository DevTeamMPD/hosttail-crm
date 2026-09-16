import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatThaiDate, daysUntil } from '@/lib/format-th'
import { channelMeta } from '@/lib/brand'

export const metadata: Metadata = { title: 'ภาพรวม — Hosttail CRM' }
export const dynamic = 'force-dynamic'

export default async function OverviewPage() {
  // RLS-scoped client on purpose: what a viewer sees here is enforced by the
  // ht_is_staff('viewer') policies, not by this code remembering to filter.
  const supabase = await createClient()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const in60Days = new Date()
  in60Days.setDate(in60Days.getDate() + 60)
  const in60 = in60Days.toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  // Internal test accounts register real orders on purpose (see
  // scripts/test-member.ts), so every count below has to exclude them or the
  // dashboard drifts from reality. Kept as an explicit id list rather than a
  // join filter because it is a handful of rows and reads unambiguously.
  const { data: testMembers } = await supabase.from('ht_members').select('id').eq('is_test', true)
  const testIds = (testMembers ?? []).map((m) => m.id)
  const excludeTest = <T extends { not: (c: string, op: string, v: string) => T }>(q: T, column = 'member_id'): T =>
    testIds.length ? q.not(column, 'in', `(${testIds.join(',')})`) : q

  const [members, newMembers, activeItems, expiringItems, pendingRegs, pendingRelinks, bindings, balances, recent] =
    await Promise.all([
      supabase.from('ht_members').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_test', false),
      supabase
        .from('ht_members')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_test', false)
        .gte('registered_at', startOfMonth.toISOString()),
      excludeTest(supabase.from('ht_warranty_items').select('*', { count: 'exact', head: true }).eq('status', 'active')),
      excludeTest(
        supabase
          .from('ht_warranty_items')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('warranty_end', today)
          .lte('warranty_end', in60)
      ),
      excludeTest(
        supabase.from('ht_warranty_registrations').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      ),
      excludeTest(
        supabase.from('ht_relink_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        'claimant_member_id'
      ),
      excludeTest(
        supabase.from('ht_member_platform_accounts').select('*', { count: 'exact', head: true }).eq('status', 'active')
      ),
      supabase.from('ht_members').select('points_balance').eq('status', 'active').eq('is_test', false),
      excludeTest(
        supabase
          .from('ht_warranty_registrations')
          .select('id, member_id, channel, order_ref_raw, status, submitted_at')
          .order('submitted_at', { ascending: false })
          .limit(8)
      ),
    ])

  const totalPoints = (balances.data ?? []).reduce((sum, m) => sum + (m.points_balance ?? 0), 0)
  const queueTotal = (pendingRegs.count ?? 0) + (pendingRelinks.count ?? 0)

  const memberIds = [...new Set((recent.data ?? []).map((r) => r.member_id))]
  const { data: recentMembers } = memberIds.length
    ? await supabase.from('ht_members').select('id, full_name, line_display_name').in('id', memberIds)
    : { data: [] }
  const nameById = new Map((recentMembers ?? []).map((m) => [m.id, m.full_name ?? m.line_display_name ?? '—']))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">ภาพรวม</h1>
        <p className="text-sm text-gray-500">ข้อมูล ณ {formatThaiDate(new Date().toISOString())}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="สมาชิกทั้งหมด" value={members.count ?? 0} sub={`+${newMembers.count ?? 0} เดือนนี้`} href="/customers" />
        <Stat label="แต้มคงเหลือรวม" value={totalPoints} sub="แต้มที่ลูกค้าถืออยู่" />
        <Stat label="ประกันที่ใช้งานอยู่" value={activeItems.count ?? 0} sub="นับรายชิ้นตาม SKU" accent="var(--ht-success)" />
        <Stat
          label="ใกล้หมดประกัน"
          value={expiringItems.count ?? 0}
          sub="ภายใน 60 วัน"
          accent={expiringItems.count ? 'var(--ht-warning)' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Stat
          label="รอตรวจสอบทั้งหมด"
          value={queueTotal}
          sub={`ใบเสร็จ/ออเดอร์ ${pendingRegs.count ?? 0} · ขอเชื่อมบัญชี ${pendingRelinks.count ?? 0}`}
          href="/approvals"
          accent={queueTotal ? 'var(--ht-returning)' : undefined}
        />
        <Stat label="บัญชีแพลตฟอร์มที่ผูกแล้ว" value={bindings.count ?? 0} sub="ออเดอร์ถัดไปเข้าระบบอัตโนมัติ" />
        <Stat
          label="สมาชิกที่ยังไม่ผูกบัญชี"
          value={Math.max((members.count ?? 0) - (bindings.count ?? 0), 0)}
          sub="ยังต้องกรอกเลขออเดอร์เอง"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">การลงทะเบียนล่าสุด</h2>
          <Link href="/customers" className="text-xs" style={{ color: 'var(--ht-primary)' }}>
            ดูลูกค้าทั้งหมด →
          </Link>
        </div>
        {!recent.data?.length ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">ยังไม่มีการลงทะเบียน</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-800">{nameById.get(r.member_id) ?? '—'}</p>
                  <p className="text-xs text-gray-400">
                    {channelMeta(r.channel).icon} {channelMeta(r.channel).label} · {r.order_ref_raw}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusPill status={r.status} />
                  <p className="mt-0.5 text-[11px] text-gray-400">{formatThaiDate(r.submitted_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ExpiringSoon />
    </div>
  )
}

async function ExpiringSoon() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const in60 = new Date()
  in60.setDate(in60.getDate() + 60)

  const { data: testMembers } = await supabase.from('ht_members').select('id').eq('is_test', true)
  const testIds = (testMembers ?? []).map((m) => m.id)

  let query = supabase
    .from('ht_warranty_items')
    .select('id, member_id, product_name, sku, warranty_end')
    .eq('status', 'active')
    .gte('warranty_end', today)
    .lte('warranty_end', in60.toISOString().slice(0, 10))
    .order('warranty_end')
    .limit(8)
  if (testIds.length) query = query.not('member_id', 'in', `(${testIds.join(',')})`)
  const { data } = await query

  if (!data?.length) return null

  const ids = [...new Set(data.map((d) => d.member_id))]
  const { data: members } = await supabase.from('ht_members').select('id, full_name, phone').in('id', ids)
  const byId = new Map((members ?? []).map((m) => [m.id, m]))

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">ใกล้หมดประกัน — ใช้ตั้งแคมเปญได้</h2>
      </div>
      <ul className="divide-y divide-gray-100">
        {data.map((item) => {
          const left = item.warranty_end ? daysUntil(item.warranty_end) : 0
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-800">{byId.get(item.member_id)?.full_name ?? '—'}</p>
                <p className="truncate text-xs text-gray-400">{item.product_name ?? item.sku ?? 'สินค้า'}</p>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ background: 'var(--ht-warning-bg)', color: 'var(--ht-warning)' }}
              >
                เหลือ {left} วัน
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Stat({
  label,
  value,
  sub,
  href,
  accent,
}: {
  label: string
  value: number
  sub?: string
  href?: string
  accent?: string
}) {
  const body = (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: accent ?? '#111827' }}>
        {value.toLocaleString()}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'รอตรวจสอบ', color: 'var(--ht-returning)', bg: 'var(--ht-returning-bg)' },
    active: { label: 'อนุมัติแล้ว', color: 'var(--ht-success)', bg: 'var(--ht-success-bg)' },
    rejected: { label: 'ปฏิเสธ', color: 'var(--ht-error)', bg: '#fdecea' },
    attempts_exhausted: { label: 'ยื่นครบแล้ว', color: 'var(--ht-error)', bg: '#fdecea' },
    void: { label: 'ยกเลิก', color: '#6b7280', bg: '#f3f4f6' },
  }
  const m = map[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: m.color, background: m.bg }}>
      {m.label}
    </span>
  )
}
