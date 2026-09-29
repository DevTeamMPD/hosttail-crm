import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffSession } from '@/lib/session'
import { roleAtLeast } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/format-th'
import { channelMeta } from '@/lib/brand'
import { resolveByOrderRef, resolveByPhone, type ResolveOutcome } from '@/lib/orders/resolve'
import { WarrantyCard, type BillOption } from './warranty-card'
import { RelinkCard } from './relink-card'

export const metadata: Metadata = { title: 'รออนุมัติ — Hosttail CRM' }
export const dynamic = 'force-dynamic'

const MANUAL_CHANNELS = ['homepro', 'makropro', 'receipt']
const PHONE_CHANNELS = ['facebook', 'line']

/** Channel groups for the filter chips -- grouped by how the admin verifies them. */
const GROUPS = [
  { key: 'all', label: 'ทุกช่องทาง', channels: null },
  { key: 'online', label: 'Shopee / Lazada / TikTok', channels: ['shopee', 'lazada', 'tiktok'] },
  { key: 'phone', label: 'Facebook / LINE', channels: PHONE_CHANNELS },
  { key: 'event', label: 'งาน Event', channels: ['event'] },
  { key: 'store', label: 'HomePro / Makro / ใบเสร็จ', channels: MANUAL_CHANNELS },
] as const
type GroupKey = (typeof GROUPS)[number]['key']

const TABS = [
  { key: 'todo', label: 'รอตรวจ' },
  { key: 'overdue', label: 'เกินกำหนด' },
  { key: 'approved', label: 'อนุมัติแล้ว' },
  { key: 'rejected', label: 'ปฏิเสธ' },
  { key: 'relink', label: 'ขอเชื่อมบัญชีเดิม' },
] as const
type TabKey = (typeof TABS)[number]['key']

const DONE_LIMIT = 50

/** Turn resolver outcomes (live, or the auto_match_candidates snapshot) into pickable bills. */
function toOptions(outcomes: ResolveOutcome[], viaPhone = false): BillOption[] {
  const byNo = new Map<string, BillOption>()
  for (const o of outcomes) {
    if (o.status === 'matched' || o.status === 'unsettled') {
      const first = o.lines[0]
      byNo.set(o.orderNo, {
        orderNo: o.orderNo,
        // A split bill reads "277516+277517" -- not a key approveWarranty can
        // look up, so approve it by the platform order id behind it.
        ref: o.orderNo.includes('+') ? (first?.bill_no ?? o.orderNo) : o.orderNo,
        viaPhone,
        date: first?.txn_date ? formatThaiDate(first.txn_date) : null,
        amount: o.status === 'matched' ? o.netAmount : null,
        products: [...new Set(o.lines.map((l) => l.product_name).filter(Boolean))].join(', '),
      })
    } else if (o.status === 'ambiguous') {
      for (const c of o.candidates) {
        if (!byNo.has(c.orderNo)) {
          byNo.set(c.orderNo, {
            orderNo: c.orderNo,
            ref: c.orderNo,
            viaPhone,
            date: c.transferDate ? formatThaiDate(c.transferDate) : null,
            amount: c.netAmount,
            products: '',
          })
        }
      }
    }
  }
  return [...byNo.values()].slice(0, 10)
}

/** 'overdue' past the SLA, 'today' when it falls due within 24h. */
function slaState(slaDue: string | null, now: number): 'overdue' | 'today' | 'ok' {
  if (!slaDue) return 'ok'
  const due = new Date(slaDue).getTime()
  if (due < now) return 'overdue'
  if (due - now < 24 * 60 * 60 * 1000) return 'today'
  return 'ok'
}

interface Props {
  searchParams: Promise<{ tab?: string; ch?: string }>
}

/** Request time. A server component renders once per request, so this is stable for the render. */
function requestTime(): number {
  return Date.now()
}

