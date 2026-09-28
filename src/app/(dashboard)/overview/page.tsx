import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatThaiDate, daysUntil } from '@/lib/format-th'
import { channelMeta } from '@/lib/brand'

export const metadata: Metadata = { title: 'ภาพรวม — Hosttail CRM' }
export const dynamic = 'force-dynamic'

const RANGES = [
  { key: '7d', label: '7 วัน' },
  { key: '30d', label: '30 วัน' },
  { key: 'month', label: 'เดือนนี้' },
] as const
type RangeKey = (typeof RANGES)[number]['key']

/** Channel rows in the breakdown, merging channels verified the same way. */
const BREAKDOWN = [
  { label: 'Shopee', channels: ['shopee'], color: '#ee4d2d' },
  { label: 'Lazada', channels: ['lazada'], color: '#0f146d' },
  { label: 'TikTok', channels: ['tiktok'], color: '#111111' },
  { label: 'LINE / Facebook', channels: ['line', 'facebook'], color: '#00b900' },
  { label: 'HomePro / Makro Pro', channels: ['homepro', 'makropro'], color: '#2e7d32' },
  { label: 'งาน Event', channels: ['event'], color: '#6a1b9a' },
  { label: 'ใบเสร็จ', channels: ['receipt'], color: '#c9561a' },
]

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000
/** YYYY-MM-DD of a timestamp in Bangkok. */
function bkkDay(ms: number): string {
  return new Date(ms + BKK_OFFSET_MS).toISOString().slice(0, 10)
}
/** Midnight Bangkok of a YYYY-MM-DD, as a UTC instant. */
function bkkMidnight(day: string): number {
  return new Date(`${day}T00:00:00+07:00`).getTime()
}

/** Request time. A server component renders once per request, so this is stable for the render. */
function requestTime(): number {
  return Date.now()
}

const SHORT_DAY = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })

interface Props {
  searchParams: Promise<{ range?: string }>
}

