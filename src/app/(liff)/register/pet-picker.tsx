'use client'

import { PET_TYPES, type PetType } from '@/lib/brand'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface Props {
  value: PetType[]
  onChange: (v: PetType[]) => void
  petOther: string
  onPetOtherChange: (v: string) => void
  disabled?: boolean
  error?: string
}

export function PetPicker({ value, onChange, petOther, onPetOtherChange, disabled, error }: Props) {
  const toggle = (v: PetType) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  const hasOther = value.includes('other')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {PET_TYPES.map((p) => (
          <label
            key={p.value}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-2 text-sm"
            style={disabled ? { opacity: 0.55 } : undefined}
          >
            <Checkbox
              checked={value.includes(p.value)}
              onCheckedChange={() => toggle(p.value)}
              disabled={disabled}
              id={`pet-${p.value}`}
            />
            <span>{p.label}</span>
          </label>
        ))}
      </div>

      {hasOther && (
        <div className="space-y-1">
          <Label htmlFor="pet-other-input">ระบุชนิดสัตว์เลี้ยง</Label>
          <Input
            id="pet-other-input"
            value={petOther}
            onChange={(e) => onPetOtherChange(e.target.value)}
            disabled={disabled}
            placeholder="เช่น เม่น"
            autoFocus
          />
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--ht-error)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
