'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useWarrantyData, type WarrantyRegistration, type WarrantyItem } from '../use-warranty-data'
import { RegistrationStatusBadge, ItemStatusBadge } from './status-badge'
import { channelMeta } from '@/lib/brand'
import { formatThaiDate, daysUntil } from '@/lib/format-th'
import { CARD_SHADOW, ChannelBadge, Note, shortThaiDate } from '../../ui'

const TABS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'active', label: 'มีผลแล้ว' },
  { key: 'pending', label: 'รอตรวจ' },
] as const
type Tab = (typeof TABS)[number]['key']

/** "Hosttail Mobile Forms", screen 05. */
export default function WarrantyPage() {
  const { registrations, items, loading, error, refresh } = useWarrantyData()
  const [tab, setTab] = useState<Tab>('all')
  const shown = (registrations ?? []).filter((r) => tab === 'all' || r.status === tab)

  return (
    <div className="flex flex-col gap-3 px-3.5 pt-8">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-[22px] font-semibold text-[var(--ht-ink)]">การรับประกัน</h1>
        <Link
          href="/register?new=1"
          className="flex h-9 items-center rounded-full bg-[var(--ht-ink)] px-3.5 text-[13px] font-medium text-white"
        >
          + เพิ่มคำสั่งซื้อ
        </Link>
      </div>

      <div className="flex gap-1.5 rounded-[14px] bg-[var(--ht-segment)] p-1" role="tablist">
        {TABS.map((t) => {
          const on = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className="h-9 flex-1 rounded-[10px] text-[13px] font-medium transition"
              style={
                on
                  ? { background: '#fff', color: 'var(--ht-ink)', boxShadow: '0 1px 3px rgba(60,30,10,0.12)' }
                  : { background: 'transparent', color: 'var(--ht-text-3)' }
              }
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {loading && <p className="py-10 text-center text-sm text-[var(--ht-text-4)]">กำลังโหลด...</p>}

      {error && (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-white p-5 text-sm" style={{ boxShadow: CARD_SHADOW }}>
          <p className="text-[var(--ht-error)]">โหลดข้อมูลไม่สำเร็จ</p>
          <button type="button" onClick={refresh} className="text-[var(--ht-deep)] underline">
            ลองใหม่อีกครั้ง
          </button>
        </div>
      )}

      {!loading && !error && shown.length === 0 && (
        <div className="rounded-[20px] bg-white p-6 text-center text-sm text-[var(--ht-text-3)]" style={{ boxShadow: CARD_SHADOW }}>
          {tab === 'all' ? 'ยังไม่มีการลงทะเบียนสินค้า' : 'ไม่มีรายการในหมวดนี้'}
        </div>
      )}

      {shown.map((reg) => (
        <RegistrationCard key={reg.id} registration={reg} items={items?.filter((i) => i.registration_id === reg.id) ?? []} />
      ))}
    </div>
  )
}

function RegistrationCard({ registration, items }: { registration: WarrantyRegistration; items: WarrantyItem[] }) {
  const meta = channelMeta(registration.channel)
  const rejected = registration.status === 'rejected' || registration.status === 'attempts_exhausted'

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-4" style={{ boxShadow: CARD_SHADOW }}>
      <div className="flex items-start gap-3">
        <ChannelBadge meta={meta} size={34} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-[var(--ht-ink)]">{meta.label}</span>
          <span className="font-ht-mono truncate text-xs text-[var(--ht-text-3)]">{registration.order_ref_raw}</span>
        </div>
        <RegistrationStatusBadge status={registration.status} />
      </div>

      {registration.status === 'pending' && <Note tone="pend">อยู่ระหว่างตรวจสอบ ใช้เวลา 1–2 วันทำการ</Note>}
      {rejected && registration.review_note && <Note tone="bad">เหตุผล: {registration.review_note}</Note>}

      {items.map((item) => (
        <div key={item.id} className="flex justify-between gap-2.5 border-t border-[var(--ht-row-divider)] pt-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] text-[var(--ht-ink)]">{item.product_name ?? item.sku ?? 'สินค้า'}</span>
            <span className="text-[11px] text-[var(--ht-text-4)]">
              {shortThaiDate(item.warranty_start)} – {shortThaiDate(item.warranty_end)}
            </span>
          </div>
          <ItemStatusBadge status={item.status} daysLeft={item.warranty_end ? daysUntil(item.warranty_end) : null} small />
        </div>
      ))}

      <span className="text-[11px] text-[#a89c93]">ส่งเมื่อ {formatThaiDate(registration.submitted_at)}</span>
    </div>
  )
}
