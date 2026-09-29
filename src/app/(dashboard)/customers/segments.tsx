'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSegment, deleteSegment, type SegmentResult } from './actions'

interface Segment {
  id: string
  name: string
  /** Hand-picked members (ht_segment_members) rather than a saved filter. */
  manual: boolean
  query: string
}

/**
 * Saved segments: each is a named set of /customers filters (e.g. สุนัข +
 * กรุงเทพ), so clicking one just opens the list with those filters. Membership
 * is always live -- see the ht_segments migration.
 */
export function SegmentBar({
  segments,
  currentQuery,
  canManage,
}: {
  segments: Segment[]
  currentQuery: string
  canManage: boolean
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [result, setResult] = useState<SegmentResult | null>(null)
  const [busy, startTransition] = useTransition()

  const activeId = currentQuery ? segments.find((s) => s.query === currentQuery)?.id : undefined
  // A filter segment can't be saved on top of a manual group's view.
  const canSave = canManage && currentQuery !== '' && !activeId && !new URLSearchParams(currentQuery).has('seg')

  if (!segments.length && !canSave && !result) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
      <span className="mr-1 text-xs font-medium text-gray-500">กลุ่มลูกค้า</span>
      {!segments.length && <span className="text-xs text-gray-400">ยังไม่มีกลุ่ม</span>}
      {segments.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
          style={
            s.id === activeId
              ? { background: 'var(--ht-primary)', borderColor: 'var(--ht-primary)', color: '#fff' }
              : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }
          }
        >
          <Link href={s.id === activeId ? '/customers' : `/customers?${s.query}`} title={s.manual ? 'กลุ่มที่เลือกเอง' : 'กลุ่มจากตัวกรอง'}>
            {s.manual ? '👥 ' : ''}
            {s.name}
          </Link>
          {canManage && (
            <button
              type="button"
              disabled={busy}
              aria-label={`ลบกลุ่ม ${s.name}`}
              className="opacity-60 hover:opacity-100"
              onClick={() => {
                if (!confirm(`ลบกลุ่ม "${s.name}"? (ไม่กระทบข้อมูลลูกค้า)`)) return
                startTransition(async () => setResult(await deleteSegment(s.id)))
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {canManage && activeId && (
        <Link href={`/marketing/new?segment=${activeId}`} className="ml-1 text-xs font-medium" style={{ color: 'var(--ht-line)' }}>
          ส่ง LINE ถึงกลุ่มนี้ →
        </Link>
      )}

      {canSave &&
        (naming ? (
          <span className="inline-flex items-center gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อกลุ่ม เช่น สุนัข กรุงเทพ"
              className="h-8 w-52 text-xs"
              autoFocus
            />
            <Button
              type="button"
              disabled={busy}
              className="h-8 text-xs text-white"
              style={{ background: 'var(--ht-primary)' }}
              onClick={() =>
                startTransition(async () => {
                  const res = await createSegment(name, currentQuery)
                  setResult(res)
                  if (res.ok) {
                    setNaming(false)
                    setName('')
                  }
                })
              }
            >
              บันทึก
            </Button>
            <Button type="button" variant="ghost" className="h-8 text-xs" onClick={() => setNaming(false)}>
              ยกเลิก
            </Button>
          </span>
        ) : (
          <Button type="button" variant="outline" className="h-7 text-xs" onClick={() => { setNaming(true); setResult(null) }}>
            + บันทึกตัวกรองนี้เป็นกลุ่ม
          </Button>
        ))}

      {result && (
        <span className="text-xs" style={{ color: result.ok ? 'var(--ht-success)' : 'var(--ht-error)' }}>
          {result.message}
        </span>
      )}
    </div>
  )
}
