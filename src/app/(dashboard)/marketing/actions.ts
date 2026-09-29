'use server'

import { randomBytes, randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, NotAuthorizedError } from '@/lib/session'
import { getBroadcastSettings } from '@/lib/settings'
import { resolveAudience } from '@/lib/campaigns/audience'
import { BubblesSchema, CAMPAIGN_MEDIA_BUCKET, buildLineMessages, campaignLinks, type Bubble } from '@/lib/campaigns/messages'
import { pushCampaignMessages } from '@/lib/line/push'
import { fetchUnitInsight } from '@/lib/line/insight'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

function fail(err: unknown): { ok: false; message: string } {
  if (err instanceof NotAuthorizedError) return { ok: false, message: err.message }
  console.error('[marketing action]', err)
  return { ok: false, message: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Draft ─────────────────────────────────────────────────────────────────────

export interface CampaignInput {
  id: string | null
  name: string
  segmentId: string
  bubbles: Bubble[]
}

/** Create or update a draft. Only drafts can be edited; a sent campaign is a record. */
export async function saveCampaign(input: CampaignInput): Promise<{ ok: true; id: string; message: string } | { ok: false; message: string }> {
  try {
    const staff = await requireRole('marketing')
    const name = input.name.trim()
    if (!name) return { ok: false, message: 'กรุณาตั้งชื่อแคมเปญ' }
    if (name.length > 120) return { ok: false, message: 'ชื่อแคมเปญยาวเกินไป' }
    if (input.segmentId && !UUID.test(input.segmentId)) return { ok: false, message: 'กลุ่มลูกค้าไม่ถูกต้อง' }
    const bubbles = BubblesSchema.safeParse(input.bubbles)
    if (!bubbles.success) return { ok: false, message: bubbles.error.issues[0]?.message ?? 'ข้อความไม่ถูกต้อง' }

    const supabase = createAdminClient()
    const row = { name, segment_id: input.segmentId || null, messages: bubbles.data }

    if (input.id) {
      const { data, error } = await supabase
        .from('ht_campaigns')
        .update(row)
        .eq('id', input.id)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()
      if (error) return { ok: false, message: `บันทึกไม่สำเร็จ: ${error.message}` }
      if (!data) return { ok: false, message: 'แคมเปญนี้ส่งไปแล้ว แก้ไขไม่ได้' }
      revalidatePath('/marketing')
      return { ok: true, id: input.id, message: 'บันทึกร่างแล้ว' }
    }

    const { data, error } = await supabase
      .from('ht_campaigns')
      .insert({ ...row, created_by: staff.staffId })
      .select('id')
      .single()
    if (error) return { ok: false, message: `บันทึกไม่สำเร็จ: ${error.message}` }
    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'campaign_created',
      entity: 'ht_campaigns',
      entity_id: data.id,
      after: { name },
    })
    revalidatePath('/marketing')
    return { ok: true, id: data.id, message: 'บันทึกร่างแล้ว' }
  } catch (err) {
    return fail(err)
  }
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()
    const { data } = await supabase.from('ht_campaigns').delete().eq('id', id).eq('status', 'draft').select('name').maybeSingle()
    if (!data) return { ok: false, message: 'ลบได้เฉพาะแคมเปญที่ยังไม่ส่ง' }
    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'campaign_deleted',
      entity: 'ht_campaigns',
      entity_id: id,
      before: { name: data.name },
    })
    revalidatePath('/marketing')
    return { ok: true, message: 'ลบแคมเปญแล้ว' }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Two signed upload URLs for one image: the full copy and the ≤1MB preview
 * (the browser resizes both, see image-picker.tsx). Uploading straight to
 * Storage avoids Vercel's 4.5MB request-body limit, as with receipts.
 */
export async function createImageUploadUrls(
  contentType: 'image/jpeg' | 'image/png'
): Promise<
  | { ok: true; full: { path: string; token: string }; preview: { path: string; token: string } }
  | { ok: false; message: string }
