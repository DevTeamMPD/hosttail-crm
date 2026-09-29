'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { approveManual, approveWarranty, rejectWarranty, type ManualItem } from './actions'

export interface BillOption {
  orderNo: string
  /** What approveWarranty is called with (the platform order id for a split bill). */
  ref: string
  /** Found through the member's phone rather than the number they typed. */
  viaPhone: boolean
  date: string | null
  amount: number | null
  products: string
}

interface Props {
  registration: {
    id: string
    channelLabel: string
    orderRef: string
    submittedAt: string
    slaDue: string | null
    sla: 'overdue' | 'today' | 'ok'
    attemptNo: number
    receiptUrl: string | null
    /** lookup: resolve a bill in sales_transaction. manual: type items off the receipt photo. */
    approval: 'lookup' | 'manual'
    /** Bills the system found for this claim (by order id, or by the member's phone). */
    options: BillOption[]
  }
  member: { id: string; name: string; phone: string | null }
  canAct: boolean
}

export function WarrantyCard({ registration: reg, member, canAct }: Props) {
  const [billNo, setBillNo] = useState(reg.options.length === 1 ? reg.options[0].ref : reg.orderRef)
  const [receiptNo, setReceiptNo] = useState(reg.orderRef)
  const [items, setItems] = useState<ManualItem[]>([{ sku: '', productName: '', quantity: 1 }])
  const [amount, setAmount] = useState('')
  const [useLookup, setUseLookup] = useState(reg.approval === 'lookup' || reg.options.length > 0)
  const approval = useLookup ? 'lookup' : 'manual'
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => setResult(await fn()))
  }

  if (result?.ok) {
    return (
      <div
        className="rounded-2xl border px-4 py-3 text-sm"
        style={{ background: 'var(--ht-success-bg)', borderColor: 'var(--ht-success)', color: 'var(--ht-success)' }}
      >
        {member.name} · {reg.orderRef} — {result.message}
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: reg.sla === 'overdue' ? 'var(--ht-error)' : reg.sla === 'today' ? 'var(--ht-warning)' : '#e5e7eb' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/customers/${member.id}`} className="text-sm font-medium" style={{ color: 'var(--ht-primary)' }}>
              {member.name}
            </Link>
            {reg.sla === 'overdue' && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
                เกินกำหนด
              </span>
            )}
            {reg.sla === 'today' && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: 'var(--ht-warning-bg)', color: 'var(--ht-warning)' }}>
                ครบกำหนดภายใน 24 ชม.
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {reg.channelLabel} · เลขที่กรอก <span className="font-mono">{reg.orderRef}</span>
            {member.phone ? ` · ${member.phone}` : ''}
          </p>
          <p className="text-[11px] text-gray-400">
            ส่งเมื่อ {reg.submittedAt}
            {reg.slaDue ? ` · ครบกำหนดตรวจ ${reg.slaDue}` : ''}
            {reg.attemptNo > 1 ? ` · ยื่นครั้งที่ ${reg.attemptNo}` : ''}
          </p>
        </div>
        {reg.receiptUrl && (
          <a
            href={reg.receiptUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            ดูรูปใบเสร็จ
          </a>
        )}
      </div>

      {approval === 'lookup' && reg.options.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-gray-500">บิลที่ระบบหาเจอ — กดเลือกแล้วตรวจก่อนอนุมัติ</p>
          {reg.options.some((o) => o.viaPhone) && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--ht-warning-bg)', color: 'var(--ht-warning)' }}>
              ไม่พบเลข {reg.orderRef} — บิลด้านล่างหาจากเบอร์โทรของลูกค้า ลูกค้าอาจเลือกช่องทางผิด ตรวจสินค้า/วันที่ให้ตรงก่อนอนุมัติ
            </p>
          )}
          {reg.options.map((o) => {
            const selected = billNo === o.ref
            return (
              <button
                key={o.orderNo}
                type="button"
                onClick={() => setBillNo(o.ref)}
                className="block w-full rounded-lg border px-3 py-2 text-left text-xs hover:bg-gray-50"
                style={selected ? { borderColor: 'var(--ht-primary)', background: 'var(--ht-bg-from)' } : undefined}
              >
                <span className="font-mono font-medium text-gray-900">{o.orderNo}</span>
                {o.ref !== o.orderNo ? <span className="font-mono text-gray-500"> · {o.ref}</span> : null}
                {o.date ? <span className="text-gray-500"> · {o.date}</span> : null}
                {o.amount !== null ? <span className="text-gray-500"> · ฿{o.amount.toLocaleString()}</span> : null}
                {o.products ? <span className="mt-0.5 block text-gray-500">{o.products}</span> : null}
              </button>
            )
          })}
        </div>
      )}
      {approval === 'lookup' && reg.options.length === 0 && (
        <p className="mt-2 text-xs text-gray-400">ระบบยังหาบิลไม่เจอ — ตรวจเลขที่ลูกค้ากรอก แล้วพิมพ์เลขบิลที่ถูกต้องเอง</p>
      )}

      {reg.approval === 'manual' && canAct && mode === 'idle' && (
        <button
          type="button"
          onClick={() => setUseLookup((v) => !v)}
          className="mt-2 text-xs underline"
          style={{ color: 'var(--ht-primary)' }}
        >
          {useLookup ? 'ไม่มีในระบบขาย — กรอกสินค้าจากรูปใบเสร็จแทน' : 'มีเลขบิลในระบบขาย? จับคู่เลขบิลแทน'}
        </button>
      )}

      {result && !result.ok && (
        <p className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          {result.message}
        </p>
      )}

      {canAct && mode === 'idle' && approval === 'manual' && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">ใบเสร็จนี้ไม่มีในระบบขาย — ดูรูปใบเสร็จแล้วกรอกสินค้าเอง</p>
          <Input
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="เลขที่ใบเสร็จ"
            className="w-56 font-mono"
          />
          {items.map((it, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                value={it.sku}
                onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}
                placeholder="SKU"
                className="w-40 font-mono"
              />
              <Input
                value={it.productName}
                onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, productName: e.target.value } : x)))}
                placeholder="ชื่อสินค้า"
                className="min-w-48 flex-1"
              />
              <Input
                type="number"
                min={1}
                value={it.quantity}
                onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                className="w-20"
                aria-label="จำนวน"
              />
              {items.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                  ลบ
                </Button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setItems((xs) => [...xs, { sku: '', productName: '', quantity: 1 }])}
            >
              + เพิ่มสินค้า
            </Button>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="ยอดเงิน (ไม่บังคับ)"
              className="w-44"
            />
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveManual(reg.id, receiptNo, items, amount.trim() ? Number(amount) : null))}
              className="text-white"
              style={{ background: 'var(--ht-success)' }}
            >
              {pending ? 'กำลังบันทึก...' : 'อนุมัติ'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMode('rejecting')}>
              ปฏิเสธ
            </Button>
          </div>
        </div>
      )}

      {canAct && mode === 'idle' && approval === 'lookup' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={billNo}
            onChange={(e) => setBillNo(e.target.value)}
            placeholder="เลขบิลที่ถูกต้อง"
            className="w-56 font-mono"
          />
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => approveWarranty(reg.id, billNo))}
            className="text-white"
            style={{ background: 'var(--ht-success)' }}
          >
            {pending ? 'กำลังตรวจสอบ...' : 'อนุมัติ'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode('rejecting')}>
            ปฏิเสธ
          </Button>
        </div>
      )}

      {canAct && mode === 'rejecting' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผล (ลูกค้าจะเห็นข้อความนี้)"
            className="w-72"
          />
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => rejectWarranty(reg.id, reason))}
            variant="destructive"
          >
            {pending ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
            ยกเลิก
          </Button>
        </div>
      )}
    </div>
  )
}
