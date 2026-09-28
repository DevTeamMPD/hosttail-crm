'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { liffFetch } from '@/lib/liff/client'

/**
 * "I was already a member" -- for the 72 legacy members whose old line_uid
 * belongs to a LINE provider this app can no longer see (see
 * supabase/migrations/20260915101500_ht_merge_members.sql).
 *
 * This files a claim for an admin to approve; it deliberately does NOT merge
 * and show the old account straight away. Typing a phone number that exists
 * in our records is not proof of owning it, and doing the merge on the spot
 * let a tester absorb a real customer's account in production on 2026-09-15.
 */
export function CheckLegacyMember() {
  const [expanded, setExpanded] = useState(false)
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'queued' | 'not_found' | 'error'>('idle')

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
      setStatus('queued')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'queued') {
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{ background: 'var(--ht-returning-bg)', color: 'var(--ht-returning)' }}
      >
        ✅ ส่งคำขอเชื่อมข้อมูลสมาชิกเดิมแล้ว ทีมงานจะตรวจสอบภายใน 1–2 วันทำการ
        <br />
        <span className="text-xs opacity-80">ระหว่างนี้ลงทะเบียนสินค้าใหม่ได้ตามปกติ แต้มจะรวมให้หลังตรวจสอบเสร็จ</span>
      </div>
    )
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-dashed px-4 py-3 text-center text-sm text-gray-500"
        style={{ borderColor: 'var(--ht-primary)' }}
      >
        เคยเป็นสมาชิกแล้ว? <span style={{ color: 'var(--ht-primary)' }}>แจ้งเชื่อมข้อมูลเดิม</span>
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
      <p className="text-xs text-gray-400">
        ทีมงานจะตรวจสอบก่อนเชื่อมข้อมูลให้ เพื่อความปลอดภัยของบัญชีสมาชิก
      </p>
      {status === 'not_found' && (
        <p className="text-xs" style={{ color: 'var(--ht-error)' }}>
          ไม่พบข้อมูลสมาชิกเดิมด้วยเบอร์นี้ — ลงทะเบียนเป็นสมาชิกใหม่ได้เลยด้านล่าง
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs" style={{ color: 'var(--ht-error)' }}>
          ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={handleCheck} disabled={status === 'checking'} className="flex-1">
          {status === 'checking' ? 'กำลังส่งคำขอ...' : 'ส่งคำขอ'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setExpanded(false)}>
          ยกเลิก
        </Button>
      </div>
    </div>
  )
}