> {
  try {
    await requireRole('marketing')
    const ext = contentType === 'image/png' ? 'png' : 'jpg'
    const id = randomUUID()
    const supabase = createAdminClient()
    const bucket = supabase.storage.from(CAMPAIGN_MEDIA_BUCKET)
    const [full, preview] = await Promise.all([
      bucket.createSignedUploadUrl(`campaigns/${id}.${ext}`),
      bucket.createSignedUploadUrl(`campaigns/${id}-preview.${ext}`),
    ])
    if (full.error || preview.error) {
      return { ok: false, message: `อัปโหลดไม่สำเร็จ: ${(full.error ?? preview.error)?.message}` }
    }
    return {
      ok: true,
      full: { path: full.data.path, token: full.data.token },
      preview: { path: preview.data.path, token: preview.data.token },
    }
  } catch (err) {
    return fail(err)
  }
}

// ── Audience ──────────────────────────────────────────────────────────────────

export async function previewAudience(segmentId: string): Promise<
  | { ok: true; total: number; reachable: number; noLine: number; unfollowed: number; optedOut: number }
  | { ok: false; message: string }
> {
  try {
    await requireRole('marketing')
    if (!UUID.test(segmentId)) return { ok: false, message: 'กลุ่มลูกค้าไม่ถูกต้อง' }
    const audience = await resolveAudience(createAdminClient(), segmentId)
    if (!audience) return { ok: false, message: 'ไม่พบกลุ่มนี้' }
    return {
      ok: true,
      total: audience.total,
      reachable: audience.members.length,
      noLine: audience.noLine,
      unfollowed: audience.unfollowed,
      optedOut: audience.optedOut,
    }
  } catch (err) {
    return fail(err)
  }
}

// ── Sending ───────────────────────────────────────────────────────────────────

/** Origin for tracked links: the configured site URL, else this request's own host. */
async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env && /^https:\/\//.test(env)) return env.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/**
 * Send the current draft to one TEST account (ht_members.is_test) -- real
 * LINE delivery even in dry-run mode, so the message can be checked on a
 * phone before it goes to customers. Links are sent as-is (not tracked).
 */
export async function sendTestCampaign(input: CampaignInput, memberId: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    const bubbles = BubblesSchema.safeParse(input.bubbles)
    if (!bubbles.success) return { ok: false, message: bubbles.error.issues[0]?.message ?? 'ข้อความไม่ถูกต้อง' }
    if (!UUID.test(memberId)) return { ok: false, message: 'เลือกบัญชีทดสอบ' }

    const supabase = createAdminClient()
    const { data: member } = await supabase
      .from('ht_members')
      .select('line_uid, is_test, full_name, line_display_name')
      .eq('id', memberId)
      .maybeSingle()
    if (!member?.is_test) return { ok: false, message: 'ส่งทดสอบได้เฉพาะบัญชีทดสอบ' }
    if (!member.line_uid) return { ok: false, message: 'บัญชีทดสอบนี้ไม่มี LINE' }

    const links = campaignLinks(bubbles.data)
    const messages = buildLineMessages(bubbles.data, { supabaseUrl: supabaseUrl(), trackedUrl: (n) => links[n] })
    const res = await pushCampaignMessages(member.line_uid, messages, { retryKey: randomUUID() })
    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'campaign_test_sent',
      entity: 'ht_campaigns',
      entity_id: input.id ?? 'unsaved',
      after: { member_id: memberId, ok: res.ok },
    })
    if (!res.ok) return { ok: false, message: `LINE ไม่รับข้อความ: ${res.error}` }
    return { ok: true, message: `ส่งทดสอบถึง ${member.full_name ?? member.line_display_name ?? 'บัญชีทดสอบ'} แล้ว` }
  } catch (err) {
    return fail(err)
  }
}

