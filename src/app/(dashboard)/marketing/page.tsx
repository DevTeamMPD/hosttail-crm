import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { roleAtLeast } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/format-th'
import { BubblesSchema, campaignSummary } from '@/lib/campaigns/messages'
import { StatusBadge } from './status-badge'

export const metadata: Metadata = { title: 'การตลาด — Hosttail CRM' }
export const dynamic = 'force-dynamic'

/** Campaign list: every LINE broadcast, newest first, with delivery and click numbers. */
export default async function MarketingPage() {
  const session = await getStaffSession()
  const canManage = roleAtLeast(session?.role, 'marketing')
  const supabase = await createClient()

  const { data: campaigns, error } = await supabase
    .from('ht_campaigns')
    .select('id, name, status, dry_run, segment_name, segment_id, messages, created_at, sent_at, sending_started_at, insight')
    .order('created_at', { ascending: false })
    .limit(100)
  const ids = (campaigns ?? []).map((c) => c.id)
  const [{ data: stats }, { data: segments }] = await Promise.all([
    supabase.from('ht_v_campaign_stats').select('*').in('campaign_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('ht_segments').select('id, name'),
  ])
  const statsById = new Map((stats ?? []).map((s) => [s.campaign_id, s]))
  const segmentName = new Map((segments ?? []).map((s) => [s.id, s.name]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">การตลาด</h1>
          <p className="text-sm text-gray-500">ส่งข้อความ LINE ถึงกลุ่มลูกค้า และดูว่าใครได้รับ / กดลิงก์</p>
        </div>
        {canManage && (
          <Link
            href="/marketing/new"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--ht-primary)' }}
          >
            + สร้างแคมเปญ
          </Link>
        )}
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">แคมเปญ</th>
              <th className="px-4 py-2.5 font-medium">กลุ่มลูกค้า</th>
              <th className="px-4 py-2.5 font-medium">สถานะ</th>
              <th className="px-4 py-2.5 text-right font-medium">ส่งถึง</th>
              <th className="px-4 py-2.5 text-right font-medium">เห็น (LINE)</th>
              <th className="px-4 py-2.5 text-right font-medium">คนที่คลิก</th>
              <th className="px-4 py-2.5 font-medium">วันที่</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!campaigns?.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  ยังไม่มีแคมเปญ
                </td>
              </tr>
            )}
            {campaigns?.map((c) => {
              const s = statsById.get(c.id)
              const bubbles = BubblesSchema.safeParse(c.messages)
              const sent = s?.sent ?? 0
              const clickers = s?.clickers ?? 0
              const seen = (c.insight as { overview?: { uniqueImpression?: number | null } } | null)?.overview?.uniqueImpression
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="max-w-[320px] px-4 py-2.5">
                    <Link href={`/marketing/${c.id}`} className="font-medium" style={{ color: 'var(--ht-primary)' }}>
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-gray-400">{bubbles.success ? campaignSummary(bubbles.data) : ''}</p>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {c.segment_name ?? (c.segment_id ? segmentName.get(c.segment_id) : null) ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={c.status} dryRun={c.dry_run} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-800">{c.status === 'draft' ? '—' : sent.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{typeof seen === 'number' ? seen.toLocaleString() : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-800">
                    {c.status === 'draft' ? (
                      '—'
                    ) : (
                      <>
                        {clickers.toLocaleString()}
                        {sent > 0 && <span className="ml-1 text-xs text-gray-400">({((clickers / sent) * 100).toFixed(1)}%)</span>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{formatThaiDate(c.sent_at ?? c.sending_started_at ?? c.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
