/**
 * Interim reviewer for legacy-account claims, until the Phase 2 dashboard has
 * a proper approvals screen. Claims are filed by the "เคยเป็นสมาชิกแล้ว?"
 * button and by order submission; nothing merges until approved here.
 *
 * Usage:
 *   npx tsx scripts/review-relink-requests.ts                      # list pending
 *   npx tsx scripts/review-relink-requests.ts --approve <id>       # merge legacy -> claimant
 *   npx tsx scripts/review-relink-requests.ts --reject  <id> "reason"
 *
 * Read the evidence before approving. `claimant_uid_phone_matches_claim` is
 * the strongest signal: it means LINE's own order data ties the claimant's
 * verified line_uid to the phone being claimed. `other_pending_claims` above
 * zero means someone else wants the same account -- resolve that first.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import type { Database } from '@/types/database.types'

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
  return env
}

async function main() {
  const env = loadEnvLocal()
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const approveIdx = process.argv.indexOf('--approve')
  const rejectIdx = process.argv.indexOf('--reject')

  if (approveIdx !== -1) {
    const id = process.argv[approveIdx + 1]
    if (!id) throw new Error('--approve needs a request id')
    const { data, error } = await supabase.rpc('ht_approve_relink_request', { p_request_id: id })
    if (error) throw new Error(error.message)
    console.log('approved. merged into member:', data?.id, data?.full_name)
    return
  }

  if (rejectIdx !== -1) {
    const id = process.argv[rejectIdx + 1]
    const note = process.argv[rejectIdx + 2] ?? 'rejected by admin'
    if (!id) throw new Error('--reject needs a request id')
    const { error } = await supabase.rpc('ht_reject_relink_request', { p_request_id: id, p_note: note })
    if (error) throw new Error(error.message)
    console.log('rejected:', id)
    return
  }

  const { data: pending, error } = await supabase
    .from('ht_relink_requests')
    .select('id, claimant_member_id, legacy_member_id, claimed_phone, origin, evidence, requested_at')
    .eq('status', 'pending')
    .order('requested_at')
  if (error) throw new Error(error.message)

  if (!pending?.length) {
    console.log('no pending relink requests.')
    return
  }

  const memberIds = [...new Set(pending.flatMap((r) => [r.claimant_member_id, r.legacy_member_id]))]
  const { data: members } = await supabase
    .from('ht_members')
    .select('id, full_name, line_display_name, phone, source, points_balance')
    .in('id', memberIds)
  const byId = new Map((members ?? []).map((m) => [m.id, m]))

  console.log(`${pending.length} pending request(s)\n`)
  for (const r of pending) {
    const claimant = byId.get(r.claimant_member_id)
    const legacy = byId.get(r.legacy_member_id)
    console.log('─'.repeat(70))
    console.log(`request   : ${r.id}`)
    console.log(`filed     : ${r.requested_at}  via ${r.origin}`)
    console.log(`claimant  : ${claimant?.line_display_name ?? '(no LINE name)'} [${r.claimant_member_id}]`)
    console.log(`claims    : ${legacy?.full_name ?? '?'} / ${r.claimed_phone} (${legacy?.points_balance ?? 0} points) [${r.legacy_member_id}]`)
    console.log('evidence  :', JSON.stringify(r.evidence))
    console.log(`approve   : npx tsx scripts/review-relink-requests.ts --approve ${r.id}`)
  }
  console.log('─'.repeat(70))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