/** Freeze the audience into ht_campaign_recipients. Idempotent (upsert, ignore duplicates). */
async function prepareRecipients(supabase: ReturnType<typeof createAdminClient>, campaignId: string, segmentId: string) {
  const audience = await resolveAudience(supabase, segmentId)
  if (!audience) throw new Error('segment not found')
  for (let i = 0; i < audience.members.length; i += 500) {
    const { error } = await supabase.from('ht_campaign_recipients').upsert(
      audience.members.slice(i, i + 500).map((m) => ({
        campaign_id: campaignId,
        member_id: m.id,
        line_uid: m.line_uid,
        token: randomBytes(12).toString('base64url'),
      })),
      { onConflict: 'campaign_id,member_id', ignoreDuplicates: true }
    )
    if (error) throw new Error(error.message)
  }
  const { count } = await supabase
    .from('ht_campaign_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
  await supabase.from('ht_campaigns').update({ recipient_count: count ?? 0 }).eq('id', campaignId)
  return count ?? 0
}

/**
 * Draft → sending: snapshots the audience. The actual pushes happen in
 * sendCampaignBatch, which the page calls in a loop so no single request
 * runs long enough to hit the function timeout.
 */
export async function startCampaign(id: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()
    const settings = await getBroadcastSettings(supabase)
    if (!settings.enabled) return { ok: false, message: 'ระบบส่งข้อความถูกปิดอยู่ (ht_settings.broadcast.enabled = false)' }

    const { data: c } = await supabase.from('ht_campaigns').select('status, segment_id, messages, name').eq('id', id).maybeSingle()
    if (!c) return { ok: false, message: 'ไม่พบแคมเปญ' }
    if (c.status !== 'draft') return { ok: false, message: 'แคมเปญนี้เริ่มส่งไปแล้ว' }
    if (!c.segment_id) return { ok: false, message: 'เลือกกลุ่มลูกค้าก่อนส่ง' }
    if (!BubblesSchema.safeParse(c.messages).success) return { ok: false, message: 'ข้อความไม่ถูกต้อง' }

    const audience = await resolveAudience(supabase, c.segment_id)
    if (!audience) return { ok: false, message: 'ไม่พบกลุ่มลูกค้า' }
    if (!audience.members.length) return { ok: false, message: 'ไม่มีลูกค้าในกลุ่มนี้ที่ส่ง LINE ถึงได้' }

    // Conditional update = only one "send" wins, even if pressed twice.
    const { data: claimed } = await supabase
      .from('ht_campaigns')
      .update({
        status: 'sending',
        dry_run: settings.dry_run,
        segment_name: audience.segmentName,
        aggregation_unit: `cmp_${id.replace(/-/g, '').slice(0, 26)}`,
        sent_by: staff.staffId,
        sending_started_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle()
    if (!claimed) return { ok: false, message: 'แคมเปญนี้เริ่มส่งไปแล้ว' }

    const count = await prepareRecipients(supabase, id, c.segment_id)
    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'campaign_started',
      entity: 'ht_campaigns',
      entity_id: id,
      after: { name: c.name, segment: audience.segmentName, recipients: count, dry_run: settings.dry_run },
    })
    revalidatePath('/marketing')
    return { ok: true, message: `เตรียมส่งถึง ${count.toLocaleString()} คน` }
  } catch (err) {
    return fail(err)
  }
}

const BATCH = 300
const CONCURRENCY = 10

export type BatchResult =
  | { ok: true; sent: number; failed: number; remaining: number; done: boolean }
  | { ok: false; message: string }

