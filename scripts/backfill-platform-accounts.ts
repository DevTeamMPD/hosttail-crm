/**
 * Bind existing members to the platform buyer account behind orders they have
 * already registered, so their next purchase attributes itself.
 *
 * Usage:
 *   npx tsx scripts/backfill-platform-accounts.ts            # dry-run (default, no writes)
 *   npx tsx scripts/backfill-platform-accounts.ts --apply    # real run
 *
 * House ETL rules followed: dry-run by default, idempotent (an already-bound
 * account is reported, never duplicated -- ux_ht_mpa_account enforces that at
 * the DB level too), never prints .env values.
 *
 * Scope: registrations that are not rejected/exhausted/void. A rejected claim
 * was judged not to belong to the member, so it must not hand them an account.
 * Feasibility measured on 2026-09-15: 52 of the 80 migrated legacy
 * registrations reach an order_tracking row carrying a buyer_account_no,
 * covering 49 of the 72 members (68%).
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import type { Database } from '@/types/database.types'
import { bindPlatformAccount, type BindOutcome } from '@/lib/orders/bind-account'

function loadEnvLocal(): Record<string, string> {
  const file = path.resolve(process.cwd(), '.env.local')
  const env: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
  return env
}

async function main() {
  const apply = process.argv.includes('--apply')
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local')
    process.exit(1)
  }
  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: regs, error } = await supabase
    .from('ht_warranty_registrations')
    .select('id, member_id, order_ref_raw, order_ref_kind, matched_order_no, status, channel, submitted_at')
    .not('status', 'in', '(rejected,attempts_exhausted,void)')
    .order('submitted_at', { ascending: true })
  if (error) throw new Error(error.message)

  // Members whose phone we may need for the Facebook/LINE path, where the
  // reference the customer gave is a phone rather than an order id.
  const memberIds = [...new Set((regs ?? []).map((r) => r.member_id))]
  const phoneByMember = new Map<string, string | null>()
  for (let i = 0; i < memberIds.length; i += 200) {
    const { data: members } = await supabase
      .from('ht_members')
      .select('id, phone')
      .in('id', memberIds.slice(i, i + 200))
    for (const m of members ?? []) phoneByMember.set(m.id, m.phone)
  }

  console.log(`registrations considered : ${regs?.length ?? 0}`)
  console.log(`distinct members         : ${memberIds.length}`)
  console.log(`mode                     : ${apply ? 'APPLY' : 'dry-run'}\n`)

  const tally: Record<string, number> = {}
  const boundMembers = new Set<string>()
  const contested: { member: string; shop: string; account: string; owner: string }[] = []
  const bound: { member: string; shop: string; account: string; name: string | null }[] = []

  for (const reg of regs ?? []) {
    // One binding per member is enough to cover their future orders; skip the
    // rest of their registrations once they have one.
    if (boundMembers.has(reg.member_id)) continue

    let outcome: BindOutcome
    try {
      outcome = await bindPlatformAccount(supabase, reg.member_id, {
        orderRefs: [reg.order_ref_raw, reg.matched_order_no],
        phone: reg.order_ref_kind === 'phone' ? phoneByMember.get(reg.member_id) : null,
        registrationId: reg.id,
        boundVia: 'backfill',
        dryRun: !apply,
      })
    } catch (err) {
      outcome = { status: 'rejected', reason: `threw:${err instanceof Error ? err.message : String(err)}` }
    }

    const key = outcome.status === 'rejected' || outcome.status === 'ambiguous'
      ? `${outcome.status}:${outcome.reason}`
      : outcome.status
    tally[key] = (tally[key] ?? 0) + 1

    if (outcome.status === 'bound') {
      boundMembers.add(reg.member_id)
      bound.push({
        member: reg.member_id.slice(0, 8),
        shop: outcome.shop,
        account: outcome.accountNo,
        name: outcome.accountName,
      })
    } else if (outcome.status === 'already_bound') {
      boundMembers.add(reg.member_id)
    } else if (outcome.status === 'claimed_by_other') {
      contested.push({
        member: reg.member_id.slice(0, 8),
        shop: outcome.shop,
        account: outcome.accountNo,
        owner: outcome.ownerMemberId.slice(0, 8),
      })
    }
  }

  console.log('── outcomes ──')
  console.table(
    Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([outcome, count]) => ({ outcome, count }))
  )
  console.log(`\nmembers with a binding   : ${boundMembers.size} of ${memberIds.length}`)

  if (contested.length) {
    console.log('\n⚠ accounts claimed by another member (left alone, needs an admin decision):')
    console.table(contested)
  }

  console.log(`\nfirst 10 ${apply ? 'bound' : 'would bind'}:`)
  console.table(bound.slice(0, 10))

  if (!apply) console.log('\nDry run only — re-run with --apply to write.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
