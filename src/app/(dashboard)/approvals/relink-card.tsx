'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { approveRelink, rejectRelink } from './actions'

interface Props {
  request: {
    id: string
    claimedPhone: string
    origin: string
    requestedAt: string
    evidence: Record<string, unknown>
  }
  claimant: { id: string; name: string; isTest: boolean }
  legacy: { id: string; name: string; points: number }
  canAct: boolean
}

export function RelinkCard({ request, claimant, legacy, canAct }: Props) {
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const corroborated = request.evidence.claimant_uid_phone_matches_claim === true
  const rivals = Number(request.evidence.other_pending_claims ?? 0)

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => setResult(await fn()))
  }

  if (result?.ok) {
    return (
      <div
        className="rounded-2xl border px-4 py-3 text-sm"
        style={{ background: 'var(--ht-success-bg)', borderColor: 'var(--ht-success)', color: 'var(--ht-success)' }}
      >
        {claimant.name} → {legacy.name} — {result.message}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-800">
            <Link href={`/customers/${claimant.id}`} className="font-medium" style={{ color: 'var(--ht-primary)' }}>
              {claimant.name}
            </Link>
            <span className="text-gray-400"> ขอรับสิทธิ์บัญชีของ </span>
            <Link href={`/customers/${legacy.id}`} className="font-medium" style={{ color: 'var(--ht-primary)' }}>
              {legacy.name}
            </Link>
          </p>
          <p className="text-xs text-gray-500">
            เบอร์ที่อ้าง <span className="font-mono">{request.claimedPhone}</span> · แต้มที่จะโอน{' '}
            {legacy.points.toLocaleString()} · ยื่นเมื่อ {request.requestedAt} ·{' '}
            {request.origin === 'order_submit' ? 'ตอนลงทะเบียนออเดอร์' : 'กดปุ่มในแอป'}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {corroborated ? (
          <Badge text="✓ LINE ยืนยันว่าเบอร์นี้ตรงกับบัญชีผู้ขอ" color="var(--ht-success)" bg="var(--ht-success-bg)" />
        ) : (
          <Badge text="ไม่มีหลักฐานอื่นนอกจากเบอร์ที่พิมพ์เอง" color="var(--ht-warning)" bg="var(--ht-warning-bg)" />
        )}
        {rivals > 0 && <Badge text={`⚠ มีผู้ขออื่นอีก ${rivals} ราย`} color="var(--ht-error)" bg="#fdecea" />}
        {claimant.isTest && <Badge text="ผู้ขอเป็นบัญชีทดสอบ" color="var(--ht-warning)" bg="var(--ht-warning-bg)" />}
      </div>

      {result && !result.ok && (
        <p className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          {result.message}
        </p>
      )}

      {canAct && mode === 'idle' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => approveRelink(request.id))}
            className="text-white"
            style={{ background: 'var(--ht-success)' }}
          >
            {pending ? 'กำลังรวมบัญชี...' : 'อนุมัติและรวมบัญชี'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode('rejecting')}>
            ปฏิเสธ
          </Button>
        </div>
      )}

      {canAct && mode === 'rejecting' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล" className="w-72" />
          <Button type="button" disabled={pending} onClick={() => run(() => rejectRelink(request.id, reason))} variant="destructive">
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

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color, background: bg }}>
      {text}
    </span>
  )
}