/** "Hosttail Dashboard" design, overview screen. */
export default async function OverviewPage({ searchParams }: Props) {
  const { range: rawRange } = await searchParams
  const range: RangeKey = RANGES.some((r) => r.key === rawRange) ? (rawRange as RangeKey) : '30d'

  // RLS-scoped client on purpose: what a viewer sees here is enforced by the
  // ht_is_staff('viewer') policies, not by this code remembering to filter.
  const supabase = await createClient()
  const now = requestTime()
  const today = bkkDay(now)
  const todayStart = bkkMidnight(today)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : Number(today.slice(8, 10))
  const rangeStart = todayStart - (days - 1) * 86_400_000
  const endOfToday = new Date(todayStart + 86_400_000).toISOString()
  const in60 = bkkDay(now + 60 * 86_400_000)

  // Internal test accounts register real orders on purpose (see
  // scripts/test-member.ts), so every number here excludes them.
  const { data: testMembers } = await supabase.from('ht_members').select('id').eq('is_test', true)
  const testIds = (testMembers ?? []).map((m) => m.id)
  const excludeTest = <T extends { not: (c: string, op: string, v: string) => T }>(q: T, column = 'member_id'): T =>
    testIds.length ? q.not(column, 'in', `(${testIds.join(',')})`) : q

  const [members, newMembers, pending, overdueCount, dueTodayCount, activeItems, expiringCount, regs, overdueList, expiringList] =
    await Promise.all([
      supabase.from('ht_members').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_test', false),
      supabase
        .from('ht_members')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_test', false)
        .gte('registered_at', new Date(rangeStart).toISOString()),
      excludeTest(supabase.from('ht_warranty_registrations').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
      excludeTest(
        supabase
          .from('ht_warranty_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .lt('sla_due_at', new Date(now).toISOString())
      ),
      excludeTest(
        supabase
          .from('ht_warranty_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .gte('sla_due_at', new Date(now).toISOString())
          .lt('sla_due_at', endOfToday)
      ),
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
        supabase
          .from('ht_warranty_registrations')
          .select('channel, submitted_at')
          .gte('submitted_at', new Date(rangeStart).toISOString())
          .limit(20000)
      ),
      excludeTest(
        supabase
          .from('ht_warranty_registrations')
          .select('id, member_id, channel, order_ref_raw, sla_due_at')
          .eq('status', 'pending')
          .lt('sla_due_at', endOfToday)
          .order('sla_due_at')
          .limit(6)
      ),
      excludeTest(
        supabase
          .from('ht_warranty_items')
          .select('id, member_id, product_name, sku, warranty_end')
          .eq('status', 'active')
          .gte('warranty_end', today)
          .lte('warranty_end', in60)
          .order('warranty_end')
          .limit(6)
      ),
    ])

  // Daily registrations, one bar per Bangkok day in the range.
  const perDay = new Map<string, number>()
  for (let i = 0; i < days; i++) perDay.set(bkkDay(rangeStart + i * 86_400_000 + 12 * 3_600_000), 0)
  for (const r of regs.data ?? []) {
    const d = bkkDay(new Date(r.submitted_at).getTime())
    if (perDay.has(d)) perDay.set(d, (perDay.get(d) ?? 0) + 1)
  }
  const bars = [...perDay.entries()]
  const maxBar = Math.max(1, ...bars.map(([, n]) => n))
  const totalInRange = (regs.data ?? []).length

  const breakdown = BREAKDOWN.map((b) => ({
    ...b,
    count: (regs.data ?? []).filter((r) => b.channels.includes(r.channel)).length,
  }))
  const maxBreakdown = Math.max(1, ...breakdown.map((b) => b.count))

  const memberIds = [
    ...new Set([...(overdueList.data ?? []).map((r) => r.member_id), ...(expiringList.data ?? []).map((i) => i.member_id)]),
  ]
  const { data: names } = memberIds.length
    ? await supabase.from('ht_members').select('id, full_name, line_display_name').in('id', memberIds)
    : { data: [] }
  const nameById = new Map((names ?? []).map((m) => [m.id, m.full_name ?? m.line_display_name ?? '—']))

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold">ภาพรวม</h1>
          <span className="text-[13px] text-[#8a7e75]">ข้อมูล ณ {formatThaiDate(new Date(now).toISOString())} · ไม่รวมบัญชีทดสอบ</span>
        </div>
        <div className="flex gap-1 rounded-xl bg-[var(--ht-segment)] p-1 text-[13px]">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={r.key === '30d' ? '/overview' : `/overview?range=${r.key}`}
              className="rounded-[9px] px-3 py-1.5"
              style={
                r.key === range
                  ? { background: '#fff', color: 'var(--ht-ink)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                  : { color: 'var(--ht-text-3)' }
              }
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi href="/customers" label="สมาชิกทั้งหมด" value={members.count ?? 0} sub={`+${(newMembers.count ?? 0).toLocaleString()} ${RANGES.find((r) => r.key === range)?.label}`} />
        <Kpi
          href="/approvals"
          label="รอตรวจสอบ"
          value={pending.count ?? 0}
          color="var(--ht-returning)"
          sub={`เกินกำหนด ${overdueCount.count ?? 0} · ครบกำหนดวันนี้ ${dueTodayCount.count ?? 0}`}
        />
        <Kpi label="ประกันที่ใช้งานอยู่" value={activeItems.count ?? 0} color="var(--ht-success)" sub="นับรายชิ้นตาม SKU" />
        <Kpi label="ใกล้หมดประกัน" value={expiringCount.count ?? 0} color="var(--ht-warning)" sub="ภายใน 60 วัน" />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold">การลงทะเบียนรายวัน</span>
            <span className="text-xs text-[var(--ht-text-4)]">
              {days} วันล่าสุด · {totalInRange.toLocaleString()} รายการ
            </span>
          </div>
          <div
            className="flex h-[180px] items-end gap-[2px] border-b border-[var(--ht-divider)]"
            role="img"
            aria-label={`การลงทะเบียนรายวัน ${days} วันล่าสุด รวม ${totalInRange} รายการ`}
          >
            {bars.map(([day, n], i) => {
              const last = i === bars.length - 1
              return (
                <div key={day} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{
                      height: n ? `${Math.max(3, (n / maxBar) * 100)}%` : '2px',
                      background: last ? 'var(--ht-primary)' : '#fcd2ae',
                    }}
                  />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-[var(--ht-ink)] px-2 py-1 text-[11px] whitespace-nowrap text-white group-hover:block">
                    {SHORT_DAY.format(new Date(bkkMidnight(day)))} · {n} รายการ
                  </span>
                </div>
              )
            })}
          </div>
          <div className="font-ht-mono flex justify-between text-[11px] text-[var(--ht-text-4)]">
            <span>{SHORT_DAY.format(new Date(bkkMidnight(bars[0][0])))}</span>
            {bars.length > 2 && <span>{SHORT_DAY.format(new Date(bkkMidnight(bars[Math.floor(bars.length / 2)][0])))}</span>}
            <span>{SHORT_DAY.format(new Date(bkkMidnight(bars[bars.length - 1][0])))}</span>
          </div>
        </Panel>

        <Panel>
          <span className="text-[15px] font-semibold">แยกตามช่องทาง</span>
          {breakdown.map((b) => (
            <div key={b.label} className="flex flex-col gap-[5px]">
              <div className="flex justify-between text-[13px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: b.color }} />
                  {b.label}
                </span>
                <span className="font-ht-mono text-[var(--ht-text-2)]">{b.count.toLocaleString()}</span>
              </div>
              <div className="h-1.5 rounded-[3px] bg-[#f4eee8]">
                <div className="h-1.5 rounded-[3px]" style={{ width: `${(b.count / maxBreakdown) * 100}%`, background: b.color }} />
              </div>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <ListPanel
          title={
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--ht-error)]" />
              เกินกำหนด SLA
            </span>
          }
          aside={
            <Link href="/approvals?tab=overdue" className="text-[13px] text-[var(--ht-deep)]">
              ไปที่รออนุมัติ →
            </Link>
          }
          empty="ไม่มีงานเกินกำหนดหรือครบกำหนดวันนี้"
        >
          {(overdueList.data ?? []).map((r) => {
            const meta = channelMeta(r.channel)
            const late = r.sla_due_at ? Math.ceil((now - new Date(r.sla_due_at).getTime()) / 86_400_000) : 0
            return (
              <Link key={r.id} href={`/customers/${r.member_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fdfaf7]">
                <span
                  className="font-ht-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold text-white"
                  style={{ background: meta.color }}
                >
                  {meta.mono}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{nameById.get(r.member_id) ?? '—'}</span>
                  <span className="font-ht-mono truncate text-xs text-[var(--ht-text-4)]">{r.order_ref_raw}</span>
                </div>
                <span className="text-xs font-medium text-[var(--ht-error)]">{late > 0 ? `เกิน ${late} วัน` : 'ครบกำหนดวันนี้'}</span>
              </Link>
            )
          })}
        </ListPanel>

        <ListPanel
          title="ใกล้หมดประกัน — ใช้ตั้งแคมเปญได้"
          aside={<span className="text-xs text-[var(--ht-text-4)]">60 วัน</span>}
          empty="ไม่มีประกันที่ใกล้หมดใน 60 วัน"
        >
          {(expiringList.data ?? []).map((i) => (
            <Link key={i.id} href={`/customers/${i.member_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fdfaf7]">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{nameById.get(i.member_id) ?? '—'}</span>
                <span className="truncate text-xs text-[var(--ht-text-4)]">{i.product_name ?? i.sku ?? 'สินค้า'}</span>
              </div>
              <span className="rounded-full bg-[var(--ht-warning-bg)] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-[var(--ht-warning)]">
                เหลือ {i.warranty_end ? daysUntil(i.warranty_end) : '—'} วัน
              </span>
            </Link>
          ))}
        </ListPanel>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, color, href }: { label: string; value: number; sub: string; color?: string; href?: string }) {
  const body = (
    <>
      <span className="text-[13px] text-[var(--ht-text-3)]">{label}</span>
      <span className="text-[32px] leading-[1.1] font-semibold" style={{ color: color ?? 'var(--ht-ink)' }}>
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-[var(--ht-text-4)]">{sub}</span>
    </>
  )
  const cls = 'flex flex-col gap-1.5 rounded-2xl border border-[var(--ht-border)] bg-white p-[18px] text-left'
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-[var(--ht-primary)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3.5 rounded-2xl border border-[var(--ht-border)] bg-white p-5">{children}</div>
}

function ListPanel({
  title,
  aside,
  empty,
  children,
}: {
  title: React.ReactNode
  aside: React.ReactNode
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--ht-border)] bg-white">
      <div className="flex items-center justify-between border-b border-[#f4eee8] px-5 py-4">
        <span className="text-[15px] font-semibold">{title}</span>
        {aside}
      </div>
      {children.length ? (
        <div className="flex flex-col divide-y divide-[#f8f4f0]">{children}</div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-[var(--ht-text-4)]">{empty}</p>
      )}
    </div>
  )
}
