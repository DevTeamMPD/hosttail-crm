'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ProvinceSelect, type ProvinceOption } from '../../register/province-select'
import { PetPicker } from '../../register/pet-picker'
import { useMember } from '../member-context'
import { liffFetch, type LiffMemberPublic } from '@/lib/liff/client'
import { UpdateProfileSchema } from '@/lib/orders/profile-schema'
import type { PetType } from '@/lib/brand'
import { formatThaiDate } from '@/lib/format-th'

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
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ht-primary)' }}>
          👤 ข้อมูลติดต่อ
        </h2>
        <div className="space-y-1">
          <Label>ชื่อ-นามสกุล</Label>
          <p className="text-sm text-gray-700">{member.full_name ?? '—'}</p>
        </div>
        <div className="space-y-1">
          <Label>เบอร์โทรศัพท์</Label>
          <p className="text-sm text-gray-700">{member.phone ?? '—'}</p>
        </div>
        <p className="text-xs text-gray-400">ต้องการแก้ไขชื่อหรือเบอร์โทร ติดต่อทีมงาน Hosttail</p>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ht-primary)' }}>
          📍 ที่อยู่ &amp; สัตว์เลี้ยง
        </h2>
        <ProvinceSelect provinces={provinces} value={provinceCode} onChange={setProvinceCode} error={errors.provinceCode} />
        <PetPicker
          value={petTypes}
          onChange={setPetTypes}
          petOther={petOther}
          onPetOtherChange={setPetOther}
          error={errors.petTypes ?? errors.petOther}
        />
        <div className="space-y-1">
          <Label htmlFor="profile-note">หมายเหตุ</Label>
          <Textarea id="profile-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--ht-primary)' }}>
          💬 บัญชี LINE
        </h2>
        <p className="text-sm text-gray-700">{member.line_display_name ?? '—'}</p>
        <p className="mt-1 text-xs text-gray-400">สมาชิกตั้งแต่ {formatThaiDate(member.registered_at)}</p>
      </section>

      {saveError && (
        <p className="rounded-lg px-3 py-2 text-center text-sm" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          {saveError}
        </p>
      )}
      {saved && (
        <p className="rounded-lg px-3 py-2 text-center text-sm" style={{ background: 'var(--ht-success-bg)', color: 'var(--ht-success)' }}>
          บันทึกข้อมูลเรียบร้อย
        </p>
      )}

      <Button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full text-white"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary), var(--ht-deep))' }}
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
      </Button>
    </div>
  )
}
