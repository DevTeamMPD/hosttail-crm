'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CONNECTABLE_PLATFORMS, type ConnectablePlatform } from '@/lib/orders/bound-orders'
import {
  confirmConnect,
  previewConnect,
  registerBoundOrder,
  revokeBinding,
  type ConnectPreview,
  type ConnectResult,
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
