'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { retryFailed, sendCampaignBatch } from './actions'

/**
 * Drives a "sending" campaign: calls sendCampaignBatch until nothing is
 * pending. Each call pushes a few hundred messages, so no request runs long;
 * closing the tab just pauses it -- "ส่งต่อ" picks up where it stopped.
 * The parent keys this on status + pending so a refresh resets the counters.
 */
export function SendProgress({
  campaignId,
  status,
  total,
  pending,
  failed,
  autoStart,
  canManage,
}: {
  campaignId: string
  status: string
  total: number
  pending: number
  failed: number
  autoStart: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(pending)
  const [message, setMessage] = useState('')
  const started = useRef(false)

  const run = useCallback(async () => {
    setRunning(true)
    setMessage('')
    try {
      for (;;) {
        const res = await sendCampaignBatch(campaignId)
        if (!res.ok) {
          setMessage(res.message)
          break
        }
        setLeft(res.remaining)
        if (res.done) break
      }
    } finally {
      setRunning(false)
      router.refresh()
    }
  }, [campaignId, router])

  useEffect(() => {
    if (autoStart && canManage && status === 'sending' && !started.current) {
      started.current = true
      // Drop ?go=1 so a reload does not look like a fresh "send" press.
      window.history.replaceState(null, '', `/marketing/${campaignId}`)
      void run()
    }
  }, [autoStart, canManage, status, campaignId, run])

  const done = total - left
  const pct = total ? Math.round((done / total) * 100) : 0

  if (status !== 'sending' && !failed) return null

  return (
    <div className="space-y-2 rounded-2xl border border-[var(--ht-primary)] bg-[#fff7ed] px-4 py-3 text-sm">
      {status === 'sending' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-gray-800">
              {running ? 'กำลังส่ง...' : 'ส่งยังไม่ครบ'} {done.toLocaleString()} / {total.toLocaleString()} คน
            </span>
            {canManage && !running && (
              <Button type="button" size="sm" className="text-white" style={{ background: 'var(--ht-line)' }} onClick={() => void run()}>
                ส่งต่อ
              </Button>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-[var(--ht-line)] transition-all" style={{ width: `${pct}%` }} />
          </div>
          {running && <p className="text-xs text-gray-500">อย่าเพิ่งปิดหน้านี้จนกว่าจะส่งครบ (ถ้าปิดไป กด “ส่งต่อ” ได้ภายหลัง ไม่มีใครได้ซ้ำ)</p>}
        </>
      )}
      {status !== 'sending' && failed > 0 && canManage && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-800">ส่งไม่สำเร็จ {failed.toLocaleString()} คน</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              const res = await retryFailed(campaignId)
              setMessage(res.message)
              if (res.ok) router.refresh()
            }}
          >
            ลองส่งใหม่
          </Button>
        </div>
      )}
      {message && <p className="text-xs text-[var(--ht-error)]">{message}</p>}
    </div>
  )
}