/** Push to the next BATCH pending recipients. Safe to call concurrently (LINE retry keys). */
export async function sendCampaignBatch(id: string): Promise<BatchResult> {
  try {
    await requireRole('marketing')
    const supabase = createAdminClient()
    const { data: c } = await supabase
      .from('ht_campaigns')
      .select('status, messages, dry_run, aggregation_unit, recipient_count, segment_id')
      .eq('id', id)
      .maybeSingle()
    if (!c) return { ok: false, message: 'ไม่พบแคมเปญ' }
    if (c.status === 'sent') return { ok: true, sent: 0, failed: 0, remaining: 0, done: true }
    if (c.status !== 'sending' || !c.aggregation_unit) return { ok: false, message: 'แคมเปญนี้ยังไม่ได้เริ่มส่ง' }
    const bubbles = BubblesSchema.parse(c.messages)

    // startCampaign was interrupted before the audience was saved.
    if (c.recipient_count === 0 && c.segment_id) await prepareRecipients(supabase, id, c.segment_id)

    const { data: batch, error } = await supabase
      .from('ht_campaign_recipients')
      .select('id, line_uid, token')
      .eq('campaign_id', id)
      .eq('status', 'pending')
      .limit(BATCH)
    if (error) return { ok: false, message: error.message }

    const origin = await siteOrigin()
    const sentIds: string[] = []
    const failures: { id: string; error: string }[] = []
    let stopped: string | null = null

    const queue = [...(batch ?? [])]
    async function worker() {
      while (queue.length && !stopped) {
        const r = queue.shift()!
        if (c!.dry_run) {
          sentIds.push(r.id)
          continue
        }
        const messages = buildLineMessages(bubbles, {
          supabaseUrl: supabaseUrl(),
          trackedUrl: (n) => `${origin}/c/${r.token}/${n}`,
        })
        const res = await pushCampaignMessages(r.line_uid, messages, { retryKey: r.id, aggregationUnit: c!.aggregation_unit! })
        if (res.ok) sentIds.push(r.id)
        else if (res.retryable) {
          // Rate limit / quota / LINE outage: leave this and the rest pending, stop the batch.
          stopped = res.error
        } else failures.push({ id: r.id, error: res.error })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    const now = new Date().toISOString()
    for (let i = 0; i < sentIds.length; i += 200) {
      await supabase
        .from('ht_campaign_recipients')
        .update({ status: 'sent', sent_at: now, error: null })
        .in('id', sentIds.slice(i, i + 200))
    }
    for (const f of failures) {
      await supabase.from('ht_campaign_recipients').update({ status: 'failed', error: f.error }).eq('id', f.id)
    }

    const { count: remaining } = await supabase
      .from('ht_campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .eq('status', 'pending')
    const done = (remaining ?? 0) === 0
    if (done) {
      await supabase.from('ht_campaigns').update({ status: 'sent', sent_at: now }).eq('id', id).eq('status', 'sending')
      revalidatePath('/marketing')
    }
    if (stopped) return { ok: false, message: `LINE ให้รอก่อน — หยุดส่งชั่วคราว (${stopped}) กด "ส่งต่อ" อีกครั้งภายหลัง` }
    return { ok: true, sent: sentIds.length, failed: failures.length, remaining: remaining ?? 0, done }
  } catch (err) {
    return fail(err)
  }
}

/** Put failed recipients back in the queue (e.g. after fixing the LINE token). */
export async function retryFailed(id: string): Promise<ActionResult> {
  try {
    const staff = await requireRole('marketing')
    const supabase = createAdminClient()
    const { data: rows } = await supabase
      .from('ht_campaign_recipients')
      .update({ status: 'pending', error: null })
      .eq('campaign_id', id)
      .eq('status', 'failed')
      .select('id')
    if (!rows?.length) return { ok: false, message: 'ไม่มีรายการที่ส่งไม่สำเร็จ' }
    await supabase.from('ht_campaigns').update({ status: 'sending', sent_at: null }).eq('id', id)
    await supabase.from('ht_audit_log').insert({
      actor_id: staff.staffId,
      action: 'campaign_retry_failed',
      entity: 'ht_campaigns',
      entity_id: id,
      after: { count: rows.length },
    })
    revalidatePath(`/marketing/${id}`)
    return { ok: true, message: `นำ ${rows.length} รายการกลับเข้าคิวแล้ว` }
  } catch (err) {
    return fail(err)
  }
}

/** Pull LINE's aggregate impression/click numbers for this campaign. */
export async function refreshInsight(id: string): Promise<ActionResult> {
  try {
    await requireRole('marketing')
    const supabase = createAdminClient()
    const { data: c } = await supabase
      .from('ht_campaigns')
      .select('aggregation_unit, sending_started_at, dry_run')
      .eq('id', id)
      .maybeSingle()
    if (!c?.aggregation_unit || !c.sending_started_at) return { ok: false, message: 'แคมเปญนี้ยังไม่ได้ส่ง' }
    if (c.dry_run) return { ok: false, message: 'แคมเปญโหมดทดลองไม่ได้ส่งจริง จึงไม่มีสถิติจาก LINE' }
    const res = await fetchUnitInsight(c.aggregation_unit, new Date(c.sending_started_at))
    if (!res.ok) return { ok: false, message: `ดึงสถิติจาก LINE ไม่สำเร็จ: ${res.error}` }
    await supabase
      .from('ht_campaigns')
      .update({ insight: JSON.parse(JSON.stringify(res.data)), insight_fetched_at: new Date().toISOString() })
      .eq('id', id)
    revalidatePath(`/marketing/${id}`)
    return { ok: true, message: 'อัปเดตสถิติจาก LINE แล้ว' }
  } catch (err) {
    return fail(err)
  }
}
