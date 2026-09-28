'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ChannelTabs } from './channel-tabs'
import { GuideAccordion } from './guide-accordion'
import { PetPicker } from './pet-picker'
import { ProvinceSelect, type ProvinceOption } from './province-select'
import { ReceiptUpload } from './receipt-upload'
import { TermsDialog } from './terms-dialog'
import { SuccessScreen } from './success-screen'
import { SubmitRegistrationSchema } from '@/lib/orders/schema'
import { channelMeta, PET_TYPES, type OrderChannel, type PetType } from '@/lib/brand'
import { liffFetch, type LiffMemberPublic } from '@/lib/liff/client'
import { invalidateWarrantyData } from '../(app)/use-warranty-data'
import { CARD_SHADOW, Card, CheckBox, Field, FieldError, SectionTitle, StickyBar, fieldClass, primaryButtonClass } from '../ui'

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
  /** Facebook/LINE: the customer confirms the order is under the phone above. */
  phoneConfirmed: boolean
  termsAccepted: boolean
}

type FieldErrors = Partial<Record<keyof FormState, string>>

const PET_LABEL = new Map<string, string>(PET_TYPES.map((p) => [p.value, p.label]))

/**
 * "Hosttail Mobile Forms" screens 01 (new member, Flow A) and 06 (returning
 * member adding another order). Same submission either way: the profile is
 * upserted idempotently, so a returning member just re-sends what is on file.
 */
