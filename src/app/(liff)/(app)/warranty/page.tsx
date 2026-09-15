'use client'

import Link from 'next/link'
import { useWarrantyData, type WarrantyRegistration, type WarrantyItem } from '../use-warranty-data'
import { RegistrationStatusBadge, ItemStatusBadge } from './status-badge'
import { channelMeta } from '@/lib/brand'
import { formatThaiDate, daysUntil } from '@/lib/format-th'

export default function WarrantyPage() {
  const { registrations, items, loading, error, refresh } = useWarrantyData()

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">การรับประกันสินค้า</h1>
        <Link
          href="/register?new=1"
          className="rounded-full px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: 'linear-gradient(135deg, var(--ht-primary), var(--ht-deep))' }}
        >
          + เพิ่มคำสั่งซื้อ
        </Link>
      </div>

      {loading && <p className="py-10 text-center text-sm text-gray-400">กำลังโหลด...</p>}

      {error && (
        <div className="space-y-2 rounded-xl bg-white p-4 text-center text-sm shadow-sm">
          <p style={{ color: 'var(--ht-error)' }}>โหลดข้อมูลไม่สำเร็จ</p>
          <button type="button" onClick={refresh} className="underline underline-offset-2" style={{ color: 'var(--ht-primary)' }}>
            ลองใหม่อีกครั้ง
          </button>
        </div>
      )}

      {!loading && !error && registrations?.length === 0 && (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-500">ยังไม่มีการลงทะเบียนสินค้า</p>
        </div>
      )}

      {registrations?.map((reg) => (
        <RegistrationCard key={reg.id} registration={reg} items={items?.filter((i) => i.registration_id === reg.id) ?? []} />
      ))}
    </div>
  )
}

function RegistrationCard({ registration, items }: { registration: WarrantyRegistration; items: WarrantyItem[] }) {
  const meta = channelMeta(registration.channel)

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden>{meta.icon}</span>
          <div>
            <p className="text-sm font-medium text-gray-900">{meta.label}</p>
            <p className="text-xs text-gray-500">
              {meta.refKind === 'phone' ? 'เบอร์' : 'เลขคำสั่งซื้อ'}: {registration.order_ref_raw}
            </p>
          </div>
        </div>
        <RegistrationStatusBadge status={registration.status} />
      </div>

      <p className="text-xs text-gray-400">ส่งเมื่อ {formatThaiDate(registration.submitted_at)}</p>

      {registration.status === 'rejected' && registration.review_note && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          เหตุผล: {registration.review_note}
        </p>
      )}

      {registration.status === 'pending' && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--ht-returning-bg)', color: 'var(--ht-returning)' }}>
          อยู่ระหว่างตรวจสอบ ใช้เวลา 1–2 วันทำการ
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          {items.map((item) => (
            <WarrantyItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function WarrantyItemRow({ item }: { item: WarrantyItem }) {
  const daysLeft = item.warranty_end ? daysUntil(item.warranty_end) : null
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-800">{item.product_name ?? item.sku ?? 'สินค้า'}</p>
        <p className="text-xs text-gray-400">
          {item.sku ? `SKU ${item.sku} · ` : ''}
          {formatThaiDate(item.warranty_start)} – {formatThaiDate(item.warranty_end)}
        </p>
      </div>
      <ItemStatusBadge status={item.status} daysLeft={daysLeft} />
    </div>
  )
}
