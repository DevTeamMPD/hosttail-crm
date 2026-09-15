/**
 * Manage internal test accounts.
 *
 *   npx tsx scripts/test-member.ts --list
 *   npx tsx scripts/test-member.ts --mark <lineUid|memberId>
 *   npx tsx scripts/test-member.ts --unmark <lineUid|memberId>
 *   npx tsx scripts/test-member.ts --reset <lineUid|memberId>          # dry-run
 *   npx tsx scripts/test-member.ts --reset <lineUid|memberId> --apply
 *
 * A test account may register REAL order ids -- that is the only way to prove
 * resolve.ts actually works -- because every write it produces is scoped to
 * itself: ux_ht_warranty_member_orderkey is per member, so the real buyer can
 * still claim the same order afterwards. The one write that would escape is
 * the platform-account binding, and bind-account.ts refuses it outright for
 * test members.
 *
 * --reset returns the account to a clean slate so the same order can be
 * exercised again: registrations and warranty items are voided (never
 * deleted), and the points balance is zeroed with a compensating ledger entry,
 * because ht_points_ledger is append-only and a trigger blocks UPDATE/DELETE.
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

type Client = ReturnType<typeof createClient<Database>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveMember(supabase: Client, ref: string) {
  const column = UUID_RE.test(ref) ? 'id' : 'line_uid'
  const { data, error } = await supabase
    .from('ht_members')
    .select('id, line_uid, line_display_name, full_name, phone, is_test, points_balance, source')
    .eq(column, ref)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`no member matched ${column}=${ref}`)
  return data
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const flag = argv.find((a) => a.startsWith('--') && a !== '--apply')
  const ref = argv[argv.indexOf(flag ?? '') + 1]

  const env = loadEnvLocal()
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (flag === '--list') {
    const { data } = await supabase
      .from('ht_members')
      .select('id, line_uid, line_display_name, full_name, points_balance')
      .eq('is_test', true)
    if (!data?.length) {
      console.log('no test members. mark one with --mark <lineUid>')
      return
    }
    console.table(
      data.map((m) => ({
        member: m.id.slice(0, 8),
        line: m.line_display_name ?? '-',
        name: m.full_name ?? '-',
        points: m.points_balance,
        line_uid: m.line_uid,
      }))
    )
    return
  }

  if (!flag || !ref) {
    console.error('usage: --list | --mark <ref> | --unmark <ref> | --reset <ref> [--apply]')
    process.exit(1)
  }

  const member = await resolveMember(supabase, ref)

  if (flag === '--mark' || flag === '--unmark') {
    const isTest = flag === '--mark'
    const { error } = await supabase.from('ht_members').update({ is_test: isTest }).eq('id', member.id)
    if (error) throw new Error(error.message)
    console.log(`${isTest ? 'marked' : 'unmarked'} ${member.id} (${member.line_display_name ?? member.full_name ?? 'no name'}) as test`)
    if (isTest && member.source === 'legacy_sheet') {
      console.warn('⚠ this member came from the legacy import -- make sure it is really not a customer')
    }
    return
  }

  if (flag !== '--reset') {
    console.error(`unknown flag ${flag}`)
    process.exit(1)
  }

  if (!member.is_test) {
    console.error(`refusing: ${member.id} is not marked as a test member. Mark it first if that is intended.`)
    process.exit(1)
  }

  const [{ data: regs }, { data: items }, { data: bindings }] = await Promise.all([
    supabase
      .from('ht_warranty_registrations')
      .select('id, order_ref_raw, status')
      .eq('member_id', member.id)
      .neq('status', 'void'),
    supabase.from('ht_warranty_items').select('id, sku, status').eq('member_id', member.id).neq('status', 'void'),
    supabase
      .from('ht_member_platform_accounts')
      .select('id, shop, account_no')
      .eq('member_id', member.id)
      .eq('status', 'active'),
  ])

  console.log(`member            : ${member.id} (${member.line_display_name ?? member.full_name ?? 'no name'})`)
  console.log(`registrations     : ${regs?.length ?? 0} -> void`)
  console.log(`warranty items    : ${items?.length ?? 0} -> void`)
  console.log(`points balance    : ${member.points_balance} -> 0 (reversing ledger entry)`)
  console.log(`bindings          : ${bindings?.length ?? 0} -> revoked (should be 0; binding is blocked for test members)`)
  console.log(`mode              : ${apply ? 'APPLY' : 'dry-run'}`)

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to write.')
    return
  }

  if (regs?.length) {
    const { error } = await supabase
      .from('ht_warranty_registrations')
      .update({ status: 'void', review_note: 'test account reset' })
      .in('id', regs.map((r) => r.id))
    if (error) throw new Error(`voiding registrations failed: ${error.message}`)
  }
  if (items?.length) {
    const { error } = await supabase
      .from('ht_warranty_items')
      .update({ status: 'void' })
      .in('id', items.map((i) => i.id))
    if (error) throw new Error(`voiding items failed: ${error.message}`)
  }
  if (bindings?.length) {
    const { error } = await supabase
      .from('ht_member_platform_accounts')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoke_reason: 'test account reset' })
      .in('id', bindings.map((b) => b.id))
    if (error) throw new Error(`revoking bindings failed: ${error.message}`)
  }
  if (member.points_balance !== 0) {
    const { error } = await supabase.from('ht_points_ledger').insert({
      member_id: member.id,
      kind: 'adjust',
      points: -member.points_balance,
      source_type: 'manual',
      note: 'test account reset -- zeroing balance (ledger is append-only, so this is a compensating entry)',
    })
    if (error) throw new Error(`points reversal failed: ${error.message}`)
  }

  const after = await resolveMember(supabase, member.id)
  console.log(`\ndone. points balance now ${after.points_balance}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
