'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function CustomerSearch({ initialQuery, initialSource }: { initialQuery: string; initialSource: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [source, setSource] = useState(initialSource)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (source) sp.set('source', source)
    // Filters live in the URL so a result set can be shared or bookmarked,
    // and so paging keeps them without any client state.
    router.push(`/customers${sp.toString() ? `?${sp}` : ''}`)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาชื่อ หรือเบอร์โทร"
        className="w-56"
      />
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
      {(initialQuery || initialSource) && (
        <Button type="button" variant="ghost" onClick={() => router.push('/customers')}>
          ล้าง
        </Button>
      )}
    </form>
  )
}
