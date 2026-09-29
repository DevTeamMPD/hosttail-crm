'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CONNECTABLE_PLATFORMS, type ConnectablePlatform } from '@/lib/orders/bound-orders'
import { CHANNELS } from '@/lib/brand'
import {
  addManualWarranty,
  confirmConnect,
  editRegistration,
  previewConnect,
  registerBoundOrder,
  revokeBinding,
  type ConnectPreview,
  type ConnectResult,
  type ManualWarrantyItem,
} from './actions'

function Notice({ result }: { result: ConnectResult | null }) {
  if (!result) return null
  return (
    <p
      className="rounded-lg px-3 py-2 text-xs"
      style={
        result.ok
          ? { background: 'var(--ht-success-bg)', color: 'var(--ht-success)' }
          : { background: '#fdecea', color: 'var(--ht-error)' }
      }
    >
      {result.message}
    </p>
  )
}

/**
 * Connect a Shopee / Lazada / TikTok buyer account in two steps: find the
 * account behind one of the customer's order numbers, check the buyer name,
 * then confirm. Nothing is bound until the second click.
 */
export function ConnectAccount({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState<ConnectablePlatform>('shopee')
  const [orderRef, setOrderRef] = useState('')
  const [preview, setPreview] = useState<ConnectPreview | null>(null)
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setPreview(null)
    setResult(null)
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="text-xs">
        + เชื่อมต่อบัญชี Shopee / Lazada / TikTok
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap gap-1.5">
        {CONNECTABLE_PLATFORMS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              setPlatform(p.value)
              reset()
            }}
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={
              platform === p.value
                ? { background: 'var(--ht-primary)', borderColor: 'var(--ht-primary)', color: '#fff' }
                : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={orderRef}
          onChange={(e) => {
            setOrderRef(e.target.value)
            reset()
          }}
          placeholder="เลขคำสั่งซื้อของลูกค้า 1 ออเดอร์"
          className="w-64 bg-white font-mono"
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || !orderRef.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await previewConnect(memberId, platform, orderRef)
              setResult(r.ok ? null : r)
              setPreview(r.ok ? (r.preview ?? null) : null)
            })
          }
        >
          {pending && !preview ? 'กำลังค้นหา...' : 'ค้นหาบัญชี'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setOrderRef('')
            reset()
          }}
        >
          ปิด
        </Button>
      </div>

      {preview && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <p className="text-xs text-gray-500">ตรวจชื่อผู้ซื้อว่าเป็นลูกค้าคนนี้ก่อนยืนยัน</p>
          <p className="text-gray-900">
            {preview.shop} · <span className="font-medium">{preview.accountName ?? '(ไม่มีชื่อ)'}</span>
          </p>
          <p className="text-xs text-gray-500">
            บัญชี <span className="font-mono">{preview.accountNo}</span> · มีออเดอร์ {preview.orderCount} รายการ
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await confirmConnect(memberId, platform, orderRef)
                setResult(r)
                if (r.ok) {
                  setPreview(null)
                  setOrderRef('')
                }
              })
            }
            className="text-white"
            style={{ background: 'var(--ht-success)' }}
          >
            {pending ? 'กำลังผูก...' : 'ยืนยันผูกบัญชี'}
          </Button>
        </div>
      )}

      <Notice result={result} />
    </div>
  )
}

export function RevokeBinding({ bindingId, memberId }: { bindingId: string; memberId: string }) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [pending, startTransition] = useTransition()

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="text-xs text-gray-400 underline hover:text-gray-600">
        ยกเลิกผูก
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล" className="h-8 w-40 text-xs" />
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await revokeBinding(bindingId, memberId, reason)))}
        className="h-8 text-xs"
      >
        ยืนยัน
      </Button>
      <Button type="button" variant="ghost" onClick={() => setAsking(false)} className="h-8 text-xs">
        ไม่
      </Button>
      {result && !result.ok && <span className="text-xs" style={{ color: 'var(--ht-error)' }}>{result.message}</span>}
    </div>
  )
}

export function RegisterOrderButton({ memberId, orderNo }: { memberId: string; orderNo: string }) {
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [pending, startTransition] = useTransition()
  if (result?.ok) return <span className="text-xs" style={{ color: 'var(--ht-success)' }}>ลงทะเบียนแล้ว</span>
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await registerBoundOrder(memberId, orderNo)))}
        className="h-8 text-xs"
      >
        {pending ? 'กำลังบันทึก...' : 'ลงทะเบียนรับประกัน'}
      </Button>
      {result && !result.ok && <span className="text-[11px]" style={{ color: 'var(--ht-error)' }}>{result.message}</span>}
    </div>
  )
}

export interface PendingRegistration {
  id: string
  label: string
  orderRef: string
}

const EMPTY_ITEM: ManualWarrantyItem = { sku: '', productName: '', quantity: 1, price: null }

/**
 * For orders that cannot be matched in the sales system however they are
 * searched: the admin types order / SKU / product / price themselves, either
 * approving one of the customer's pending registrations or adding a new one.
 */
