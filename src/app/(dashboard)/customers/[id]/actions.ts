'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, NotAuthorizedError } from '@/lib/session'
import { bindPlatformAccount, type BindOutcome } from '@/lib/orders/bind-account'
import { CONNECTABLE_PLATFORMS, listBoundOrders, type ConnectablePlatform } from '@/lib/orders/bound-orders'
import { resolveByOrderRef } from '@/lib/orders/resolve'

export interface ConnectPreview {
  shop: string
  accountNo: string
  accountName: string | null
  orderCount: number
}

export type ConnectResult =
  | { ok: true; message: string; preview?: ConnectPreview }
  | { ok: false; message: string }

function fail(err: unknown): { ok: false; message: string } {
  if (err instanceof NotAuthorizedError) return { ok: false, message: err.message }
  console.error('[customer action]', err)
  return { ok: false, message: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }
}

function explain(bind: BindOutcome): string {
  switch (bind.status) {
    case 'bound':
      return 'ผูกบัญชีได้'
    case 'already_bound':
      return 'บัญชีนี้ผูกกับลูกค้าคนนี้อยู่แล้ว'
    case 'claimed_by_other':
      return 'บัญชีนี้ผูกกับลูกค้าคนอื่นอยู่ ต้องยกเลิกผูกที่ลูกค้าคนนั้นก่อน'
    case 'not_found':
      return 'ไม่พบเลขคำสั่งซื้อนี้ในระบบติดตามออเดอร์ (อาจยังไม่เข้า ETL)'
    case 'ambiguous':
      return 'เลขนี้ชี้ไปหลายบัญชีผู้ซื้อ ผูกอัตโนมัติไม่ได้'
    case 'rejected':
      return bind.reason === 'test_member'
        ? 'บัญชีทดสอบผูกบัญชีจริงไม่ได้'
        : 'บัญชีผู้ซื้อนี้ใช้ผูกไม่ได้ (ข้อมูลไม่สมบูรณ์หรือเป็นบัญชีตัวอย่าง)'
  }
}

/**
 * Step 1 of connecting an account: find the buyer account behind one order
 * and show it to the admin WITHOUT binding anything, so they can check the
 * name matches the customer before committing.
 */
export async function previewConnect(
  memberId: string,
  platform: ConnectablePlatform,
  orderRef: string
): Promise<ConnectResult> {
  try {
    await requireRole('admin')
    const ref = orderRef.trim()
    if (!ref) return { ok: false, message: 'กรุณากรอกเลขคำสั่งซื้อ' }
    const target = CONNECTABLE_PLATFORMS.find((p) => p.value === platform)
    if (!target) return { ok: false, message: 'ไม่รู้จักแพลตฟอร์มนี้' }

    const supabase = createAdminClient()
    const bind = await bindPlatformAccount(supabase, memberId, { orderRefs: [ref], boundVia: 'admin', dryRun: true })
    if (bind.status !== 'bound') return { ok: false, message: explain(bind) }
    if (bind.shop !== target.shop) {
      return { ok: false, message: `เลขนี้เป็นออเดอร์ของ ${bind.shop} ไม่ใช่ ${target.label}` }
    }

    const { count } = await supabase
      .from('order_tracking')
      .select('*', { count: 'exact', head: true })
      .eq('shop', bind.shop)
      .eq('buyer_account_no', bind.accountNo)

    return {
      ok: true,
      message: 'พบบัญชีผู้ซื้อ',
      preview: { shop: bind.shop, accountNo: bind.accountNo, accountName: bind.accountName, orderCount: count ?? 0 },
    }
  } catch (err) {
    return fail(err)
  }
}

/** Step 2: bind for real. Re-runs every check -- the preview is never trusted. */
export async function confirmConnect(
  memberId: string,
  platform: ConnectablePlatform,
  orderRef: string
): Promise<ConnectResult> {
  try {
    const staff = await requireRole('admin')
    const target = CONNECTABLE_PLATFORMS.find((p) => p.value === platform)
    if (!target) return { ok: false, message: 'ไม่รู้จักแพลตฟอร์มนี้' }

    const supabase = createAdminClient()
    const ref = orderRef.trim()
    const dry = await bindPlatformAccount(supabase, memberId, { orderRefs: [ref], boundVia: 'admin', dryRun: true })
    if (dry.status !== 'bound') return { ok: false, message: explain(dry) }
    if (dry.shop !== target.shop) return { ok: false, message: `เลขนี้เป็นออเดอร์ของ ${dry.shop} ไม่ใช่ ${target.label}` }

    const bind = await bindPlatformAccount(supabase, memberId, { orderRefs: [ref], boundVia: 'admin' })
    if (bind.status !== 'bound') return { ok: false, message: explain(bind) }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'platform_account_bound_manual',
      entity: 'ht_member_platform_accounts',
      entity_id: memberId,
      after: { shop: bind.shop, account_no: bind.accountNo, via_order: ref },
    })

    revalidatePath(`/customers/${memberId}`)
    return { ok: true, message: `ผูกบัญชี ${target.label} แล้ว` }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Register one order from the member's bound accounts for warranty, on the
 * admin's say-so. The order must come from listBoundOrders() for THIS member,
 * so an admin can only register orders the member's own accounts placed.
 */
