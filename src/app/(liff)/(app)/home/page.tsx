'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMember } from '../member-context'
import { useWarrantyData } from '../use-warranty-data'
import { formatThaiDate, daysUntil } from '@/lib/format-th'

export default function HomePage() {
  const { member } = useMember()
  const { items, registrations, loading } = useWarrantyData()

  const activeItems = items?.filter((i) => i.status === 'active') ?? []
  const nearExpiry = activeItems.filter((i) => i.warranty_end && daysUntil(i.warranty_end) <= 60)
  const pendingCount = registrations?.filter((r) => r.status === 'pending').length ?? 0

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        {member.line_picture_url ? (
          <Image
            src={member.line_picture_url}
            alt=""
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-gray-200" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-gray-900">
            {member.full_name ?? member.line_display_name ?? 'สมาชิก Hosttail'}
          </p>
          <p className="text-xs text-gray-500">สมาชิกตั้งแต่ {formatThaiDate(member.registered_at)}</p>
        </div>
      </div>

      <div
        className="rounded-2xl p-4 text-white shadow-sm"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary) 0%, var(--ht-deep) 100%)' }}
      >
        <p className="text-xs opacity-90">แต้มสะสมของคุณ</p>
        <p className="mt-1 text-3xl font-bold">{member.points_balance.toLocaleString()} แต้ม</p>
        <Link href="/privileges" className="mt-2 inline-block text-xs underline underline-offset-2 opacity-90">
          ดูประวัติแต้ม &amp; สิทธิพิเศษ →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold" style={{ color: 'var(--ht-success)' }}>
            {loading ? '—' : activeItems.length}
          </p>
          <p className="text-xs text-gray-500">ประกันที่ใช้งานอยู่</p>
        </div>
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold" style={{ color: nearExpiry.length ? 'var(--ht-warning)' : '#9ca3af' }}>
            {loading ? '—' : nearExpiry.length}
          </p>
          <p className="text-xs text-gray-500">ใกล้หมดประกัน (60 วัน)</p>
        </div>
      </div>

      {pendingCount > 0 && (
        <Link
          href="/warranty"
          className="block rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--ht-returning-bg)', color: 'var(--ht-returning)' }}
        >
          มี {pendingCount} รายการรอตรวจสอบ — แตะเพื่อดูสถานะ
        </Link>
      )}

      <Link
        href="/register?new=1"
        className="block rounded-full px-5 py-3 text-center text-sm font-medium text-white shadow-sm"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary), var(--ht-deep))' }}
      >
        📦 ลงทะเบียนสินค้าใหม่ / เพิ่มคำสั่งซื้อ
      </Link>
    </div>
  )
}
