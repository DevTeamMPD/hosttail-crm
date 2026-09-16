'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { approveWarranty, rejectWarranty } from './actions'

interface Props {
  registration: {
    id: string
    channelLabel: string
    orderRef: string
    submittedAt: string
    slaDue: string | null
    attemptNo: number
    receiptUrl: string | null
    candidates: string[]
  }
  member: { id: string; name: string; phone: string | null }
  canAct: boolean
}

export function WarrantyCard({ registration: reg, member, canAct }: Props) {
  const [billNo, setBillNo] = useState(reg.candidates[0] ?? reg.orderRef)
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
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/customers/${member.id}`} className="text-sm font-medium" style={{ color: 'var(--ht-primary)' }}>
            {member.name}
          </Link>
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

      {reg.candidates.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          ระบบเดาว่าอาจตรงกับบิล: {reg.candidates.join(', ')} — ยังต้องยืนยันเอง
        </p>
      )}

      {result && !result.ok && (
        <p className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          {result.message}
        </p>
      )}

      {canAct && mode === 'idle' && (
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
