'use client'

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addToManualSegment, removeFromManualSegment, type SegmentResult } from './actions'

interface Selection {
  selected: Set<string>
  toggle: (id: string) => void
  setMany: (ids: string[], on: boolean) => void
  clear: () => void
}

const SelectionContext = createContext<Selection | null>(null)

function useSelection(): Selection {
  const ctx = useContext(SelectionContext)
  if (!ctx) throw new Error('useSelection must be used inside <SelectionProvider>')
  return ctx
}

/** Ticked rows on /customers, shared by the row checkboxes and the bulk bar. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const value: Selection = {
    selected,
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    setMany: (ids, on) =>
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (on) next.add(id)
          else next.delete(id)
        }
        return next
      }),
    clear: () => setSelected(new Set()),
  }
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection()
  return (
    <input
      type="checkbox"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label={`เลือก ${label}`}
      className="h-4 w-4 cursor-pointer accent-[var(--ht-primary)]"
    />
  )
}

/** Ticks or unticks every row on the current page. */
export function SelectAllCheckbox({ ids }: { ids: string[] }) {
  const { selected, setMany } = useSelection()
  const all = ids.length > 0 && ids.every((id) => selected.has(id))
  return (
    <input
      type="checkbox"
      checked={all}
      disabled={!ids.length}
      onChange={() => setMany(ids, !all)}
      aria-label="เลือกทั้งหน้า"
      className="h-4 w-4 cursor-pointer accent-[var(--ht-primary)]"
    />
  )
}

const NEW = '__new__'

/**
 * Shown while any row is ticked: add the ticked customers to a manual group
 * (existing, or a new one named here), or -- when the list is showing one
 * manual group -- take them out of it.
 */
export function BulkBar({
  manualSegments,
  currentSeg,
}: {
  manualSegments: { id: string; name: string }[]
  /** The manual group the list is filtered to, if any. */
  currentSeg: { id: string; name: string } | null
}) {
  const { selected, clear } = useSelection()
  const [target, setTarget] = useState(manualSegments[0]?.id ?? NEW)
  const [newName, setNewName] = useState('')
  const [result, setResult] = useState<SegmentResult | null>(null)
  const [busy, startTransition] = useTransition()

  if (!selected.size && !result) return null

  const ids = [...selected]
  const run = (fn: () => Promise<SegmentResult>) =>
    startTransition(async () => {
      const res = await fn()
      setResult(res)
      if (res.ok) {
        clear()
        setNewName('')
      }
    })

  return (
    <div
      className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm shadow-sm"
      style={{ background: '#fff7ed', borderColor: 'var(--ht-primary)' }}
    >
      {selected.size > 0 && (
        <>
          <span className="font-medium text-gray-800">เลือก {selected.size} คน</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
            aria-label="กลุ่มที่จะเพิ่มเข้า"
          >
            {manualSegments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={NEW}>+ สร้างกลุ่มใหม่</option>
          </select>
          {target === NEW && (
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ชื่อกลุ่มใหม่ เช่น VIP"
              className="h-8 w-48 bg-white text-xs"
            />
          )}
          <Button
            type="button"
            disabled={busy}
            className="h-8 text-xs text-white"
            style={{ background: 'var(--ht-primary)' }}
            onClick={() => run(() => addToManualSegment(target === NEW ? null : target, newName, ids))}
          >
            {busy ? 'กำลังบันทึก...' : 'เพิ่มเข้ากลุ่ม'}
          </Button>
          {currentSeg && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-8 bg-white text-xs"
              onClick={() => run(() => removeFromManualSegment(currentSeg.id, ids))}
            >
              นำออกจาก &quot;{currentSeg.name}&quot;
            </Button>
          )}
          <Button type="button" variant="ghost" className="h-8 text-xs" onClick={clear}>
            ยกเลิกที่เลือก
          </Button>
        </>
      )}
      {result && (
        <span className="text-xs" style={{ color: result.ok ? 'var(--ht-success)' : 'var(--ht-error)' }}>
          {result.message}
        </span>
      )}
    </div>
  )
}