export default async function ApprovalsPage({ searchParams }: Props) {
  const params = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === params.tab) ? (params.tab as TabKey) : 'todo'
  const group: GroupKey = GROUPS.some((g) => g.key === params.ch) ? (params.ch as GroupKey) : 'all'
  const groupChannels = GROUPS.find((g) => g.key === group)?.channels ?? null

  const session = await getStaffSession()
  const canAct = roleAtLeast(session?.role, 'marketing')
  const isAdmin = roleAtLeast(session?.role, 'admin')
  const supabase = await createClient()
  const now = requestTime()
  const nowIso = new Date(now).toISOString()

  // Counters for every tab, always for the whole queue (not the channel
  // filter), so a tab never reads 0 just because a filter hid its rows.
  const [pendingAll, overdueCount, approvedCount, rejectedCount, relinkCount] = await Promise.all([
    supabase.from('ht_warranty_registrations').select('channel').eq('status', 'pending'),
    supabase
      .from('ht_warranty_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('sla_due_at', nowIso),
    supabase
      .from('ht_warranty_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('reviewed_by', 'is', null),
    supabase
      .from('ht_warranty_registrations')
      .select('*', { count: 'exact', head: true })
      .in('status', ['rejected', 'attempts_exhausted']),
    supabase.from('ht_relink_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const pendingChannels = (pendingAll.data ?? []).map((r) => r.channel)
  const counts: Record<TabKey, number> = {
    todo: pendingChannels.length,
    overdue: overdueCount.count ?? 0,
    approved: approvedCount.count ?? 0,
    rejected: rejectedCount.count ?? 0,
    relink: relinkCount.count ?? 0,
  }
  const groupCount = (g: (typeof GROUPS)[number]) =>
    g.channels ? pendingChannels.filter((c) => (g.channels as readonly string[]).includes(c)).length : pendingChannels.length

  const href = (next: { tab?: TabKey; ch?: GroupKey }) => {
    const sp = new URLSearchParams()
    const t = next.tab ?? tab
    const c = next.ch ?? group
    if (t !== 'todo') sp.set('tab', t)
    if (c !== 'all') sp.set('ch', c)
    return `/approvals${sp.toString() ? `?${sp}` : ''}`
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">รออนุมัติ</h1>
        <p className="text-sm text-gray-500">
          งานค้าง {counts.todo} รายการ
          {counts.overdue ? (
            <span style={{ color: 'var(--ht-error)' }}> · เกินกำหนด {counts.overdue} รายการ</span>
          ) : null}
        </p>
      </div>

      {!canAct && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--ht-returning-bg)', color: 'var(--ht-returning)' }}>
          บัญชีของคุณมีสิทธิ์ดูอย่างเดียว จึงอนุมัติหรือปฏิเสธไม่ได้
        </p>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.filter((t) => t.key !== 'relink' || counts.relink > 0).map((t) => {
          const active = t.key === tab
          const alert = t.key === 'overdue' && counts.overdue > 0
          return (
            <Link
              key={t.key}
              href={href({ tab: t.key })}
              className="-mb-px border-b-2 px-3 py-2 text-sm"
              style={
                active
                  ? { borderColor: 'var(--ht-primary)', color: 'var(--ht-primary)', fontWeight: 600 }
                  : { borderColor: 'transparent', color: '#6b7280' }
              }
            >
              {t.label}
              <span
                className="ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]"
                style={alert ? { background: '#fdecea', color: 'var(--ht-error)' } : { background: '#f3f4f6', color: '#6b7280' }}
              >
                {counts[t.key]}
              </span>
            </Link>
          )
        })}
      </nav>

      {tab !== 'relink' && (
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => {
            const active = g.key === group
            return (
              <Link
                key={g.key}
                href={href({ ch: g.key })}
                className="rounded-full border px-3 py-1 text-xs"
                style={
                  active
                    ? { background: 'var(--ht-primary)', borderColor: 'var(--ht-primary)', color: '#fff' }
                    : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }
                }
              >
                {g.label}
                {tab === 'todo' || tab === 'overdue' ? ` (${groupCount(g)})` : ''}
              </Link>
            )
          })}
        </div>
      )}

      {tab === 'todo' || tab === 'overdue' ? (
        <PendingList
          overdueOnly={tab === 'overdue'}
          channels={groupChannels}
          canAct={canAct}
          now={now}
        />
      ) : tab === 'relink' ? (
        <RelinkList isAdmin={isAdmin} />
      ) : (
        <DoneList kind={tab} channels={groupChannels} />
      )}

      <p className="text-xs text-gray-400">
        ดูรายละเอียดลูกค้าแต่ละคนได้ที่ <Link href="/customers" style={{ color: 'var(--ht-primary)' }}>หน้าลูกค้า</Link>
      </p>
    </div>
  )
}