export function RegisterForm({ member, provinces, termsBody }: Props) {
  const router = useRouter()
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
    phoneConfirmed: false,
    // A returning member accepted the terms when they first registered (and
    // submitRegistration records consent again if the document changed), so
    // the add-order form does not ask twice.
    termsAccepted: isReturning,
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [termsOpen, setTermsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: 'active' | 'pending'; message: string; at: Date } | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const meta = channelMeta(form.channel)
  // Facebook/LINE: the order-lookup value IS the member's own contact phone.
  const orderRefValue = meta.refKind === 'phone' ? form.phone : form.orderRef

  async function handleSubmit() {
    setSubmitError(null)
    if (!form.termsAccepted) {
      setTermsOpen(true)
      return
    }
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
    const needsPhoneConfirm = meta.refKind === 'phone' && !form.phoneConfirmed
    const needsReceipt = meta.requiresReceipt && !form.receiptObjectKey
    if (!parsed.success || needsPhoneConfirm || needsReceipt) {
      const fieldErrors: FieldErrors = {}
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | 'orderRef'
        if (key === 'orderRef') fieldErrors.orderRef = issue.message
        else fieldErrors[key as keyof FormState] = issue.message
      }
      if (needsPhoneConfirm) fieldErrors.phoneConfirmed = 'กรุณายืนยันคำสั่งซื้อด้วยเบอร์โทร'
      if (needsReceipt) fieldErrors.receiptObjectKey = 'กรุณาแนบรูปใบเสร็จ'
      setErrors(fieldErrors)
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
      invalidateWarrantyData()
      setResult({ status: body.status, message: body.message, at: new Date() })
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <SuccessScreen
        status={result.status}
        message={result.message}
        channel={form.channel}
        orderRef={orderRefValue}
        submittedAt={result.at}
      />
    )
  }

  // ── Order reference block: order id / receipt number / phone confirmation ──
  const orderBlock = (
    <>
      {meta.refKind === 'order_id' && (
        <div id="field-orderRef">
          <Field label={meta.refLabel} htmlFor="orderRef" error={errors.orderRef}>
            <input
              id="orderRef"
              value={form.orderRef}
              onChange={(e) => set('orderRef', e.target.value)}
              placeholder={meta.refPlaceholder}
              autoCapitalize="characters"
              className={`${fieldClass} font-ht-mono h-12`}
            />
          </Field>
        </div>
      )}

      {meta.refKind === 'phone' && (
        <div id="field-phoneConfirmed" className="flex flex-col gap-1.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={form.phoneConfirmed}
            onClick={() => set('phoneConfirmed', !form.phoneConfirmed)}
            className="flex items-start gap-3 rounded-[14px] border-[1.5px] p-3.5 text-left transition"
            style={{
              borderColor: form.phoneConfirmed ? 'var(--ht-primary)' : 'var(--ht-border)',
              background: form.phoneConfirmed ? 'var(--ht-bg-to)' : '#fff',
            }}
          >
            <CheckBox checked={form.phoneConfirmed} />
            <span className="flex flex-col gap-[3px]">
              <span className="text-sm leading-snug text-[var(--ht-ink)]">ยืนยันคำสั่งซื้อด้วยเบอร์โทรกับที่สมัครสมาชิก</span>
              <span className="font-ht-mono text-xs text-[var(--ht-text-3)]">เบอร์โทร: {form.phone || '—'}</span>
            </span>
          </button>
          {errors.phoneConfirmed && <FieldError>{errors.phoneConfirmed}</FieldError>}
        </div>
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

      <GuideAccordion channel={form.channel} />
    </>
  )

  const errorBox = submitError && (
    <p className="rounded-xl bg-[var(--ht-error-bg)] px-3 py-2.5 text-center text-sm text-[var(--ht-error)]">{submitError}</p>
  )

  const terms = (
    <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} body={termsBody} onAccept={() => set('termsAccepted', true)} />
  )

  // ── Screen 06: returning member, profile locked ──
  if (isReturning) {
    const provinceName = provinces.find((p) => p.code === form.provinceCode)?.name_th
    const pets = form.petTypes.map((p) => PET_LABEL.get(p) ?? p).join(', ')
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        className="flex min-h-dvh flex-col gap-3 bg-[var(--ht-bg-from)] px-3.5 pt-6 pb-32"
      >
        <div className="flex items-center gap-2.5 px-1">
          <button
            type="button"
            onClick={() => router.push('/home')}
            aria-label="กลับ"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg text-[var(--ht-ink)]"
            style={{ boxShadow: '0 1px 2px rgba(60,30,10,0.1)' }}
          >
            ‹
          </button>
          <h1 className="text-lg font-semibold text-[var(--ht-ink)]">ลงทะเบียนสินค้าเพิ่ม</h1>
        </div>

        <div className="flex flex-col gap-2.5 rounded-[20px] bg-[var(--ht-ink)] px-[18px] py-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs opacity-70">ข้อมูลสมาชิก</span>
            <span className="font-ht-mono rounded-full bg-white/10 px-2 py-[3px] text-[10px] font-medium">LOCKED</span>
          </div>
          <span className="text-[17px] font-semibold">คุณ{form.fullName}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
            <span className="font-ht-mono">{form.phone}</span>
            {provinceName && <span>{provinceName}</span>}
            {pets && <span>{pets}</span>}
          </div>
        </div>

        <Card className="gap-4">
          <SectionTitle num="01" title="ช่องทางการสั่งซื้อ" />
          <ChannelTabs value={form.channel} onChange={(v) => set('channel', v)} compact />
        </Card>

        <Card>
          <SectionTitle
            num="02"
            title={meta.refKind === 'phone' ? 'ยืนยันคำสั่งซื้อ' : meta.requiresReceipt ? 'ใบเสร็จ' : 'เลขคำสั่งซื้อ'}
          />
          {orderBlock}
        </Card>

        {errorBox}
        {terms}

        <StickyBar>
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? 'กำลังบันทึก...' : 'บันทึกคำสั่งซื้อใหม่'}
          </button>
        </StickyBar>
      </form>
    )
  }

  // ── Screen 01: new member ──
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      className="min-h-dvh bg-[var(--ht-bg-from)] pb-32"
    >
      <header className="relative bg-[var(--ht-primary)] px-[22px] pt-10 pb-16 text-white">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Hosttail" width={40} height={40} className="h-10 w-10 rounded-full bg-white object-cover" priority />
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold">Hosttail</span>
            <span className="text-[10px] tracking-[3px] opacity-85">PET VARIETY STORE</span>
          </div>
        </div>
        <h1 className="mt-[26px] mb-1.5 text-[26px] leading-[1.3] font-semibold">
          ลงทะเบียน
          <br />
          รับประกันสินค้า
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--ht-yellow)] px-3 py-1 text-[13px] font-medium text-[var(--ht-brown)]">
            รับประกัน 365 วัน
          </span>
          <span className="text-[13px] opacity-90">ใช้เวลาประมาณ 2 นาที</span>
        </div>
      </header>

      <div className="relative -mt-9 flex flex-col gap-3 px-3.5">
        <Card>
          <SectionTitle num="01" title="ข้อมูลส่วนตัว" />
          <div id="field-fullName">
            <Field label="ชื่อ-นามสกุล" htmlFor="fullName" error={errors.fullName}>
              <input
                id="fullName"
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="ชื่อ นามสกุล"
                autoComplete="name"
                className={`${fieldClass} h-12`}
              />
            </Field>
          </div>
          <div id="field-phone">
            <Field label="เบอร์โทรศัพท์" htmlFor="phone" error={errors.phone}>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="เช่น 081-234-5678"
                autoComplete="tel"
                className={`${fieldClass} font-ht-mono h-12`}
              />
            </Field>
          </div>
        </Card>

        <Card className="gap-4">
          <SectionTitle num="02" title="ช่องทางการสั่งซื้อ" />
          <ChannelTabs value={form.channel} onChange={(v) => set('channel', v)} />
          <div className="h-px bg-[var(--ht-divider)]" />
          {orderBlock}
        </Card>

        <Card>
          <div id="field-petTypes">
            <SectionTitle num="03" title="ข้อมูลสัตว์เลี้ยง" aside="เลือกได้หลายข้อ" />
          </div>
          <PetPicker
            value={form.petTypes}
            onChange={(v) => set('petTypes', v)}
            petOther={form.petOther}
            onPetOtherChange={(v) => set('petOther', v)}
            error={errors.petTypes ?? errors.petOther}
          />
        </Card>

        <Card>
          <SectionTitle num="04" title="ข้อมูลเพิ่มเติม" />
          <div id="field-provinceCode">
            <ProvinceSelect
              provinces={provinces}
              value={form.provinceCode}
              onChange={(v) => set('provinceCode', v)}
              error={errors.provinceCode}
            />
          </div>
          <Field label="หมายเหตุ / ข้อความถึงร้าน" hint="(ไม่บังคับ)" htmlFor="note">
            <textarea
              id="note"
              rows={3}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              className={`${fieldClass} resize-none py-3`}
            />
          </Field>
        </Card>

        <button
          type="button"
          id="field-termsAccepted"
          role="checkbox"
          aria-checked={form.termsAccepted}
          onClick={() => (form.termsAccepted ? set('termsAccepted', false) : setTermsOpen(true))}
          className="flex items-start gap-3 rounded-[20px] bg-white px-[18px] py-4 text-left"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <CheckBox checked={form.termsAccepted} />
          <span className="text-sm leading-normal text-[var(--ht-ink)]">
            ฉันได้อ่านและยอมรับ{' '}
            <span className="font-semibold text-[var(--ht-deep)] underline">เงื่อนไขการรับประกันสินค้า (รับประกัน 365 วันต่อชิ้น)</span>
          </span>
        </button>
        {errors.termsAccepted && <FieldError>{errors.termsAccepted}</FieldError>}

        {errorBox}
      </div>

      {terms}

      <StickyBar>
        <button
          type="submit"
          disabled={submitting}
          className={primaryButtonClass}
          style={{ opacity: form.termsAccepted ? 1 : 0.55 }}
        >
          {submitting ? 'กำลังบันทึก...' : 'ลงทะเบียนรับประกันสินค้า'}
        </button>
      </StickyBar>
    </form>
  )
}
