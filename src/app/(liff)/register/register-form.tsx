'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ChannelTabs } from './channel-tabs'
import { GuideAccordion } from './guide-accordion'
import { PetPicker } from './pet-picker'
import { ProvinceSelect, type ProvinceOption } from './province-select'
import { ReceiptUpload } from './receipt-upload'
import { TermsDialog } from './terms-dialog'
import { SuccessScreen } from './success-screen'
import { SubmitRegistrationSchema } from '@/lib/orders/schema'
import { channelMeta, type OrderChannel, type PetType } from '@/lib/brand'
import { liffFetch, type LiffMemberPublic } from '@/lib/liff/client'

interface Props {
  member: LiffMemberPublic
  provinces: ProvinceOption[]
  termsBody: string
}

interface FormState {
  fullName: string
  phone: string
  provinceCode: string
  petTypes: PetType[]
  petOther: string
  note: string
  channel: OrderChannel
  orderRef: string
  receiptObjectKey: string | null
  termsAccepted: boolean
}

type FieldErrors = Partial<Record<keyof FormState, string>>

export function RegisterForm({ member, provinces, termsBody }: Props) {
  const isReturning = Boolean(member.full_name && member.phone)

  const [form, setForm] = useState<FormState>({
    fullName: member.full_name ?? '',
    phone: member.phone ?? '',
    provinceCode: member.province_code ?? '',
    petTypes: (member.pet_types as PetType[]) ?? [],
    petOther: member.pet_other ?? '',
    note: '',
    channel: 'shopee',
    orderRef: '',
    receiptObjectKey: null,
    termsAccepted: false,
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [termsOpen, setTermsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: 'active' | 'pending'; message: string } | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const meta = channelMeta(form.channel)

  // Facebook/LINE: the order-lookup value IS the member's own contact phone
  // -- keep it locked to that field rather than asking for it twice, which
  // also makes the server's ownership check (orderRef must equal phone)
  // trivially satisfied instead of a confusing rejection.
  const orderRefValue = meta.refKind === 'phone' ? form.phone : form.orderRef

  async function handleSubmit() {
    setSubmitError(null)
    const payload = {
      fullName: form.fullName,
      phone: form.phone,
      provinceCode: form.provinceCode,
      petTypes: form.petTypes,
      petOther: form.petOther || undefined,
      note: form.note || undefined,
      channel: form.channel,
      orderRef: orderRefValue,
      receiptObjectKey: form.receiptObjectKey ?? undefined,
      termsAccepted: form.termsAccepted ? (true as const) : undefined,
    }

    const parsed = SubmitRegistrationSchema.safeParse(payload)
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | 'orderRef'
        if (key === 'orderRef') fieldErrors.orderRef = issue.message
        else fieldErrors[key as keyof FormState] = issue.message
      }
      setErrors(fieldErrors)
      // Scroll to the first invalid field, mirroring the legacy page's UX.
      const firstKey = Object.keys(fieldErrors)[0]
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const res = await liffFetch('/api/liff/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) throw new Error('ออเดอร์นี้เคยลงทะเบียนไว้แล้ว')
        if (res.status === 422) throw new Error('กรุณาแนบรูปใบเสร็จ')
        if (res.status === 403) throw new Error(body.message ?? 'เบอร์โทรไม่ตรงกับที่ลงทะเบียนไว้')
        throw new Error(body.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
      }
      setResult({ status: body.status, message: body.message })
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) return <SuccessScreen status={result.status} message={result.message} />

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      className="space-y-5 p-4 pb-10"
    >
      {isReturning && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ background: 'var(--ht-returning-bg)', borderColor: 'var(--ht-returning)', color: 'var(--ht-returning)' }}
        >
          ยินดีต้อนรับกลับมา, {member.full_name} · แต้มสะสม {member.points_balance.toLocaleString()} แต้ม
        </div>
      )}

      {/* ── ข้อมูลส่วนตัว ── */}
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ht-primary)' }}>
          👤 ข้อมูลส่วนตัว
        </h2>
        <div className="space-y-1" id="field-fullName">
          <Label htmlFor="fullName">ชื่อ-นามสกุล</Label>
          <Input
            id="fullName"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            disabled={isReturning}
            placeholder="ชื่อ นามสกุล"
          />
          {errors.fullName && <p className="text-xs" style={{ color: 'var(--ht-error)' }}>{errors.fullName}</p>}
        </div>
        <div className="space-y-1" id="field-phone">
          <Label htmlFor="phone">เบอร์โทรศัพท์</Label>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            disabled={isReturning}
            placeholder="เช่น 081-234-5678"
          />
          {errors.phone && <p className="text-xs" style={{ color: 'var(--ht-error)' }}>{errors.phone}</p>}
        </div>
      </section>

      {/* ── ช่องทาง + เลขคำสั่งซื้อ / เบอร์โทร ── */}
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ht-primary)' }}>
          📦 ช่องทางการสั่งซื้อ
        </h2>
        <ChannelTabs value={form.channel} onChange={(v) => set('channel', v)} />
        <GuideAccordion channel={form.channel} />

        {meta.refKind === 'order_id' && (
          <div className="space-y-1" id="field-orderRef">
            <Label htmlFor="orderRef">{meta.refLabel}</Label>
            <Input
              id="orderRef"
              value={form.orderRef}
              onChange={(e) => set('orderRef', e.target.value)}
              placeholder={meta.refPlaceholder}
            />
            {errors.orderRef && <p className="text-xs" style={{ color: 'var(--ht-error)' }}>{errors.orderRef}</p>}
          </div>
        )}
        {meta.refKind === 'phone' && (
          <p className="text-xs text-gray-500">
            ใช้เบอร์โทรศัพท์ที่กรอกด้านบน ({form.phone || '—'}) ในการค้นหาคำสั่งซื้อ
          </p>
        )}

        {meta.requiresReceipt && (
          <div id="field-receiptObjectKey">
            <ReceiptUpload
              hasFile={Boolean(form.receiptObjectKey)}
              onUploaded={(key) => set('receiptObjectKey', key)}
              onClear={() => set('receiptObjectKey', null)}
              error={errors.receiptObjectKey}
            />
          </div>
        )}
      </section>

      {/* ── สัตว์เลี้ยง ── */}
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" id="field-petTypes">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ht-primary)' }}>
          🐾 ข้อมูลสัตว์เลี้ยง
        </h2>
        <PetPicker
          value={form.petTypes}
          onChange={(v) => set('petTypes', v)}
          petOther={form.petOther}
          onPetOtherChange={(v) => set('petOther', v)}
          disabled={isReturning}
          error={errors.petTypes ?? errors.petOther}
        />
      </section>

      {/* ── เพิ่มเติม ── */}
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ht-primary)' }}>
          📍 ข้อมูลเพิ่มเติม
        </h2>
        <div id="field-provinceCode">
          <ProvinceSelect
            provinces={provinces}
            value={form.provinceCode}
            onChange={(v) => set('provinceCode', v)}
            disabled={isReturning}
            error={errors.provinceCode}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="note">💬 หมายเหตุ / ข้อความถึงร้าน (ไม่บังคับ)</Label>
          <Textarea id="note" value={form.note} onChange={(e) => set('note', e.target.value)} rows={3} />
        </div>
      </section>

      {/* ── ยอมรับเงื่อนไข ── */}
      <section className="rounded-2xl bg-white p-4 shadow-sm" id="field-termsAccepted">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.termsAccepted}
            onChange={(e) => {
              if (e.target.checked && !form.termsAccepted) {
                // First check always opens the modal -- reading it is
                // required before acceptance counts, matching the legacy
                // page's scroll-gated modal.
                setTermsOpen(true)
                return
              }
              set('termsAccepted', e.target.checked)
            }}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            ฉันได้อ่านและยอมรับ{' '}
            <button type="button" className="underline" style={{ color: 'var(--ht-primary)' }} onClick={() => setTermsOpen(true)}>
              เงื่อนไขการรับประกันสินค้า (รับประกัน 365 วันต่อชิ้น)
            </button>
          </span>
        </label>
        {errors.termsAccepted && <p className="mt-1 text-xs" style={{ color: 'var(--ht-error)' }}>{errors.termsAccepted}</p>}
      </section>

      <TermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        body={termsBody}
        onAccept={() => set('termsAccepted', true)}
      />

      {submitError && (
        <p className="rounded-lg px-3 py-2 text-center text-sm" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          {submitError}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full text-white"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary), var(--ht-deep))' }}
      >
        {submitting ? 'กำลังบันทึก...' : isReturning ? '📦 บันทึกคำสั่งซื้อใหม่' : 'ลงทะเบียนรับประกันสินค้า'}
      </Button>
    </form>
  )
}