async function PendingList({
  overdueOnly,
  channels,
  canAct,
  now,
}: {
  overdueOnly: boolean
  channels: readonly string[] | null
  canAct: boolean
  now: number
}) {
  const supabase = await createClient()
  let query = supabase
    .from('ht_warranty_registrations')
    .select('id, member_id, channel, order_ref_raw, auto_match_candidates, receipt_path, submitted_at, sla_due_at, attempt_no')
    .eq('status', 'pending')
    // Oldest deadline first: the queue is worked top-down, so nothing
    // overdue can sit below something that is not.
    .order('sla_due_at', { ascending: true, nullsFirst: false })
    .order('submitted_at')
  if (channels) query = query.in('channel', channels as string[])
  if (overdueOnly) query = query.lt('sla_due_at', new Date(now).toISOString())
  const { data: regs } = await query

  if (!regs?.length) {
    return (
      <p className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
        {overdueOnly ? 'ไม่มีงานเกินกำหนด 🎉' : 'ไม่มีงานค้างในช่องทางนี้'}
      </p>
    )
  }

  const memberIds = [...new Set(regs.map((r) => r.member_id))]
  const { data: members } = await supabase
    .from('ht_members')
    .select('id, full_name, line_display_name, phone')
    .in('id', memberIds)
  const byId = new Map((members ?? []).map((m) => [m.id, m]))

  // Receipts live in a private bucket; hand out short-lived signed URLs rather
  // than making the bucket public.
  const admin = createAdminClient()
  const withReceipt = regs.filter((r) => r.receipt_path)
  const signed = new Map<string, string>()
  if (withReceipt.length) {
    const { data: urls } = await admin.storage
      .from('ht-receipts')
      .createSignedUrls(withReceipt.map((r) => r.receipt_path as string), 60 * 10)
    for (const [i, u] of (urls ?? []).entries()) {
      const path = withReceipt[i]?.receipt_path
      if (path && u.signedUrl) signed.set(path, u.signedUrl)
    }
  }

  // Facebook/LINE claims carry a phone, not an order id: look the member's
  // orders up live so the admin picks the real bill instead of hunting in JST.
  // Always the member's OWN profile phone, per resolveByPhone's security note.
  //
  // Order-id claims use the snapshot taken at submit time. When it holds
  // nothing usable (legacy rows were never resolved, or the ETL was behind),
  // retry the id live, then fall back to the member's phone -- customers do
  // pick the wrong tab (a Facebook order registered under Shopee).
  const optionsById = new Map<string, BillOption[]>()
  const byPhone = async (phone: string | null | undefined) => {
    if (!phone) return []
    try {
      return toOptions(await resolveByPhone(admin, phone), true)
    } catch (err) {
      console.error('[approvals] phone lookup failed', err)
      return []
    }
  }
  await Promise.all(
    regs.map(async (r) => {
      if (MANUAL_CHANNELS.includes(r.channel)) return
      const phone = byId.get(r.member_id)?.phone
      if (PHONE_CHANNELS.includes(r.channel)) {
        optionsById.set(r.id, (await byPhone(phone)).map((o) => ({ ...o, viaPhone: false })))
        return
      }
      let options = Array.isArray(r.auto_match_candidates)
        ? toOptions(r.auto_match_candidates as unknown as ResolveOutcome[])
        : []
      if (!options.length && r.order_ref_raw) {
        try {
          options = toOptions([await resolveByOrderRef(admin, r.order_ref_raw, r.channel === 'event' ? 'event' : 'online')])
        } catch (err) {
          console.error('[approvals] order lookup failed', err)
        }
      }
      if (!options.length && r.channel !== 'event') options = await byPhone(phone)
      optionsById.set(r.id, options)
    })
  )

  return (
    <div className="space-y-3">
      {regs.map((r) => {
        const m = byId.get(r.member_id)
        const meta = channelMeta(r.channel)
        return (
          <WarrantyCard
            key={r.id}
            registration={{
              id: r.id,
              channelLabel: `${meta.icon} ${meta.label}`,
              orderRef: r.order_ref_raw,
              submittedAt: formatThaiDate(r.submitted_at),
              slaDue: r.sla_due_at ? formatThaiDate(r.sla_due_at) : null,
              sla: slaState(r.sla_due_at, now),
              attemptNo: r.attempt_no ?? 1,
              receiptUrl: r.receipt_path ? (signed.get(r.receipt_path) ?? null) : null,
              approval: MANUAL_CHANNELS.includes(r.channel) ? 'manual' : 'lookup',
              options: optionsById.get(r.id) ?? [],
            }}
            member={{ id: r.member_id, name: m?.full_name ?? m?.line_display_name ?? '—', phone: m?.phone ?? null }}
            canAct={canAct}
          />
        )
      })}
    </div>
  )
}

