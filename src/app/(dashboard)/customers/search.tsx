'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  initialQuery: string
  initialSource: string
  initialFrom: string
  initialTo: string
}

/** Today in Bangkok as YYYY-MM-DD, independent of the browser's timezone. */
function bangkokToday(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  return new Date(`${s}T00:00:00Z`)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = bangkokToday()
  d.setUTCDate(d.getUTCDate() - n)
  return iso(d)
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'วันนี้', range: () => [daysAgo(0), daysAgo(0)] },
  { label: '7 วัน', range: () => [daysAgo(6), daysAgo(0)] },
  { label: '30 วัน', range: () => [daysAgo(29), daysAgo(0)] },
  {
    label: 'เดือนนี้',
    range: () => {
      const d = bangkokToday()
      d.setUTCDate(1)
      return [iso(d), daysAgo(0)]
    },
  },
]

export function CustomerSearch({ initialQuery, initialSource, initialFrom, initialTo }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [source, setSource] = useState(initialSource)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)

  function go(next: { q?: string; source?: string; from?: string; to?: string } = {}) {
    const v = { q, source, from, to, ...next }
    const sp = new URLSearchParams()
    if (v.q?.trim()) sp.set('q', v.q.trim())
    if (v.source) sp.set('source', v.source)
    if (v.from) sp.set('from', v.from)
    if (v.to) sp.set('to', v.to)
    // Filters live in the URL so a result set can be shared or bookmarked,
    // and so paging keeps them without any client state.
    router.push(`/customers${sp.toString() ? `?${sp}` : ''}`)
  }

  const hasFilter = Boolean(initialQuery || initialSource || initialFrom || initialTo)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        go()
      }}
      className="flex flex-col items-end gap-2"
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ หรือเบอร์โทร" className="w-56" />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">ทุกที่มา</option>
          <option value="liff">สมัครผ่านแอป</option>
          <option value="legacy_sheet">สมาชิกเดิม</option>
        </select>
        <Button type="submit" variant="outline">
          ค้นหา
        </Button>
        {hasFilter && (
          <Button type="button" variant="ghost" onClick={() => router.push('/customers')}>
            ล้าง
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <span className="text-xs text-gray-500">วันที่สมัคร</span>
        {PRESETS.map((p) => {
          const [f, t] = p.range()
          const active = initialFrom === f && initialTo === t
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setFrom(f)
                setTo(t)
                go({ from: f, to: t })
              }}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={
                active
                  ? { background: 'var(--ht-primary)', borderColor: 'var(--ht-primary)', color: '#fff' }
                  : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }
              }
            >
              {p.label}
            </button>
          )
        })}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" aria-label="ตั้งแต่วันที่" />
        <span className="text-xs text-gray-400">ถึง</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" aria-label="ถึงวันที่" />
      </div>
    </form>
  )
}
