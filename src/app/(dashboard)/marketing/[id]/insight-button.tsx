'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { refreshInsight } from '../actions'

export function InsightButton({ campaignId }: { campaignId: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, startTransition] = useTransition()
  return (
    <span className="ml-auto inline-flex items-center gap-2">
      {message && (
        <span className="text-xs" style={{ color: message.ok ? 'var(--ht-success)' : 'var(--ht-error)' }}>
          {message.text}
        </span>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            const res = await refreshInsight(campaignId)
            setMessage({ ok: res.ok, text: res.message })
          })
        }
      >
        {busy ? 'กำลังดึง...' : 'ดึงสถิติจาก LINE'}
      </Button>
    </span>
  )
}
