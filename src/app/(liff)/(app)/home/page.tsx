'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMember } from '../member-context'
import { useWarrantyData } from '../use-warranty-data'
import { ItemStatusBadge } from '../warranty/status-badge'
import { formatThaiDate, daysUntil } from '@/lib/format-th'
import { CARD_SHADOW, primaryButtonClass } from '../../ui'

const PREVIEW_ITEMS = 5

/** "Hosttail Mobile Forms", screen 04 (Flow B -- after registration). */
export default function HomePage() {
  const { member } = useMember()
  const { items, registrations, loading } = useWarrantyData()

  const activeItems = items?.filter((i) => i.status === 'active') ?? []
  const nearExpiry = activeItems.filter((i) => i.warranty_end && daysUntil(i.warranty_end) <= 60)
  const pendingCount = registrations?.filter((r) => r.status === 'pending').length ?? 0
  // Soonest to expire first: those are the ones worth a glance.
  const listed = [...activeItems]
    .sort((a, b) => (a.warranty_end ?? '').localeCompare(b.warranty_end ?? ''))
    .slice(0, PREVIEW_ITEMS)

  return (
    <div>
      <header className="bg-[var(--ht-primary)] px-[22px] pt-10 pb-20 text-white">
        <div className="flex items-center gap-3">
          {member.line_picture_url ? (
            <Image
              src={member.line_picture_url}
              alt=""
              width={52}
              height={52}
              unoptimized
              className="h-[52px] w-[52px] rounded-full border-2 border-white/60 object-cover"
            />
          ) : (
            <div className="h-[52px] w-[52px] rounded-full border-2 border-white/60 bg-white/25" />
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] opacity-85">สวัสดี</span>
            <span className="truncate text-xl font-semibold">คุณ{member.full_name ?? member.line_display_name ?? 'สมาชิก'}</span>
          </div>
          <Image src="/logo.png" alt="Hosttail" width={34} height={34} className="ml-auto h-[34px] w-[34px] rounded-full bg-white object-cover" />
        </div>
        <p className="mt-3.5 text-xs opacity-85">สมาชิกตั้งแต่ {formatThaiDate(member.registered_at)}</p>
      </header>

      <div className="-mt-[52px] flex flex-col gap-3 px-3.5">
        <div
          className="grid grid-cols-[1fr_1px_1fr] rounded-[20px] bg-white"
          style={{ boxShadow: '0 8px 24px -12px rgba(60,30,10,0.2)' }}
        >
          <Stat value={loading ? '—' : activeItems.length} label="ประกันที่ใช้งานอยู่" color="var(--ht-success)" />
          <div className="my-3.5 bg-[var(--ht-divider)]" />
          <Stat value={loading ? '—' : nearExpiry.length} label="ใกล้หมดประกัน (60 วัน)" color="var(--ht-warning)" />
        </div>

        {pendingCount > 0 && (
          <Link
            href="/warranty"
            className="flex items-center gap-3 rounded-2xl bg-[var(--ht-returning-bg)] px-4 py-3.5 text-[var(--ht-returning)]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ht-returning)]" />
            <span className="flex-1 text-[13px]">มี {pendingCount} รายการรอตรวจสอบ — แตะเพื่อดูสถานะ</span>
            <span aria-hidden className="text-sm">
              ›
            </span>
          </Link>
        )}

        <Link href="/register?new=1" className={`${primaryButtonClass} h-14`}>
          <span className="text-xl leading-none">+</span>ลงทะเบียนสินค้าเพิ่ม
        </Link>

        <div className="flex items-baseline justify-between px-1 pt-2">
          <span className="text-[15px] font-semibold text-[var(--ht-ink)]">สินค้าที่รับประกัน</span>
          <Link href="/warranty" className="text-[13px] text-[var(--ht-deep)]">
            ดูทั้งหมด
          </Link>
        </div>

        <div className="flex flex-col rounded-[20px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
          {!loading && listed.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--ht-text-3)]">ยังไม่มีสินค้าที่รับประกัน</p>
          )}
          {listed.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3.5"
              style={i < listed.length - 1 ? { borderBottom: '1px solid var(--ht-row-divider)' } : undefined}
            >
              <div
                className="h-11 w-11 shrink-0 rounded-xl"
                style={{ background: 'repeating-linear-gradient(135deg,#f7efe8 0 6px,#f1e6dc 6px 12px)' }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-[var(--ht-ink)]">{item.product_name ?? item.sku ?? 'สินค้า'}</span>
                <span className="text-xs text-[var(--ht-text-4)]">ถึง {formatThaiDate(item.warranty_end)}</span>
              </div>
              <ItemStatusBadge status={item.status} daysLeft={item.warranty_end ? daysUntil(item.warranty_end) : null} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="flex flex-col gap-1 p-[18px]">
      <span className="text-[30px] leading-none font-semibold" style={{ color }}>
        {value}
      </span>
      <span className="text-xs text-[var(--ht-text-3)]">{label}</span>
    </div>
  )
}
