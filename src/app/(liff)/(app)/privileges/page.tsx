'use client'

import { usePointsData, type LedgerEntry } from '../use-points-data'
import { formatThaiDate } from '@/lib/format-th'

const KIND_LABEL: Record<string, string> = {
  earn: 'ได้รับแต้ม',
  bonus: 'โบนัสแต้ม',
  reverse: 'ยกเลิกแต้ม',
  redeem: 'แลกแต้ม',
  expire: 'แต้มหมดอายุ',
  adjust: 'ปรับปรุงแต้ม',
}

export default function PrivilegesPage() {
  const { data, loading, error, refresh } = usePointsData()

  const currentTier = data?.tiers.find((t) => t.code === data.tierCode) ?? null
  const nextTier = data?.tiers.find((t) => t.min_lifetime_pts > (data?.pointsLifetime ?? 0)) ?? null

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold text-gray-900">สิทธิพิเศษ</h1>

      <div
        className="rounded-2xl p-4 text-white shadow-sm"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary) 0%, var(--ht-deep) 100%)' }}
      >
        <p className="text-xs opacity-90">แต้มสะสมคงเหลือ</p>
        <p className="mt-1 text-3xl font-bold">{(data?.pointsBalance ?? 0).toLocaleString()} แต้ม</p>
        {currentTier && (
          <span className="mt-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
            ระดับ {currentTier.name_th}
          </span>
        )}
        {nextTier && (
          <p className="mt-2 text-xs opacity-90">
            อีก {(nextTier.min_lifetime_pts - (data?.pointsLifetime ?? 0)).toLocaleString()} แต้มสะสมตลอดชีพ ถึงระดับ{' '}
            {nextTier.name_th}
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span aria-hidden>🎁</span>
          <p className="text-sm font-semibold text-gray-900">แลกของรางวัล</p>
        </div>
        <p className="text-sm text-gray-500">เร็วๆ นี้ — สะสมแต้มไว้ก่อน แล้วมาแลกของรางวัลได้ในเวอร์ชันถัดไป</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">ประวัติแต้ม</h2>

        {loading && <p className="py-6 text-center text-sm text-gray-400">กำลังโหลด...</p>}

        {error && (
          <div className="space-y-2 text-center text-sm">
            <p style={{ color: 'var(--ht-error)' }}>โหลดข้อมูลไม่สำเร็จ</p>
            <button type="button" onClick={refresh} className="underline underline-offset-2" style={{ color: 'var(--ht-primary)' }}>
              ลองใหม่อีกครั้ง
            </button>
          </div>
        )}

        {!loading && !error && data?.ledger.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีประวัติแต้ม</p>
        )}

        <div className="divide-y divide-gray-100">
          {data?.ledger.map((entry) => (
            <LedgerRow key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  )
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const positive = entry.points > 0
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-gray-800">{KIND_LABEL[entry.kind] ?? entry.kind}</p>
        <p className="text-xs text-gray-400">{formatThaiDate(entry.created_at)}</p>
      </div>
      <span className="shrink-0 text-sm font-semibold" style={{ color: positive ? 'var(--ht-success)' : 'var(--ht-error)' }}>
        {positive ? '+' : ''}
        {entry.points.toLocaleString()}
      </span>
    </div>
  )
}
