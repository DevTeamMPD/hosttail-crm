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

    // A filter segment never points at a manual group -- those are chosen by hand.
    const filters = { ...parseCustomerFilters(Object.fromEntries(new URLSearchParams(query))), seg: '' }
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BATCH = 500

function cleanIds(ids: string[]): string[] | null {
  const unique = [...new Set(ids)]
  if (!unique.length || unique.length > MAX_BATCH || unique.some((id) => !UUID.test(id))) return null
  return unique
}

/**
 * Add ticked customers to a manual group -- an existing one (`segmentId`) or
 * a new one created on the spot (`newName`, when segmentId is null). Adding
 * someone already in the group is a no-op.
 */
export async function addToManualSegment(
  segmentId: string | null,
  newName: string,
  memberIds: string[]
): Promise<SegmentResult> {
  try {
    const staff = await requireRole('marketing')
    const ids = cleanIds(memberIds)
    if (!ids) return { ok: false, message: `เลือกลูกค้า 1–${MAX_BATCH} คน` }
    const supabase = createAdminClient()

    let id = segmentId
    let name: string
    if (id) {
      const { data: seg } = await supabase.from('ht_segments').select('name, kind').eq('id', id).maybeSingle()
      if (!seg || seg.kind !== 'manual') return { ok: false, message: 'ไม่พบกลุ่มนี้' }
      name = seg.name
    } else {
      name = newName.trim()
      if (!name) return { ok: false, message: 'กรุณาตั้งชื่อกลุ่ม' }
      if (name.length > 80) return { ok: false, message: 'ชื่อกลุ่มยาวเกินไป' }
      const { data: created, error } = await supabase
        .from('ht_segments')
        .insert({ name, kind: 'manual', created_by: staff.staffId })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') {
          // The dropdown lists manual groups only, so a clash with a filter
          // group needs saying explicitly -- it is not in the list to pick.
          return {
            ok: false,
            message: `มีกลุ่ม "${name}" อยู่แล้ว เป็นกลุ่มจากตัวกรอง (เพิ่มคนเองไม่ได้) — ใช้ชื่ออื่น หรือลบกลุ่มเดิมก่อน`,
          }
        }
        return { ok: false, message: `สร้างกลุ่มไม่สำเร็จ: ${error.message}` }
      }
      id = created.id
    }

    const { error } = await supabase
      .from('ht_segment_members')
      .upsert(
        ids.map((member_id) => ({ segment_id: id as string, member_id, added_by: staff.staffId })),
        { onConflict: 'segment_id,member_id', ignoreDuplicates: true }
      )
    if (error) return { ok: false, message: `เพิ่มเข้ากลุ่มไม่สำเร็จ: ${error.message}` }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'segment_members_added',
      entity: 'ht_segments',
      entity_id: id,
      after: { name, member_ids: ids, new_segment: !segmentId },
    })

    revalidatePath('/customers')
    return { ok: true, message: `เพิ่ม ${ids.length} คนเข้ากลุ่ม "${name}" แล้ว` }
  } catch (err) {
    return fail(err)
  }
}

export async function removeFromManualSegment(segmentId: string, memberIds: string[]): Promise<SegmentResult> {
  try {
    const staff = await requireRole('marketing')
    const ids = cleanIds(memberIds)
    if (!ids) return { ok: false, message: `เลือกลูกค้า 1–${MAX_BATCH} คน` }
    const supabase = createAdminClient()

    const { error } = await supabase.from('ht_segment_members').delete().eq('segment_id', segmentId).in('member_id', ids)
    if (error) return { ok: false, message: `นำออกไม่สำเร็จ: ${error.message}` }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'segment_members_removed',
      entity: 'ht_segments',
      entity_id: segmentId,
      before: { member_ids: ids },
    })

    revalidatePath('/customers')
    return { ok: true, message: `นำ ${ids.length} คนออกจากกลุ่มแล้ว` }
  } catch (err) {
    return fail(err)
  }
}
