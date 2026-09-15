'use client'

import { Label } from '@/components/ui/label'

export interface ProvinceOption {
  code: string
  name_th: string
  region: string
}

interface Props {
  provinces: ProvinceOption[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  error?: string
}

const REGION_LABEL_TH: Record<string, string> = {
  Central: 'ภาคกลาง',
  North: 'ภาคเหนือ',
  Northeast: 'ภาคตะวันออกเฉียงเหนือ',
  East: 'ภาคตะวันออก',
  West: 'ภาคตะวันตก',
  South: 'ภาคใต้',
}

/**
 * A native <select> rather than a custom dropdown -- with 77 options, the
 * OS's own picker is faster to scan/search on mobile than reimplementing
 * one, and it's free accessibility (label association, keyboard, screen
 * reader) that a custom listbox would have to rebuild by hand.
 */
export function ProvinceSelect({ provinces, value, onChange, disabled, error }: Props) {
  const byRegion = new Map<string, ProvinceOption[]>()
  for (const p of provinces) {
    const list = byRegion.get(p.region) ?? []
    list.push(p)
    byRegion.set(p.region, list)
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="province-select">จังหวัด</Label>
      <select
        id="province-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm disabled:opacity-60"
      >
        <option value="">— เลือกจังหวัด —</option>
        {[...byRegion.entries()].map(([region, list]) => (
          <optgroup key={region} label={REGION_LABEL_TH[region] ?? region}>
            {list.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name_th}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && (
        <p className="text-xs" style={{ color: 'var(--ht-error)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
