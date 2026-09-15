/**
 * Does the LINE userId space in order_tracking (LOA_hosttail.buyer_account_no)
 * match the one our LIFF Login channel issues? Answers it without anyone
 * having to place an order.
 *
 * LINE scopes a userId to a PROVIDER, so GET /v2/bot/profile/{userId} with our
 * Messaging API channel token only resolves a userId minted under the same
 * provider as that channel. Two probes:
 *
 *   A. LOA_hosttail buyer_account_no values  -> are order_tracking's UIDs ours?
 *   B. a member's line_uid from the LIFF Login channel -> is Login in the same
 *      provider as the Messaging API channel?
 *
 * 200 proves a match. 404 is ambiguous (wrong provider OR that person is not a
 * friend of the OA), which is why A probes a batch rather than one value.
 * Never prints the access token.
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

async function probe(token: string, uid: string) {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  let detail = ''
  if (res.ok) {
    const body = (await res.json()) as { displayName?: string }
    detail = body.displayName ?? ''
  } else {
    const body = await res.text()
    detail = body.slice(0, 80)
  }
  return { status: res.status, detail }
}

async function main() {
  const env = loadEnvLocal()
  const token = env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    console.error(
      'LINE_CHANNEL_ACCESS_TOKEN is empty in .env.local.\n' +
        'Get it from LINE Developers Console -> the Hosttail OA channel ->\n' +
        'Messaging API tab -> Channel access token (long-lived), then re-run.\n' +
        'The same token is required for Phase 3 broadcast, so it is needed either way.'
    )
    process.exit(1)
  }
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Probe A: userIds that appear as LINE OA buyers in order_tracking ──────
  const { data: loa, error } = await supabase
    .from('order_tracking')
    .select('buyer_account_no, buyer_name, created_at')
    .eq('shop', 'LOA_hosttail')
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) throw new Error(error.message)

  const uids = [...new Set((loa ?? []).map((r) => r.buyer_account_no).filter((u): u is string => /^U[0-9a-f]{32}$/.test(u ?? '')))]
  console.log(`LOA_hosttail distinct UID-shaped accounts: ${uids.length}`)
  console.log('probing the 12 most recent...\n')

  const results: Record<string, unknown>[] = []
  let ok = 0
  for (const uid of uids.slice(0, 12)) {
    const r = await probe(token, uid)
    if (r.status === 200) ok++
    results.push({ uid: `${uid.slice(0, 9)}...${uid.slice(-4)}`, http: r.status, result: r.status === 200 ? `OK: ${r.detail}` : r.detail })
  }
  console.table(results)
  console.log(`probe A: ${ok}/${results.length} resolved against our Messaging API channel\n`)

  // ── Probe B: a line_uid minted by our LIFF Login channel ─────────────────
  const { data: members } = await supabase
    .from('ht_members')
    .select('id, line_uid, line_display_name')
    .eq('source', 'liff')
    .not('line_uid', 'is', null)
    .limit(5)

  const bResults: Record<string, unknown>[] = []
  for (const m of members ?? []) {
    const r = await probe(token, m.line_uid!)
    bResults.push({
      member: m.line_display_name ?? m.id.slice(0, 8),
      uid: `${m.line_uid!.slice(0, 9)}...${m.line_uid!.slice(-4)}`,
      http: r.status,
      result: r.status === 200 ? `OK: ${r.detail}` : r.detail,
    })
  }
  console.log('probe B — line_uid from the LIFF Login channel:')
  console.table(bResults)

  console.log('\nreading:')
  console.log('  A 200 => order_tracking LOA userIds live in our provider')
  console.log('  B 200 => Login channel shares that provider, so line_uid == buyer_account_no')
  console.log('  404   => inconclusive (different provider, or not a friend of the OA)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
