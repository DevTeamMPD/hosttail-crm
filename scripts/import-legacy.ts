/**
 * Migrate the legacy Google Sheet member base into ht_members /
 * ht_warranty_registrations.
 *
 * Usage:
 *   npx tsx scripts/import-legacy.ts --file <path-to-xlsx>            # dry-run (default, no writes)
 *   npx tsx scripts/import-legacy.ts --file <path-to-xlsx> --apply    # real run
 *
 * House ETL rules followed (see dashboard/automation/src/import.js):
 *   - dry-run by default, --apply required to actually write
 *   - idempotent: safe to re-run (upsert on line_uid; warranty registrations
 *     upsert on the (member_id, order_key) unique index)
 *   - chunked (500 rows/call)
 *   - never reads or prints .env values, only the two names it needs
 *
 * Source: the "Members" sheet only (93 rows / 72 distinct legacy members --
 * verified 2026-09-15; the other three sheets in the workbook are test data
 * and are not read at all).
 *
 * What this script does NOT do:
 *   - grant retroactive points for orders that resolve to a real
 *     sales_transaction match. ht_finalize_registration() looks up the
 *     points rate in force ON THE ORDER'S OWN DATE via
 *     ht_points_config_at(); since the only config row's effective_from is
 *     the day this system launched, every legacy order predates it and
 *     naturally earns 0 points. This is left as the default rather than
 *     backdating the config -- retroactively rewarding old purchases under
 *     a rule that didn't exist when they were made is a business decision,
 *     not something to decide silently in a migration script.
 *   - fabricate PDPA consent. The legacy form only ever asked about
 *     warranty terms (and never even recorded that server-side); no PDPA
 *     consent was ever collected. A 'terms' consent row is inserted
 *     (source='import', backdated to the member's original registration
 *     timestamp) as the best reconstructable evidence; no 'pdpa' row is
 *     inserted at all. Any future broadcast must treat every
 *     source='legacy_sheet' member as NOT marketing-consented until they
 *     register something live (submitRegistration() records both
 *     terms+pdpa fresh).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import * as XLSX from 'xlsx'
import type { Database } from '../src/types/database.types'
import { recoverLegacySheetPhone } from '../src/lib/phone'
import { normalizeOrderKey } from '../src/lib/orders/normalize'
import { resolveByOrderRef } from '../src/lib/orders/resolve'
import { PET_TYPE_VALUES, type PetType } from '../src/lib/brand'

const CHUNK = 500
const UID_RE = /^U[0-9a-f]{32}$/

// ── env (names only -- never logs a value) ──────────────────────────────────
function loadEnvLocal(): Record<string, string> {
  const path = resolvePath(__dirname, '..', '.env.local')
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const fileArgIdx = args.indexOf('--file')
const FILE = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null
if (!FILE) {
  console.error('Usage: npx tsx scripts/import-legacy.ts --file <path-to-xlsx> [--apply]')
  process.exit(1)
}

// ── legacy row shape (as read from the "Members" sheet) ─────────────────────
interface LegacyRow {
  timestamp_saved?: string
  line_uid?: string // composite "<realUid>_<orderId>" -- never trusted directly
  line_uid_real?: string
  line_name?: string
  line_picture?: string
  full_name?: string
  phone?: string
  province?: string
  pet_type?: string
  pet_types?: string
  order_type?: string
  order_id?: string
  order_shopee?: string
  order_lazada?: string
  order_tiktok?: string
  order_pos?: string
  note?: string
  form_timestamp?: string
}

function realUidOf(row: LegacyRow): string | null {
  const direct = String(row.line_uid_real ?? '').trim()
  if (UID_RE.test(direct)) return direct
  const composite = String(row.line_uid ?? '').trim()
  const head = composite.split('_')[0]
  return UID_RE.test(head) ? head : null
}

/** "dog, cat, อื่นๆ (เม่น)" -> { pet_types: ['dog','cat','other'], pet_other: 'เม่น' } */
function parsePets(raw: string | undefined): { pet_types: PetType[]; pet_other: string | null } {
  const tokens = new Set<PetType>()
  let other: string | null = null
  for (const part of String(raw ?? '').split(',')) {
    const t = part.trim()
    if (!t) continue
    if (t.startsWith('อื่นๆ')) {
      tokens.add('other')
      const m = t.match(/\((.+)\)/)
      if (m) other = m[1].trim()
    } else if ((PET_TYPE_VALUES as string[]).includes(t.toLowerCase())) {
      tokens.add(t.toLowerCase() as PetType)
    }
  }
  return { pet_types: [...tokens], pet_other: other }
}

