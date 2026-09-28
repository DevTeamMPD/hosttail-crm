'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, NotAuthorizedError } from '@/lib/session'
import { resolveByOrderRef } from '@/lib/orders/resolve'
import { bindPlatformAccount, type BindOutcome } from '@/lib/orders/bind-account'

export interface ActionResult {
  ok: boolean
  message: string
}

function fail(err: unknown): ActionResult {
  if (err instanceof NotAuthorizedError) return { ok: false, message: err.message }
  console.error('[approvals action]', err)
  return { ok: false, message: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }
}

/** Offline channels an admin approves by typing the items off the receipt photo. */
const MANUAL_CHANNELS = ['homepro', 'makropro', 'receipt']

async function loadPendingRegistration(supabase: ReturnType<typeof createAdminClient>, registrationId: string) {
  const { data } = await supabase
    .from('ht_warranty_registrations')
    .select('id, member_id, channel, order_ref_raw, order_ref_kind, status')
    .eq('id', registrationId)
    .limit(1)
    .maybeSingle()
  return data
}

/**
 * Approve a queued warranty claim by linking it to a real bill.
 *
 * The admin supplies the bill number by hand -- auto-match results are only
 * ever hints (see ht_warranty_registrations.auto_match_candidates). Whatever
 * they type is still resolved against sales_transaction here rather than
 * trusted, so a typo cannot activate a warranty against a bill that does not
 * exist or was cancelled.
 *
 * For online channels the buyer account behind the bill is then bound to the
 * member, so their later orders on that account can be attributed to them.
 */
export async function approveWarranty(registrationId: string, billNo: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()

    const ref = billNo.trim()
    if (!ref) return { ok: false, message: 'กรุณากรอกเลขบิล' }

    const reg = await loadPendingRegistration(supabase, registrationId)
    if (!reg) return { ok: false, message: 'ไม่พบรายการนี้' }
    if (reg.status !== 'pending') return { ok: false, message: 'รายการนี้ถูกดำเนินการไปแล้ว' }
    // Store receipts usually are not in sales_transaction, but a legacy
    // 'receipt' row can carry a JST order number that is -- so lookup stays
    // allowed for them; only the account binding below is skipped.
    const isStoreReceipt = MANUAL_CHANNELS.includes(reg.channel)

    const scope = reg.channel === 'event' ? 'event' : 'online'
    const outcome = await resolveByOrderRef(supabase, ref, scope)
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
      p_reviewed_by: staff.staffId,
    })
    if (error) return { ok: false, message: `อนุมัติไม่สำเร็จ: ${error.message}` }

    let bindNote = ''
    if (scope === 'online' && !isStoreReceipt) {
      const { data: member } = await supabase
        .from('ht_members')
        .select('phone')
        .eq('id', reg.member_id)
        .limit(1)
        .maybeSingle()
      const bind = await bindPlatformAccount(supabase, reg.member_id, {
        orderRefs: [ref, outcome.orderNo, ...outcome.lines.map((l) => l.bill_no), reg.order_ref_raw],
        phone: reg.order_ref_kind === 'phone' ? member?.phone : null,
        registrationId,
        boundVia: 'admin',
      })
      bindNote = describeBind(bind)
      if (bind.status === 'claimed_by_other') {
        await supabase.from('ht_audit_log').insert({
          actor_id: staff.staffId,
          action: 'platform_account_contested',
          entity: 'ht_member_platform_accounts',
          entity_id: reg.member_id,
          after: { shop: bind.shop, account_no: bind.accountNo, owner_member_id: bind.ownerMemberId },
        })
      }
    }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'warranty_approved',
      entity: 'ht_warranty_registrations',
      entity_id: registrationId,
      after: { matched_order_no: outcome.orderNo, amount: outcome.netAmount, items: items.length, bind: bindNote || null },
    })

    revalidatePath('/approvals')
    return {
      ok: true,
      message: `อนุมัติแล้ว · จับคู่บิล ${outcome.orderNo} · ฿${outcome.netAmount.toLocaleString()}${bindNote ? ` · ${bindNote}` : ''}`,
    }
  } catch (err) {
    return fail(err)
  }
}

function describeBind(bind: BindOutcome): string {
  switch (bind.status) {
    case 'bound':
      return `ผูกบัญชี ${bind.shop} แล้ว`
    case 'already_bound':
      return `บัญชี ${bind.shop} ผูกไว้แล้ว`
    case 'claimed_by_other':
      return `บัญชี ${bind.shop} ผูกกับสมาชิกคนอื่นอยู่ — ไม่ได้ผูกให้`
    case 'not_found':
      return 'ไม่พบบัญชีผู้ซื้อของบิลนี้ — ไม่ได้ผูกบัญชี'
    case 'ambiguous':
      return 'บิลนี้ชี้ไปหลายบัญชี — ไม่ได้ผูกบัญชี'
    case 'rejected':
      return bind.reason === 'test_member' ? 'บัญชีทดสอบ — ไม่ผูกบัญชี' : 'บัญชีผู้ซื้อใช้ผูกไม่ได้ — ไม่ได้ผูกบัญชี'
  }
}

export interface ManualItem {
  sku: string
  productName: string
  quantity: number
}

/**
 * Approve a HomePro / Makro Pro / other-store receipt. The retailer's own POS
 * issued it, so it can never be found in sales_transaction -- the admin reads
 * the items off the receipt photo instead. Nothing is bound: there is no buyer
 * account behind a store receipt.
 */
export async function approveManual(
  registrationId: string,
  receiptNo: string,
  rawItems: ManualItem[],
  amount: number | null
): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()

    const reg = await loadPendingRegistration(supabase, registrationId)
    if (!reg) return { ok: false, message: 'ไม่พบรายการนี้' }
    if (reg.status !== 'pending') return { ok: false, message: 'รายการนี้ถูกดำเนินการไปแล้ว' }
    if (!MANUAL_CHANNELS.includes(reg.channel)) {
      return { ok: false, message: 'ช่องทางนี้ต้องอนุมัติด้วยเลขบิลในระบบขาย' }
    }

    const items = rawItems
      .map((i) => ({ sku: i.sku.trim(), product_name: i.productName.trim(), quantity: Number(i.quantity) }))
      .filter((i) => i.sku || i.product_name)
    if (!items.length) return { ok: false, message: 'กรุณากรอกชื่อสินค้าหรือ SKU อย่างน้อย 1 รายการ' }
    if (items.some((i) => !Number.isFinite(i.quantity) || i.quantity <= 0)) {
      return { ok: false, message: 'จำนวนต้องมากกว่า 0' }
    }
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      return { ok: false, message: 'ยอดเงินไม่ถูกต้อง' }
    }

    const receipt = receiptNo.trim() || reg.order_ref_raw
    const { error } = await supabase.rpc('ht_finalize_registration', {
      p_registration_id: registrationId,
      p_matched_order_no: receipt,
      p_order_amount: amount ?? 0,
      p_items: items.map((i) => ({ sku: i.sku || null, product_name: i.product_name || null, quantity: i.quantity })),
      p_reviewed_by: staff.staffId,
      p_note: 'อนุมัติจากรูปใบเสร็จ (กรอกสินค้าเอง)',
    })
    if (error) return { ok: false, message: `อนุมัติไม่สำเร็จ: ${error.message}` }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'warranty_approved_manual',
      entity: 'ht_warranty_registrations',
      entity_id: registrationId,
      after: { receipt_no: receipt, amount, items },
    })

    revalidatePath('/approvals')
    return { ok: true, message: `อนุมัติแล้ว · ${items.length} รายการ` }
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
