import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { roleAtLeast } from '@/lib/permissions'
import { BubblesSchema, campaignLinks } from '@/lib/campaigns/messages'
import type { LineUnitInsight } from '@/lib/line/insight'
import { Composer } from '../composer'
import { DryRunNotice, loadComposerData } from '../composer-data'
import { LinePreview } from '../line-preview'
import { SendProgress } from '../send-progress'
import { StatusBadge } from '../status-badge'
import { InsightButton } from './insight-button'

export const metadata: Metadata = { title: 'แคมเปญ — Hosttail CRM' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const TABS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'clicked', label: 'คลิกแล้ว' },
  { key: 'notclicked', label: 'ยังไม่คลิก' },
  { key: 'failed', label: 'ส่งไม่สำเร็จ' },
] as const
type Tab = (typeof TABS)[number]['key']

const DATE_TIME = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
})
const dt = (iso: string | null) => (iso ? DATE_TIME.format(new Date(iso)) : '—')

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; page?: string; go?: string }>
}

export default async function CampaignPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const session = await getStaffSession()
  const canManage = roleAtLeast(session?.role, 'marketing')
  const supabase = await createClient()
  const { data: c } = await supabase.from('ht_campaigns').select('*').eq('id', id).maybeSingle()
  if (!c) notFound()

  const parsed = BubblesSchema.safeParse(c.messages)
  const bubbles = parsed.success ? parsed.data : []
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  // ── Draft: the editor ──────────────────────────────────────────────────────
  if (c.status === 'draft') {
    const data = await loadComposerData()
    return (
      <div className="space-y-4">
        <Header name={c.name} status={c.status} dryRun={false} />
        {canManage ? (
          <>
            <DryRunNotice dryRun={data.dryRun} />
            <Composer campaign={{ id: c.id, name: c.name, segmentId: c.segment_id ?? '', bubbles }} {...data} />
          </>
        ) : (
          <LinePreview bubbles={bubbles} supabaseUrl={supabaseUrl} />
        )}
      </div>
    )
  }

  // ── Sent / sending: the report ─────────────────────────────────────────────
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : 'all'
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  let rq = supabase
    .from('ht_campaign_recipients')
    .select('id, member_id, status, error, sent_at, click_count, first_clicked_at, last_clicked_at, ht_members(full_name, line_display_name, line_picture_url)', {
      count: 'exact',
    })
    .eq('campaign_id', id)
  if (tab === 'clicked') rq = rq.gt('click_count', 0).order('first_clicked_at', { ascending: true })
  else if (tab === 'notclicked') rq = rq.eq('status', 'sent').eq('click_count', 0).order('sent_at', { ascending: true })
  else if (tab === 'failed') rq = rq.eq('status', 'failed').order('id')
  else rq = rq.order('click_count', { ascending: false }).order('id')

  const [{ data: stats }, { data: linkStats }, { data: recipients, count }, { data: sender }] = await Promise.all([
    supabase.from('ht_v_campaign_stats').select('*').eq('campaign_id', id).maybeSingle(),
    supabase.from('ht_v_campaign_link_stats').select('*').eq('campaign_id', id),
    rq.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    c.sent_by ? supabase.from('ht_staff').select('display_name').eq('id', c.sent_by).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const sent = stats?.sent ?? 0
  const clickers = stats?.clickers ?? 0
  const insight = c.insight as LineUnitInsight | null
  const seen = insight?.overview?.uniqueImpression ?? null
  const links = campaignLinks(bubbles)
  const linkStat = new Map((linkStats ?? []).map((l) => [l.link_index, l]))
  const lastPage = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—')

  return (
    <div className="space-y-4">
      <Header name={c.name} status={c.status} dryRun={c.dry_run} />
      <p className="text-sm text-gray-500">
        กลุ่ม <b className="text-gray-700">{c.segment_name ?? '—'}</b> · เริ่มส่ง {dt(c.sending_started_at)}
        {c.sent_at && ` · ส่งครบ ${dt(c.sent_at)}`}
        {sender?.display_name && ` · โดย ${sender.display_name}`}
      </p>

      <SendProgress
        key={`${c.status}-${stats?.pending ?? 0}-${stats?.failed ?? 0}`}
        campaignId={c.id}
        status={c.status}
        total={stats?.recipients ?? c.recipient_count}
        pending={stats?.pending ?? 0}
        failed={stats?.failed ?? 0}
        autoStart={sp.go === '1'}
        canManage={canManage}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="ผู้รับ" value={(stats?.recipients ?? c.recipient_count).toLocaleString()} />
        <Kpi label="ส่งสำเร็จ" value={sent.toLocaleString()} sub={stats?.failed ? `ไม่สำเร็จ ${stats.failed}` : undefined} />
        <Kpi
          label="เห็นข้อความ (จาก LINE)"
          value={seen === null ? '—' : seen.toLocaleString()}
          sub={seen === null ? (insight ? 'LINE ไม่แสดงถ้าน้อยกว่า 20 คน' : 'ยังไม่ได้ดึงสถิติ') : `${pct(seen, sent)} ของที่ส่ง`}
        />
        <Kpi label="คนที่คลิก" value={clickers.toLocaleString()} sub={`${pct(clickers, sent)} ของที่ส่ง`} accent />
        <Kpi label="คลิกทั้งหมด" value={(stats?.clicks ?? 0).toLocaleString()} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {/* LINE aggregate insight */}
          <section className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-900">สถิติจาก LINE</h2>
              <span className="text-xs text-gray-400">
                {c.insight_fetched_at ? `อัปเดต ${dt(c.insight_fetched_at)}` : 'ยังไม่เคยดึง'}
              </span>
              {canManage && !c.dry_run && <InsightButton campaignId={c.id} />}
            </div>
            <p className="text-xs text-gray-500">
              LINE ไม่บอกเป็นรายคนว่าใครเปิดอ่าน — บอกได้แค่ยอดรวม “เห็นข้อความ” (unique impression) และจะไม่แสดงตัวเลขถ้าน้อยกว่า 20 คน
              ตัวเลขนิ่งหลังส่งประมาณ 1 วัน · รายคนที่ระบบเก็บได้จริงคือ <b>ส่งถึงใคร</b> และ <b>ใครกดลิงก์</b> (ตารางด้านล่าง)
            </p>
            {insight?.messages?.length ? (
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 font-medium">กล่องที่</th>
                    <th className="py-1 text-right font-medium">เห็น (คน)</th>
                    <th className="py-1 text-right font-medium">เห็น (ครั้ง)</th>
                  </tr>
                </thead>
                <tbody>
                  {insight.messages.map((m) => (
                    <tr key={m.seq} className="border-t border-gray-100">
                      <td className="py-1">{m.seq}</td>
                      <td className="py-1 text-right">{m.uniqueImpression ?? '—'}</td>
                      <td className="py-1 text-right">{m.impression ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>

          {/* Per-link clicks (our own tracking) */}
          {links.length > 0 && (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
              <h2 className="mb-2 font-semibold text-gray-900">ลิงก์ในข้อความ</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 font-medium">ลิงก์</th>
                    <th className="py-1 text-right font-medium">คนที่คลิก</th>
                    <th className="py-1 text-right font-medium">คลิก</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((url, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="max-w-[360px] truncate py-1.5">
                        <a href={url} target="_blank" rel="noreferrer" className="text-[var(--ht-deep)] hover:underline">
                          {url}
                        </a>
                      </td>
                      <td className="py-1.5 text-right">{(linkStat.get(i)?.clickers ?? 0).toLocaleString()}</td>
                      <td className="py-1.5 text-right">{(linkStat.get(i)?.clicks ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Recipients */}
          <section className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex flex-wrap gap-1 border-b border-gray-100 px-3 py-2">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={`/marketing/${id}?tab=${t.key}`}
                  className="rounded-full px-3 py-1 text-xs"
                  style={
                    t.key === tab
                      ? { background: 'var(--ht-primary)', color: '#fff' }
                      : { background: '#f3f4f6', color: '#374151' }
                  }
                >
                  {t.label}
                </Link>
              ))}
              <span className="ml-auto self-center text-xs text-gray-400">{(count ?? 0).toLocaleString()} คน</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-4 py-2 font-medium">ลูกค้า</th>
                    <th className="px-4 py-2 font-medium">การส่ง</th>
                    <th className="px-4 py-2 text-right font-medium">คลิก</th>
                    <th className="px-4 py-2 font-medium">คลิกครั้งแรก</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!recipients?.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                        ไม่มีรายการ
                      </td>
                    </tr>
                  )}
                  {recipients?.map((r) => {
                    const m = r.ht_members
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2.5">
                            {m?.line_picture_url ? (
                              <Image
                                src={m.line_picture_url}
                                alt=""
                                width={28}
                                height={28}
                                className="h-7 w-7 shrink-0 rounded-full object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="h-7 w-7 shrink-0 rounded-full bg-gray-200" />
                            )}
                            <Link href={`/customers/${r.member_id}`} className="font-medium" style={{ color: 'var(--ht-primary)' }}>
                              {m?.full_name ?? m?.line_display_name ?? '(ไม่ระบุชื่อ)'}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {r.status === 'sent' ? (
                            <span className="text-[var(--ht-success)]">✓ {dt(r.sent_at)}</span>
                          ) : r.status === 'failed' ? (
                            <span className="text-[var(--ht-error)]" title={r.error ?? ''}>
                              ✕ ไม่สำเร็จ
                            </span>
                          ) : (
                            <span className="text-gray-400">รอส่ง</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-800">{r.click_count || '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{dt(r.first_clicked_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {lastPage > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs">
                <span className="text-gray-500">
                  หน้า {page} จาก {lastPage}
                </span>
                <span className="flex gap-2">
                  {page > 1 && (
                    <Link href={`/marketing/${id}?tab=${tab}&page=${page - 1}`} className="rounded border px-2 py-1 hover:bg-gray-50">
                      ก่อนหน้า
                    </Link>
                  )}
                  {page < lastPage && (
                    <Link href={`/marketing/${id}?tab=${tab}&page=${page + 1}`} className="rounded border px-2 py-1 hover:bg-gray-50">
                      ถัดไป
                    </Link>
                  )}
                </span>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-2 xl:sticky xl:top-6 xl:self-start">
          <p className="text-center text-xs text-gray-500">ข้อความที่ส่ง</p>
          <LinePreview bubbles={bubbles} supabaseUrl={supabaseUrl} />
        </aside>
      </div>
    </div>
  )
}

function Header({ name, status, dryRun }: { name: string; status: string; dryRun: boolean }) {
  return (
    <div>
      <Link href="/marketing" className="text-xs text-gray-500 hover:underline">
        ← การตลาด
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-900">{name}</h1>
        <StatusBadge status={status} dryRun={dryRun} />
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold" style={{ color: accent ? 'var(--ht-deep)' : 'var(--ht-ink)' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}