const ORDER_TYPE_TO_CHANNEL: Record<string, string> = {
  shopee: 'shopee',
  lazada: 'lazada',
  tiktok: 'tiktok',
  homepro: 'homepro',
  makropro: 'makropro',
  receipt: 'receipt',
}
const OFFLINE_CHANNELS = new Set(['homepro', 'makropro', 'receipt'])

/** The legacy timestamp is a client-clock string at UTC+7, timezone-naive
 *  (index.html:739) -- interpret it AS Bangkok time, never as UTC. */
function parseThaiTs(s: string | undefined): string | null {
  if (!s) return null
  const m = String(s)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`
}

interface TransformedMember {
  legacyUid: string
  line_uid: string
  full_name: string | null
  phone_raw: string | null
  province_raw: string | null
  pet_types: PetType[]
  pet_other: string | null
  note: string | null
  registered_at: string
}
interface TransformedOrder {
  legacyUid: string
  channel: string
  order_id_raw: string
  order_key: string
  submitted_at: string
}

function transform(rows: LegacyRow[]) {
  const byUid = new Map<string, LegacyRow[]>()
  const orphans: LegacyRow[] = []

  for (const r of rows) {
    const uid = realUidOf(r)
    if (!uid) {
      orphans.push(r)
      continue
    }
    const list = byUid.get(uid) ?? []
    list.push(r)
    byUid.set(uid, list)
  }

  const members: TransformedMember[] = []
  const orders: TransformedOrder[] = []

  for (const [uid, group] of byUid) {
    const sorted = group
      .map((r) => ({ r, ts: parseThaiTs(r.form_timestamp) ?? parseThaiTs(r.timestamp_saved) }))
      .sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')))

    const last = (f: keyof LegacyRow): string | null => {
      for (let i = sorted.length - 1; i >= 0; i--) {
        const v = String(sorted[i].r[f] ?? '').trim()
        if (v) return v
      }
      return null
    }

    const pets = { pet_types: new Set<PetType>(), pet_other: null as string | null }
    for (const { r } of sorted) {
      const p = parsePets(r.pet_types || r.pet_type)
      p.pet_types.forEach((x) => pets.pet_types.add(x))
      if (p.pet_other) pets.pet_other = p.pet_other
    }

    members.push({
      legacyUid: uid,
      line_uid: uid,
      full_name: last('full_name'),
      phone_raw: last('phone'),
      province_raw: last('province'),
      pet_types: [...pets.pet_types],
      pet_other: pets.pet_other,
      note: last('note'),
      registered_at: sorted[0].ts ?? new Date().toISOString(),
    })

    const seen = new Set<string>()
    for (const { r, ts } of sorted) {
      const rawOrder = r.order_id || r.order_shopee || r.order_lazada || r.order_tiktok || r.order_pos
      const key = normalizeOrderKey(rawOrder)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const type = String(r.order_type ?? '').toLowerCase()
      orders.push({
        legacyUid: uid,
        channel: ORDER_TYPE_TO_CHANNEL[type] ?? 'receipt',
        order_id_raw: String(rawOrder),
        order_key: key,
        submitted_at: ts ?? new Date().toISOString(),
      })
    }
  }

  return { members, orders, orphans }
}

// ── apply ────────────────────────────────────────────────────────────────
async function applyMigration(
  supabase: SupabaseClient<Database>,
  members: TransformedMember[],
  orders: TransformedOrder[]
) {
  // 1. Upsert members, chunked.
  const memberIdByUid = new Map<string, string>()
  for (let i = 0; i < members.length; i += CHUNK) {
    const chunk = members.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('ht_members')
      .upsert(
        chunk.map((m) => ({
          line_uid: m.line_uid,
          full_name: m.full_name,
          phone_raw: m.phone_raw,
          province_raw: m.province_raw,
          pet_types: m.pet_types,
          pet_other: m.pet_other,
          note: m.note,
          source: 'legacy_sheet' as const,
          registered_at: m.registered_at,
        })),
        { onConflict: 'line_uid' }
      )
      .select('id, line_uid')
    if (error) throw new Error(`ht_members upsert failed: ${error.message}`)
    for (const row of data ?? []) memberIdByUid.set(row.line_uid!, row.id)
  }
  console.log(`✓ upserted ${memberIdByUid.size} members`)

  // 1b. Province resolution -- best-effort, non-fatal per row.
  let provinceResolved = 0
  for (const [, memberId] of memberIdByUid) {
    const m = members.find((x) => memberIdByUid.get(x.line_uid) === memberId)
    if (!m?.province_raw) continue
    const { data: code } = await supabase.rpc('ht_resolve_province' as never, { raw: m.province_raw } as never)
    if (code) {
      await supabase.from('ht_members').update({ province_code: code as string }).eq('id', memberId)
      provinceResolved++
    }
  }
  console.log(`✓ resolved province for ${provinceResolved}/${members.length} members`)

  // 1c. Reconstructed terms consent (source='import'), backdated. No PDPA row.
  const { data: currentDoc } = await supabase
    .from('ht_consent_documents')
    .select('id')
    .eq('kind', 'terms')
    .eq('locale', 'th')
    .eq('is_current', true)
    .maybeSingle()
  if (currentDoc) {
    let consentWritten = 0
    for (const m of members) {
      const memberId = memberIdByUid.get(m.line_uid)
      if (!memberId) continue
      // ht_member_consents is append-only by design (no unique constraint to
      // upsert against), so re-running this script must check for an
      // existing row itself rather than rely on the DB to dedupe.
      const { data: existing } = await supabase
        .from('ht_member_consents')
        .select('id')
        .eq('member_id', memberId)
        .eq('document_id', currentDoc.id)
        .eq('source', 'import')
        .limit(1)
        .maybeSingle()
      if (existing) continue
      await supabase.from('ht_member_consents').insert({
        member_id: memberId,
        document_id: currentDoc.id,
        kind: 'terms',
        granted: true,
        source: 'import',
        recorded_at: m.registered_at,
      })
      consentWritten++
    }
    console.log(`✓ recorded reconstructed terms consent for ${consentWritten} members (no PDPA row inserted; already-migrated members skipped)`)
  }

  // 2. Insert warranty registrations, one row at a time. Idempotent via a
  // pre-check against the (member_id, order_key) unique index -- NOT via
  // .upsert()'s onConflict, because that index is PARTIAL (`where order_key
  // is not null and status not in ('rejected','attempts_exhausted')`), and
  // PostgREST's upsert helper cannot express a partial-index predicate on
  // its ON CONFLICT target. (The same class of bug as
  // ht_finalize_registration's points-ledger insert, fixed earlier via a
  // hand-written `ON CONFLICT ... WHERE ...` in that SQL function -- here
  // there's no RPC to fix, so the check moves into this script instead.)
  const regRows = orders
    .map((o) => {
      const memberId = memberIdByUid.get(o.legacyUid)
      if (!memberId) return null
      const offline = OFFLINE_CHANNELS.has(o.channel)
      return {
        member_id: memberId,
        channel: o.channel,
        order_ref_kind: 'order_id' as const,
        order_ref_raw: o.order_id_raw,
        requires_receipt: offline,
        source: 'legacy_sheet' as const,
        link_status: offline ? 'pending_review' : 'pending_review',
        review_note: offline
          ? 'นำเข้าจากระบบเดิม (Google Sheet) — ไม่มีรูปใบเสร็จแนบมาด้วย เนื่องจากฟีเจอร์อัปโหลดรูปไม่เคยทำงานในระบบเดิม กรุณาตรวจสอบด้วยเลขที่แจ้งและยืนยันยอด/สินค้าด้วยตนเอง'
          : 'นำเข้าจากระบบเดิม (Google Sheet)',
        submitted_at: o.submitted_at,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  let inserted = 0
  let alreadyExisted = 0
  const insertedRows: { id: string; member_id: string; channel: string; order_ref_raw: string; submitted_at: string }[] = []
  for (const row of regRows) {
    const { data: existing } = await supabase
      .from('ht_warranty_registrations')
      .select('id')
      .eq('member_id', row.member_id)
      .not('order_key', 'is', null)
      .eq('order_ref_kind', 'order_id')
      .filter('order_ref_raw', 'eq', row.order_ref_raw) // order_key is generated from order_ref_raw, so this is an equivalent lookup
      .not('status', 'in', '(rejected,attempts_exhausted)')
      .limit(1)
      .maybeSingle()
    if (existing) {
      alreadyExisted++
      continue
    }
    const { data, error } = await supabase.from('ht_warranty_registrations').insert(row).select('id, member_id, channel, order_ref_raw, submitted_at').single()
    if (error) {
      if (error.code === '23505') {
        alreadyExisted++
        continue
      }
      throw new Error(`ht_warranty_registrations insert failed for ${row.order_ref_raw}: ${error.message}`)
    }
    inserted++
    insertedRows.push(data)
  }
  console.log(`✓ inserted ${inserted} warranty registrations, ${alreadyExisted} already existed (of ${regRows.length} distinct orders)`)

  // 3. Try to resolve each new registration against sales_transaction and
  // finalize the clean matches (grants warranty items; points naturally
  // come out to 0 for all of these -- see the file header).
  let matched = 0
  let pending = 0
  for (const reg of insertedRows) {
    const outcome = await resolveByOrderRef(supabase, reg.order_ref_raw)
    if (outcome.status !== 'matched') {
      pending++
      continue
    }
    const items = outcome.lines.map((l) => ({ sku: l.sku, product_name: l.product_name, quantity: l.quantity ?? 1 }))
    const { error } = await supabase.rpc('ht_finalize_registration', {
      p_registration_id: reg.id,
      p_matched_order_no: outcome.orderNo,
      p_order_amount: outcome.netAmount,
      p_items: items,
    })
    if (error) {
      console.error(`  ⚠ finalize failed for registration ${reg.id}: ${error.message}`)
      pending++
    } else {
      matched++
    }
  }
  console.log(`✓ auto-matched ${matched} orders, ${pending} left pending review`)
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local')
    process.exit(1)
  }

  const wb = XLSX.readFile(FILE!)
  if (!wb.SheetNames.includes('Members')) {
    console.error(`Sheet "Members" not found. Sheets present: ${wb.SheetNames.join(', ')}`)
    process.exit(1)
  }
  const rows = XLSX.utils.sheet_to_json<LegacyRow>(wb.Sheets['Members'], { defval: '' })

  const { members, orders, orphans } = transform(rows)

  const noPhone = members.filter((m) => !recoverLegacySheetPhone(m.phone_raw ?? undefined)).length
  const noPets = members.filter((m) => m.pet_types.length === 0).length

  console.log('── Dry-run report ──────────────────────────────────────────')
  console.log(`sheet rows           : ${rows.length}`)
  console.log(`distinct members     : ${members.length}`)
  console.log(`distinct orders      : ${orders.length}`)
  console.log(`orphans (no real uid): ${orphans.length}`)
  console.log(`unparseable phone    : ${noPhone}`)
  console.log(`no pet type parsed   : ${noPets}`)
  const byChannel: Record<string, number> = {}
  for (const o of orders) byChannel[o.channel] = (byChannel[o.channel] ?? 0) + 1
  console.log(`orders by channel    :`, byChannel)
  if (orphans.length) {
    console.log('orphan rows (first 5):', orphans.slice(0, 5).map((r) => ({ line_uid: r.line_uid, phone: r.phone })))
  }

  if (!APPLY) {
    console.log('\nDry run only -- no writes made. Re-run with --apply to write.')
    return
  }

  console.log('\n── Applying ─────────────────────────────────────────────────')
  const supabase = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  // phone_raw gets the RECOVERED (leading-zero-restored) value at write time,
  // not the raw 9-digit sheet value -- see phone.ts for why this repair is
  // legacy-import-only and never applied to live input.
  for (const m of members) m.phone_raw = recoverLegacySheetPhone(m.phone_raw ?? undefined) ?? m.phone_raw
  await applyMigration(supabase, members, orders)
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
