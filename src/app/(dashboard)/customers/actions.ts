'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, NotAuthorizedError } from '@/lib/session'
import { customerFiltersToParams, hasCustomerFilter, parseCustomerFilters } from '@/lib/customer-filters'

export type SegmentResult = { ok: true; message: string } | { ok: false; message: string }

function fail(err: unknown): SegmentResult {
  if (err instanceof NotAuthorizedError) return { ok: false, message: err.message }
  console.error('[segment action]', err)
  return { ok: false, message: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }
}

/**
 * Save the current /customers filters as a named segment. `query` is the
 * page's own query string; it is re-parsed here so only known, validated
 * filter keys are ever stored.
 */
export async function createSegment(name: string, query: string): Promise<SegmentResult> {
  try {
    const staff = await requireRole('marketing')
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, message: 'กรุณาตั้งชื่อกลุ่ม' }
    if (trimmed.length > 80) return { ok: false, message: 'ชื่อกลุ่มยาวเกินไป' }

    const filters = parseCustomerFilters(Object.fromEntries(new URLSearchParams(query)))
    if (!hasCustomerFilter(filters)) return { ok: false, message: 'เลือกเงื่อนไขอย่างน้อย 1 อย่างก่อนบันทึกกลุ่ม' }
    const stored = Object.fromEntries(customerFiltersToParams(filters))

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('ht_segments')
      .insert({ name: trimmed, filters: stored, created_by: staff.staffId })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') return { ok: false, message: 'มีกลุ่มชื่อนี้อยู่แล้ว' }
      return { ok: false, message: `บันทึกไม่สำเร็จ: ${error.message}` }
    }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'segment_created',
      entity: 'ht_segments',
      entity_id: data.id,
      after: { name: trimmed, filters: stored },
    })

    revalidatePath('/customers')
    return { ok: true, message: `บันทึกกลุ่ม "${trimmed}" แล้ว` }
  } catch (err) {
    return fail(err)
  }
}

export async function deleteSegment(id: string): Promise<SegmentResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()
    const { data: before } = await supabase.from('ht_segments').select('name, filters').eq('id', id).maybeSingle()
    if (!before) return { ok: false, message: 'ไม่พบกลุ่มนี้' }

    const { error } = await supabase.from('ht_segments').delete().eq('id', id)
    if (error) return { ok: false, message: `ลบไม่สำเร็จ: ${error.message}` }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'segment_deleted',
      entity: 'ht_segments',
      entity_id: id,
      before,
    })

    revalidatePath('/customers')
    return { ok: true, message: 'ลบกลุ่มแล้ว' }
  } catch (err) {
    return fail(err)
  }
}
