'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PET_TYPES } from '@/lib/brand'
import { customerFiltersToParams, hasCustomerFilter, type CustomerFilters } from '@/lib/customer-filters'

interface Props {
  initial: CustomerFilters
  provinces: { code: string; name: string }[]
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

export function CustomerSearch({ initial, provinces }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [source, setSource] = useState(initial.source)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [pets, setPets] = useState(initial.pets)
  const [petMode, setPetMode] = useState(initial.petMode)
  const [provs, setProvs] = useState(initial.provinces)
  const initialFrom = initial.from
  const initialTo = initial.to
  const provinceName = new Map(provinces.map((p) => [p.code, p.name]))

  function go(next: Partial<CustomerFilters> = {}) {
    const sp = customerFiltersToParams({ q, source, from, to, pets, petMode, provinces: provs, seg: initial.seg, ...next })
    // Filters live in the URL so a result set can be shared or bookmarked,
    // and so paging keeps them without any client state.
    router.push(`/customers${sp.toString() ? `?${sp}` : ''}`)
  }

  function togglePet(value: string) {
    const nextPets = pets.includes(value) ? pets.filter((p) => p !== value) : [...pets, value]
    setPets(nextPets)
    go({ pets: nextPets })
  }

  function setProvinces(next: string[]) {
    setProvs(next)
    go({ provinces: next })
  }

  const hasFilter = hasCustomerFilter(initial)

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
      <div className="flex flex-wrap items-center justify-end gap-1.5 text-sm">
        <span className="text-xs text-gray-500">สัตว์เลี้ยง</span>
        {PET_TYPES.map((p) => (
          <Chip key={p.value} active={pets.includes(p.value)} onClick={() => togglePet(p.value)}>
            {p.label}
          </Chip>
        ))}
        {pets.length > 1 && (
          <select
            value={petMode}
            onChange={(e) => {
              const mode = e.target.value === 'all' ? 'all' : 'any'
              setPetMode(mode)
              go({ petMode: mode })
            }}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
            aria-label="เงื่อนไขสัตว์เลี้ยง"
          >
            <option value="any">มีอย่างใดอย่างหนึ่ง</option>
            <option value="all">มีครบทุกอย่าง</option>
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 text-sm">
        <span className="text-xs text-gray-500">จังหวัด</span>
        {provs.map((code) => (
          <Chip key={code} active onClick={() => setProvinces(provs.filter((c) => c !== code))}>
            {provinceName.get(code) ?? code} ×
          </Chip>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && setProvinces([...provs, e.target.value])}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
          aria-label="เพิ่มจังหวัด"
        >
          <option value="">+ เพิ่มจังหวัด</option>
          {provinces
            .filter((p) => !provs.includes(p.code))
            .map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
    </form>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-xs"
      style={
        active
          ? { background: 'var(--ht-primary)', borderColor: 'var(--ht-primary)', color: '#fff' }
          : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }
      }
    >
      {children}
    </button>
  )
}