export function ManualWarranty({ memberId, pending: pendingRegs }: { memberId: string; pending: PendingRegistration[] }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>(pendingRegs[0]?.id ?? 'new')
  const [channel, setChannel] = useState('shopee')
  const [orderNo, setOrderNo] = useState(pendingRegs[0]?.orderRef ?? '')
  const [items, setItems] = useState<ManualWarrantyItem[]>([EMPTY_ITEM])
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [busy, startTransition] = useTransition()

  const total = items.reduce((sum, i) => sum + (i.price ?? 0), 0)
  const setItem = (idx: number, patch: Partial<ManualWarrantyItem>) =>
    setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, ...patch } : x)))

  function pickTarget(value: string) {
    setTarget(value)
    setOrderNo(pendingRegs.find((r) => r.id === value)?.orderRef ?? '')
  }

  function submit() {
    startTransition(async () => {
      const res = await addManualWarranty(memberId, {
        registrationId: target === 'new' ? null : target,
        channel,
        orderNo,
        items,
      })
      setResult(res)
      if (res.ok) {
        setItems([EMPTY_ITEM])
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" onClick={() => { setOpen(true); setResult(null) }} className="h-8 text-xs">
          + กรอกข้อมูลรับประกันเอง
        </Button>
        <Notice result={result} />
      </div>
    )
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-gray-500">ใช้เมื่อหาออเดอร์ในระบบขายไม่เจอ — กรอกเลขคำสั่งซื้อ SKU ชื่อสินค้า และราคาเอง</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={target}
          onChange={(e) => pickTarget(e.target.value)}
          className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
          aria-label="รายการ"
        >
          {pendingRegs.map((r) => (
            <option key={r.id} value={r.id}>
              อนุมัติรายการรอตรวจ: {r.label}
            </option>
          ))}
          <option value="new">เพิ่มรายการใหม่</option>
        </select>
        {target === 'new' && (
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
            aria-label="ช่องทาง"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="เลขคำสั่งซื้อ" className="w-56 font-mono" />
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input value={it.sku} onChange={(e) => setItem(i, { sku: e.target.value })} placeholder="SKU" className="w-40 font-mono" />
          <Input
            value={it.productName}
            onChange={(e) => setItem(i, { productName: e.target.value })}
            placeholder="ชื่อสินค้า"
            className="min-w-48 flex-1"
          />
          <Input
            type="number"
            min={1}
            value={it.quantity}
            onChange={(e) => setItem(i, { quantity: Number(e.target.value) })}
            className="w-20"
            aria-label="จำนวน"
          />
          <Input
            type="number"
            min={0}
            value={it.price ?? ''}
            onChange={(e) => setItem(i, { price: e.target.value.trim() ? Number(e.target.value) : null })}
            placeholder="ราคา (บาท)"
            className="w-32"
          />
          {items.length > 1 && (
            <Button type="button" variant="ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
              ลบ
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setItems((xs) => [...xs, EMPTY_ITEM])}>
          + เพิ่มสินค้า
        </Button>
        <span className="text-xs text-gray-500">รวม ฿{total.toLocaleString()}</span>
        <Button type="button" disabled={busy} onClick={submit} className="text-white" style={{ background: 'var(--ht-success)' }}>
          {busy ? 'กำลังบันทึก...' : 'บันทึกรับประกัน'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          ยกเลิก
        </Button>
      </div>
      <Notice result={result} />
    </div>
  )
}

/**
 * Fix what the customer typed on a registration: the channel (e.g. picked
 * Shopee when the bill is really from Facebook), the order number, and the
 * admin note. Matched bill, items, points and warranty dates are untouched.
 */
export function EditRegistration({
  memberId,
  registrationId,
  channel: initialChannel,
  orderRef: initialOrderRef,
  note: initialNote,
}: {
  memberId: string
  registrationId: string
  channel: string
  orderRef: string
  note: string | null
}) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState(initialChannel)
  const [orderRef, setOrderRef] = useState(initialOrderRef)
  const [note, setNote] = useState(initialNote ?? '')
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [busy, startTransition] = useTransition()

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            setChannel(initialChannel)
            setOrderRef(initialOrderRef)
            setNote(initialNote ?? '')
            setResult(null)
            setOpen(true)
          }}
          className="text-xs text-gray-400 underline hover:text-gray-600"
        >
          แก้ไข
        </button>
        {result?.ok && <span className="text-[11px]" style={{ color: 'var(--ht-success)' }}>{result.message}</span>}
      </div>
    )
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
          aria-label="ช่องทาง"
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <Input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="เลขคำสั่งซื้อ" className="w-56 bg-white font-mono" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ" className="min-w-48 flex-1 bg-white" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const res = await editRegistration(memberId, registrationId, { channel, orderRef, note })
              setResult(res)
              if (res.ok) setOpen(false)
            })
          }
          className="h-8 text-xs text-white"
          style={{ background: 'var(--ht-primary)' }}
        >
          {busy ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-8 text-xs">
          ยกเลิก
        </Button>
        <span className="text-[11px] text-gray-400">แก้เฉพาะข้อมูลที่ลูกค้ากรอก — บิลที่จับคู่ สินค้า และวันรับประกันไม่เปลี่ยน</span>
      </div>
      <Notice result={result} />
    </div>
  )
}
