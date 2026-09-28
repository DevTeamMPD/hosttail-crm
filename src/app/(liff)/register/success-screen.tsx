'use client'

import { useRouter } from 'next/navigation'
import { channelMeta, type OrderChannel } from '@/lib/brand'
import { formatThaiDate } from '@/lib/format-th'
import { isInLineClient, closeLiffWindow } from '@/lib/liff/client'
import { CARD_SHADOW, Pill, primaryButtonClass } from '../ui'

interface Props {
  message: string
  status: 'active' | 'pending'
  channel: OrderChannel
  /** What the customer entered: order id, receipt number or phone. */
  orderRef: string
  /** When the warranty started: activation is counted from the submission date. */
  submittedAt: Date
}

/** "Hosttail Mobile Forms", screen 03. The customer picks where to go next; nothing auto-closes. */
export function SuccessScreen({ message, status, channel, orderRef, submittedAt }: Props) {
  const router = useRouter()
  const meta = channelMeta(channel)
  const active = status === 'active'
  // ht_warranty_items: warranty_start = submitted date, 365 days.
  const end = new Date(submittedAt)
  end.setDate(end.getDate() + 365)

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--ht-bg-from)]">
      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-7 py-10 text-center">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-full"
          style={{ background: active ? 'var(--ht-success-bg)' : 'var(--ht-returning-bg)' }}
        >
          {active ? (
            <div
              className="h-[22px] w-10 border-b-[5px] border-l-[5px]"
              style={{ borderColor: 'var(--ht-success)', transform: 'rotate(-45deg) translate(3px, -4px)' }}
            />
          ) : (
            <span className="font-ht-mono text-3xl font-semibold text-[var(--ht-returning)]">⋯</span>
          )}
        </div>
        <h2 className="mt-1.5 text-2xl font-semibold text-[var(--ht-ink)]">
          {active ? 'ลงทะเบียนรับประกันสำเร็จ!' : 'ได้รับเรื่องแล้ว'}
        </h2>
        <p className="max-w-[290px] text-sm leading-[1.7] text-[#6f635a]">
          {active ? 'ระบบพบคำสั่งซื้อของคุณแล้ว ประกันเริ่มนับจากวันที่ลงทะเบียน' : message}
        </p>
        <span
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={
            active
              ? { background: 'var(--ht-success-bg)', color: 'var(--ht-success)' }
              : { background: 'var(--ht-returning-bg)', color: 'var(--ht-returning)' }
          }
        >
          {active ? 'ประกันมีผลแล้ว' : 'รอตรวจสอบ'}
        </span>

        <div className="mt-3.5 flex w-full flex-col gap-2.5 rounded-[18px] bg-white p-4 text-left" style={{ boxShadow: CARD_SHADOW }}>
          <Row label="ช่องทาง">
            <span className="font-medium">{meta.label}</span>
          </Row>
          <Row label={meta.refKind === 'phone' ? 'เบอร์โทร' : meta.requiresReceipt ? 'เลขที่ใบเสร็จ' : 'เลขคำสั่งซื้อ'}>
            <span className="font-ht-mono">{orderRef}</span>
          </Row>
          {active ? (
            <Row label="หมดประกัน">
              <span className="font-medium">{formatThaiDate(end.toISOString())}</span>
            </Row>
          ) : (
            <Row label="สถานะ">
              <Pill tone="pend" small>
                ตรวจสอบภายใน 1–2 วันทำการ
              </Pill>
            </Row>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 px-5 pb-[calc(34px+env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => router.push('/home')} className={primaryButtonClass}>
          ไปที่หน้าหลัก
        </button>
        {isInLineClient() && (
          <button type="button" onClick={closeLiffWindow} className="text-[13px] text-[var(--ht-text-3)] underline">
            ปิดหน้าต่างนี้
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] text-[var(--ht-ink)]">
      <span className="text-[#8a7e75]">{label}</span>
      {children}
    </div>
  )
}
