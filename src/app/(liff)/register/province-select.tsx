'use client'

import { Field, fieldClass } from '../ui'

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
 * A native <select> styled as the design's field -- with 77 options the OS
 * picker is faster to scan on mobile than a custom dropdown, and keeps
 * label association and keyboard support for free.
 */
export function ProvinceSelect({ provinces, value, onChange, disabled, error }: Props) {
  const byRegion = new Map<string, ProvinceOption[]>()
  for (const p of provinces) {
    const list = byRegion.get(p.region) ?? []
    list.push(p)
    byRegion.set(p.region, list)
  }

  return (
    <Field label="จังหวัด" htmlFor="province-select" error={error}>
      <div className="relative">
        <select
          id="province-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${fieldClass} h-12 appearance-none pr-9`}
          style={{ color: value ? undefined : 'var(--ht-text-4)' }}
        >
          <option value="">เลือกจังหวัด</option>
          {[...byRegion.entries()].map(([region, list]) => (
            <optgroup key={region} label={REGION_LABEL_TH[region] ?? region}>
              {list.map((p) => (
                <option key={p.code} value={p.code} style={{ color: 'var(--ht-ink)' }}>
                  {p.name_th}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[11px] text-[var(--ht-text-4)]">
          ▼
        </span>
      </div>
    </Field>
  )
}