/** Read-only history, so staff can check what happened to a claim after it left the queue. */
async function DoneList({ kind, channels }: { kind: 'approved' | 'rejected'; channels: readonly string[] | null }) {
  const supabase = await createClient()
  let query = supabase
    .from('ht_warranty_registrations')
    .select('id, member_id, channel, order_ref_raw, matched_order_no, matched_amount, review_note, reviewed_by, reviewed_at, submitted_at')
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(DONE_LIMIT)
  query = kind === 'approved' ? query.eq('status', 'active').not('reviewed_by', 'is', null) : query.in('status', ['rejected', 'attempts_exhausted'])
  if (channels) query = query.in('channel', channels as string[])
  const { data: regs } = await query

  if (!regs?.length) {
    return (
      <p className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีรายการ</p>
    )
  }

  const memberIds = [...new Set(regs.map((r) => r.member_id))]
  const staffIds = [...new Set(regs.map((r) => r.reviewed_by).filter(Boolean) as string[])]
  const [{ data: members }, { data: staff }] = await Promise.all([
    supabase.from('ht_members').select('id, full_name, line_display_name').in('id', memberIds),
    staffIds.length
      ? supabase.from('ht_staff').select('id, display_name').in('id', staffIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ])
  const memberName = new Map((members ?? []).map((m) => [m.id, m.full_name ?? m.line_display_name ?? '—']))
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.display_name]))

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">ลูกค้า</th>
            <th className="px-4 py-2.5 font-medium">ช่องทาง · เลขที่กรอก</th>
            <th className="px-4 py-2.5 font-medium">{kind === 'approved' ? 'บิลที่จับคู่' : 'เหตุผล'}</th>
            <th className="px-4 py-2.5 font-medium">โดย</th>
            <th className="px-4 py-2.5 font-medium">เมื่อ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {regs.map((r) => {
            const meta = channelMeta(r.channel)
            return (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/customers/${r.member_id}`} style={{ color: 'var(--ht-primary)' }}>
                    {memberName.get(r.member_id) ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {meta.icon} {meta.label} · <span className="font-mono">{r.order_ref_raw}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {kind === 'approved'
                    ? `${r.matched_order_no ?? '—'}${r.matched_amount ? ` · ฿${Number(r.matched_amount).toLocaleString()}` : ''}`
                    : (r.review_note ?? '—')}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{r.reviewed_by ? (staffName.get(r.reviewed_by) ?? '—') : '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.reviewed_at ? formatThaiDate(r.reviewed_at) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {regs.length === DONE_LIMIT && (
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">แสดง {DONE_LIMIT} รายการล่าสุด</p>
      )}
    </div>
  )
}

/** Legacy-account claims. Not part of Phase 1; the tab only appears if any are still open. */
async function RelinkList({ isAdmin }: { isAdmin: boolean }) {
  const supabase = await createClient()
  const { data: relinks } = await supabase
    .from('ht_relink_requests')
    .select('id, claimant_member_id, legacy_member_id, claimed_phone, origin, evidence, requested_at')
    .eq('status', 'pending')
    .order('requested_at')
  if (!relinks?.length) {
    return (
      <p className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">ไม่มีคำขอค้างอยู่</p>
    )
  }
  const ids = [...new Set(relinks.flatMap((r) => [r.claimant_member_id, r.legacy_member_id]))]
  const { data: members } = await supabase
    .from('ht_members')
    .select('id, full_name, line_display_name, points_balance, is_test')
    .in('id', ids)
  const byId = new Map((members ?? []).map((m) => [m.id, m]))
  return (
    <div className="space-y-3">
      {!isAdmin && <p className="text-xs text-gray-400">เฉพาะผู้ดูแลระบบเท่านั้นที่อนุมัติได้</p>}
      {relinks.map((r) => (
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
      ))}
    </div>
  )
}
