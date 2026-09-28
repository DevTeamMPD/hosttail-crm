'use client'

import { useState } from 'react'
import { ProvinceSelect, type ProvinceOption } from '../../register/province-select'
import { PetPicker } from '../../register/pet-picker'
import { useMember } from '../member-context'
import { liffFetch, type LiffMemberPublic } from '@/lib/liff/client'
import { UpdateProfileSchema } from '@/lib/orders/profile-schema'
import type { PetType } from '@/lib/brand'
import { CARD_SHADOW, Card, Field, StickyBar, fieldClass, primaryButtonClass } from '../../ui'

interface Props {
  provinces: ProvinceOption[]
}

type FieldErrors = Partial<Record<'provinceCode' | 'petTypes' | 'petOther' | 'note', string>>

export function ProfileForm({ provinces }: Props) {
  const { member, setMember } = useMember()

  const [provinceCode, setProvinceCode] = useState(member.province_code ?? '')
  const [petTypes, setPetTypes] = useState<PetType[]>((member.pet_types as PetType[]) ?? [])
  const [petOther, setPetOther] = useState(member.pet_other ?? '')
  const [note, setNote] = useState(member.note ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    setSaved(false)
    setSaveError(null)
    const parsed = UpdateProfileSchema.safeParse({ provinceCode, petTypes, petOther, note })
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as keyof FieldErrors] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const res = await liffFetch('/api/liff/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const body = (await res.json()) as { member: LiffMemberPublic }
      setMember(body.member)
      setSaved(true)
    } catch (err) {
      console.error('[ProfileForm] save failed', err)
      setSaveError('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col rounded-[20px] bg-white px-[18px] py-1" style={{ boxShadow: CARD_SHADOW }}>
        <InfoRow label="ชื่อ-นามสกุล">
          <span className="font-medium">{member.full_name ?? '—'}</span>
        </InfoRow>
        <InfoRow label="เบอร์โทรศัพท์">
          <span className="font-ht-mono">{member.phone ?? '—'}</span>
        </InfoRow>
        <InfoRow label="บัญชี LINE" last>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--ht-line)]" />
            {member.line_display_name ?? '—'}
          </span>
        </InfoRow>
      </div>
      <span className="px-1.5 text-xs text-[var(--ht-text-4)]">ต้องการแก้ไขชื่อหรือเบอร์โทร ติดต่อทีมงาน Hosttail</span>

      <Card>
        <span className="text-[15px] font-semibold text-[var(--ht-ink)]">ที่อยู่ &amp; สัตว์เลี้ยง</span>
        <ProvinceSelect
          provinces={provinces}
          value={provinceCode}
          onChange={(v) => {
            setProvinceCode(v)
            setSaved(false)
          }}
          error={errors.provinceCode}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-[var(--ht-text-2)]">สัตว์เลี้ยง</span>
          <PetPicker
            value={petTypes}
            onChange={(v) => {
              setPetTypes(v)
              setSaved(false)
            }}
            petOther={petOther}
            onPetOtherChange={setPetOther}
            error={errors.petTypes ?? errors.petOther}
          />
        </div>
        <Field label="หมายเหตุ" htmlFor="profile-note">
          <textarea
            id="profile-note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              setSaved(false)
            }}
            rows={2}
            className={`${fieldClass} resize-none py-3`}
          />
        </Field>
      </Card>

      {saveError && (
        <p className="rounded-xl bg-[var(--ht-error-bg)] px-3 py-2.5 text-center text-sm text-[var(--ht-error)]">{saveError}</p>
      )}

      <StickyBar aboveNav>
        <button type="button" onClick={handleSave} disabled={saving} className={`${primaryButtonClass} h-[52px] shadow-none`}>
          {saving ? 'กำลังบันทึก...' : saved ? 'บันทึกแล้ว ✓' : 'บันทึกข้อมูล'}
        </button>
      </StickyBar>
    </div>
  )
}

function InfoRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      className="flex justify-between gap-3 py-3.5 text-sm text-[var(--ht-ink)]"
      style={last ? undefined : { borderBottom: '1px solid var(--ht-row-divider)' }}
    >
      <span className="text-[#8a7e75]">{label}</span>
      {children}
    </div>
  )
}
