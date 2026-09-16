'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, NotAuthorizedError } from '@/lib/session'
import { resolveByOrderRef } from '@/lib/orders/resolve'

export interface ActionResult {
  ok: boolean
  message: string
}

function fail(err: unknown): ActionResult {
  if (err instanceof NotAuthorizedError) return { ok: false, message: err.message }
  console.error('[approvals action]', err)
  return { ok: false, message: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }
}

/**
 * Approve a queued warranty claim by linking it to a real bill.
 *
 * The admin supplies the bill number by hand -- auto-match results are only
 * ever hints (see ht_warranty_registrations.auto_match_candidates). Whatever
 * they type is still resolved against sales_transaction here rather than
 * trusted, so a typo cannot activate a warranty against a bill that does not
 * exist or was cancelled.
 */
export async function approveWarranty(registrationId: string, billNo: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()

    const ref = billNo.trim()
    if (!ref) return { ok: false, message: 'กรุณากรอกเลขบิล' }

    const outcome = await resolveByOrderRef(supabase, ref)
    if (outcome.status === 'not_found') return { ok: false, message: `ไม่พบบิล ${ref} ในระบบขาย` }
    if (outcome.status === 'cancelled') return { ok: false, message: `บิล ${ref} ถูกยกเลิกแล้ว` }
    if (outcome.status === 'unsettled') return { ok: false, message: `บิล ${ref} ยังไม่ตัดยอด รอ ETL รอบถัดไป` }
    if (outcome.status === 'ambiguous') {
      return { ok: false, message: `เลขนี้ตรงกับหลายบิล (${outcome.candidates.map((c) => c.orderNo).join(', ')})` }
    }

    const items = outcome.lines.map((l) => ({
      sku: l.sku,
      product_name: l.product_name,
      quantity: l.quantity ?? 1,
    }))

    const { error } = await supabase.rpc('ht_finalize_registration', {
      p_registration_id: registrationId,
      p_matched_order_no: outcome.orderNo,
      p_order_amount: outcome.netAmount,
      p_items: items,
    })
    if (error) return { ok: false, message: `อนุมัติไม่สำเร็จ: ${error.message}` }

    await supabase
      .from('ht_warranty_registrations')
      .update({ reviewed_by: staff.staffId, reviewed_at: new Date().toISOString() })
      .eq('id', registrationId)

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'warranty_approved',
      entity: 'ht_warranty_registrations',
      entity_id: registrationId,
      after: { matched_order_no: outcome.orderNo, amount: outcome.netAmount, items: items.length },
    })

    revalidatePath('/approvals')
    return { ok: true, message: `อนุมัติแล้ว · จับคู่บิล ${outcome.orderNo} · ฿${outcome.netAmount.toLocaleString()}` }
  } catch (err) {
    return fail(err)
  }
}

export async function rejectWarranty(registrationId: string, reason: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    if (!reason.trim()) return { ok: false, message: 'กรุณาระบุเหตุผล — ลูกค้าจะเห็นข้อความนี้' }
    const supabase = createAdminClient()

    const { data: current } = await supabase
      .from('ht_warranty_registrations')
      .select('rejection_history, attempt_no')
      .eq('id', registrationId)
      .limit(1)
      .maybeSingle()
    if (!current) return { ok: false, message: 'ไม่พบรายการนี้' }

    // ht_warranty_rejected_chk requires a non-empty history whenever the row
    // is rejected, so the entry has to be appended in the same update.
    const history = Array.isArray(current.rejection_history) ? current.rejection_history : []
    const attempts = current.attempt_no ?? 1

    const { error } = await supabase
      .from('ht_warranty_registrations')
      .update({
        status: attempts >= 3 ? 'attempts_exhausted' : 'rejected',
        review_note: reason.trim(),
        reviewed_by: staff.staffId,
        reviewed_at: new Date().toISOString(),
        rejection_history: [...history, { at: new Date().toISOString(), by: staff.staffId, reason: reason.trim() }],
      })
      .eq('id', registrationId)
    if (error) return { ok: false, message: `ปฏิเสธไม่สำเร็จ: ${error.message}` }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'warranty_rejected',
      entity: 'ht_warranty_registrations',
      entity_id: registrationId,
      after: { reason: reason.trim(), attempt_no: attempts },
    })

    revalidatePath('/approvals')
    return { ok: true, message: 'ปฏิเสธแล้ว' }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Merging a legacy account into a live one is an identity decision, so it is
 * admin-only -- deliberately stricter than the warranty queue. See
 * ht_approve_relink_request in the 20260915103000 migration.
 */
export async function approveRelink(requestId: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('admin')
    const supabase = createAdminClient()

    const { error } = await supabase.rpc('ht_approve_relink_request', {
      p_request_id: requestId,
      p_actor: staff.staffId,
    })
    if (error) return { ok: false, message: `อนุมัติไม่สำเร็จ: ${error.message}` }

    revalidatePath('/approvals')
    return { ok: true, message: 'เชื่อมข้อมูลสมาชิกเดิมเรียบร้อย' }
  } catch (err) {
    return fail(err)
  }
}

export async function rejectRelink(requestId: string, reason: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('admin')
    const supabase = createAdminClient()

    const { error } = await supabase.rpc('ht_reject_relink_request', {
      p_request_id: requestId,
      p_note: reason.trim() || 'ปฏิเสธโดยผู้ดูแลระบบ',
      p_actor: staff.staffId,
    })
    if (error) return { ok: false, message: `ปฏิเสธไม่สำเร็จ: ${error.message}` }

    revalidatePath('/approvals')
    return { ok: true, message: 'ปฏิเสธคำขอแล้ว' }
  } catch (err) {
    return fail(err)
  }
}
