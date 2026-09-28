'use client'

import { PET_TYPES, type PetType } from '@/lib/brand'
import { FieldError, fieldClass } from '../ui'

interface Props {
  value: PetType[]
  onChange: (v: PetType[]) => void
  petOther: string
  onPetOtherChange: (v: string) => void
  disabled?: boolean
  error?: string
}

/** Pill toggles, multi-select. Selected = solid orange. */
export function PetPicker({ value, onChange, petOther, onPetOtherChange, disabled, error }: Props) {
  const toggle = (v: PetType) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const hasOther = value.includes('other')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PET_TYPES.map((p) => {
          const on = value.includes(p.value)
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(p.value)}
              className="h-10 rounded-full border-[1.5px] px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: on ? 'var(--ht-primary)' : 'var(--ht-border)',
                background: on ? 'var(--ht-primary)' : '#fff',
                color: on ? '#fff' : '#4a403a',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {hasOther && (
        <input
          aria-label="ระบุชนิดสัตว์เลี้ยง"
          value={petOther}
          onChange={(e) => onPetOtherChange(e.target.value)}
          disabled={disabled}
          placeholder="ระบุชนิดสัตว์เลี้ยง เช่น เม่น"
          className={`${fieldClass} h-12`}
        />
      )}

      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}
