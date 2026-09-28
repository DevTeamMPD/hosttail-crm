import { z } from 'zod'
import { ORDER_CHANNELS, PET_TYPE_VALUES } from '@/lib/brand'

/**
 * One combined submission, matching how the legacy page actually worked
 * (one "register_warranty" payload with profile + order + terms together) --
 * simpler for the customer than a multi-step wizard with separate API calls,
 * and idempotent to resend on every order since profile fields are upserted.
 */
export const SubmitRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล').max(200),
    phone: z.string().trim().min(1, 'กรุณากรอกเบอร์โทรศัพท์'),
    provinceCode: z.string().trim().min(1, 'กรุณาเลือกจังหวัด'),
    petTypes: z.array(z.enum(PET_TYPE_VALUES as [string, ...string[]])).min(1, 'กรุณาเลือกชนิดสัตว์เลี้ยง'),
    petOther: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
    channel: z.enum(ORDER_CHANNELS),
    orderRef: z.string().trim().min(1, 'กรุณากรอกข้อมูล'),
    receiptObjectKey: z.string().trim().optional(),
    termsAccepted: z.literal(true, { message: 'กรุณายอมรับเงื่อนไขการรับประกันสินค้า' }),
  })
  .refine((v) => !v.petTypes.includes('other') || Boolean(v.petOther?.length), {
    message: 'กรุณาระบุชนิดสัตว์เลี้ยง',
    path: ['petOther'],
  })

export type SubmitRegistrationInput = z.infer<typeof SubmitRegistrationSchema>
