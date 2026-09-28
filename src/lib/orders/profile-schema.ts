import { z } from 'zod'
import { PET_TYPE_VALUES } from '@/lib/brand'

/**
 * Editable from the ข้อมูลสมาชิก (Profile) tab. Deliberately excludes
 * fullName/phone -- those are identity-anchored (phone is how the
 * Facebook/LINE order-matching ownership check and the legacy relink flow
 * work; see resolve.ts and relink.ts), so once set they stay locked here the
 * same way the registration form locks them for a returning member. A
 * customer who genuinely needs those changed goes through support, not a
 * self-serve edit.
 */
export const UpdateProfileSchema = z
  .object({
    provinceCode: z.string().trim().min(1, 'กรุณาเลือกจังหวัด'),
    petTypes: z.array(z.enum(PET_TYPE_VALUES as [string, ...string[]])).min(1, 'กรุณาเลือกชนิดสัตว์เลี้ยง'),
    petOther: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => !v.petTypes.includes('other') || Boolean(v.petOther?.length), {
    message: 'กรุณาระบุชนิดสัตว์เลี้ยง',
    path: ['petOther'],
  })

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
