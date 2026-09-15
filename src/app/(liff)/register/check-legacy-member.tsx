'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { liffFetch, type LiffMemberPublic } from '@/lib/liff/client'

interface Props {
  onMerged: (member: LiffMemberPublic) => void
}

/**
 * "Check for an existing account" -- for the 72 real legacy members who get
 * a brand-new, historyless ht_members row the first time they open this
 * LIFF app under the org's LINE provider (their old line_uid belongs to a
 * different provider and can never appear again; see
 * supabase/migrations/20260915101500_ht_merge_members.sql). This lets them
 * recover their old warranty/points history by phone alone, without also
 * having to place a new order in the same request the way
 * submitRegistration() does it inline.
 */
export function CheckLegacyMember({ onMerged }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'not_found' | 'error'>('idle')

  async function handleCheck() {
    if (!phone.trim()) return
    setStatus('checking')
    try {
      const res = await liffFetch('/api/liff/relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (res.status === 404) {
        setStatus('not_found')
        return
      }
      if (!res.ok) {
        setStatus('error')
        return
      }
      const body = (await res.json()) as { member: LiffMemberPublic }
      setStatus('idle')
      setExpanded(false)
      onMerged(body.member)
    } catch {
      setStatus('error')
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-dashed px-4 py-3 text-center text-sm text-gray-500"
        style={{ borderColor: 'var(--ht-primary)' }}
      >
        เคยเป็นสมาชิกแล้ว? <span style={{ color: 'var(--ht-primary)' }}>ตรวจสอบข้อมูลเดิม</span>
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-700">กรอกเบอร์โทรศัพท์ที่เคยลงทะเบียนไว้</p>
      <Input
        type="tel"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value)
          setStatus('idle')
        }}
        placeholder="เช่น 081-234-5678"
      />
      {status === 'not_found' && (
        <p className="text-xs" style={{ color: 'var(--ht-error)' }}>
          ไม่พบข้อมูลสมาชิกเดิมด้วยเบอร์นี้ — ลงทะเบียนเป็นสมาชิกใหม่ได้เลยด้านล่าง
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs" style={{ color: 'var(--ht-error)' }}>
          ตรวจสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={handleCheck} disabled={status === 'checking'} className="flex-1">
          {status === 'checking' ? 'กำลังตรวจสอบ...' : 'ตรวจสอบ'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setExpanded(false)}>
          ยกเลิก
        </Button>
      </div>
    </div>
  )
}