export async function registerBoundOrder(memberId: string, orderNo: string): Promise<ConnectResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()

    const order = (await listBoundOrders(supabase, memberId, 500)).find((o) => o.orderNo === orderNo)
    if (!order) return { ok: false, message: 'ออเดอร์นี้ไม่ได้มาจากบัญชีที่ผูกไว้ของลูกค้าคนนี้' }
    if (order.cancelled) return { ok: false, message: 'ออเดอร์นี้ถูกยกเลิกแล้ว' }
    if (!order.settled) return { ok: false, message: 'ออเดอร์นี้ยังไม่ตัดยอด รอ ETL รอบถัดไป' }
    if (!order.channel) return { ok: false, message: `ช่องทาง ${order.shop} ยังลงทะเบียนรับประกันไม่ได้` }

    const outcome = await resolveByOrderRef(supabase, order.billNo)
    if (outcome.status !== 'matched') return { ok: false, message: 'ตรวจบิลในระบบขายไม่ผ่าน' }

    const { data: reg, error: regErr } = await supabase
      .from('ht_warranty_registrations')
      .insert({
        member_id: memberId,
        channel: order.channel,
        order_ref_kind: 'order_id',
        order_ref_raw: order.billNo,
        requires_receipt: false,
        source: 'manual',
      })
      .select('id')
      .single()
    if (regErr) {
      if (regErr.code === '23505') return { ok: false, message: 'ออเดอร์นี้ลงทะเบียนไว้แล้ว' }
      return { ok: false, message: `สร้างรายการไม่สำเร็จ: ${regErr.message}` }
    }

    const { error } = await supabase.rpc('ht_finalize_registration', {
      p_registration_id: reg.id,
      p_matched_order_no: outcome.orderNo,
      p_order_amount: outcome.netAmount,
      p_items: outcome.lines.map((l) => ({ sku: l.sku, product_name: l.product_name, quantity: l.quantity ?? 1 })),
      p_reviewed_by: staff.staffId,
      p_note: 'ลงทะเบียนโดยแอดมินจากบัญชีที่ผูกไว้',
    })
    if (error) {
      // Not append-only, so a half-created row can simply go.
      await supabase.from('ht_warranty_registrations').delete().eq('id', reg.id)
      return { ok: false, message: `อนุมัติไม่สำเร็จ: ${error.message}` }
    }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'warranty_registered_from_binding',
      entity: 'ht_warranty_registrations',
      entity_id: reg.id,
      after: { member_id: memberId, order_no: outcome.orderNo, amount: outcome.netAmount },
    })

    revalidatePath(`/customers/${memberId}`)
    return { ok: true, message: `ลงทะเบียนรับประกันบิล ${order.billNo} แล้ว` }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Release a platform-account binding made by mistake. A binding claims every
 * future order on the account, so a wrong one quietly diverts a real
 * customer's purchases -- admin-only, with a reason, and audited.
 */
export async function revokeBinding(bindingId: string, memberId: string, reason: string): Promise<ConnectResult> {
  try {
    const staff = await requireRole('admin')
    if (!reason.trim()) return { ok: false, message: 'กรุณาระบุเหตุผล' }
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('ht_member_platform_accounts')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: staff.staffId,
        revoke_reason: reason.trim(),
      })
      .eq('id', bindingId)
      .eq('member_id', memberId)
      .eq('status', 'active')
    if (error) return { ok: false, message: `ยกเลิกไม่สำเร็จ: ${error.message}` }

    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'platform_account_revoked',
      entity: 'ht_member_platform_accounts',
      entity_id: bindingId,
      after: { member_id: memberId, reason: reason.trim() },
    })

    revalidatePath(`/customers/${memberId}`)
    return { ok: true, message: 'ยกเลิกการผูกบัญชีแล้ว' }
  } catch (err) {
    return fail(err)
  }
}
