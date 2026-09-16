/**
 * Create or update a dashboard staff account (Supabase Auth user + ht_staff row).
 *
 *   npx tsx scripts/create-staff.ts --email you@mpdgroup.co --name "ชื่อ" --role admin
 *   npx tsx scripts/create-staff.ts --email ... --role viewer --password 'xxx'
 *   npx tsx scripts/create-staff.ts --list
 *   npx tsx scripts/create-staff.ts --email ... --deactivate
 *
 * Roles: admin | marketing | viewer (see src/lib/permissions.ts for what each
 * one may open). When --password is omitted a strong one is generated and
 * printed once -- it is never stored anywhere, so copy it before closing.
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function generatePassword(): string {
  // 18 bytes of base64url -- no ambiguous-character substitutions, because
  // silently mangling a generated password is worse than an awkward one.
  return crypto.randomBytes(18).toString('base64url')
}

async function main() {
  const env = loadEnvLocal()
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (process.argv.includes('--list')) {
    const { data, error } = await supabase
      .from('ht_staff')
      .select('email, display_name, role, is_active, created_at')
      .order('created_at')
    if (error) throw new Error(error.message)
    if (!data?.length) {
      console.log('no staff accounts yet.')
      return
    }
    console.table(data)
    return
  }

  const email = arg('email')
  if (!email) {
    console.error('usage: --email <email> [--name <name>] [--role admin|marketing|viewer] [--password <pw>] | --list | --email <email> --deactivate')
    process.exit(1)
  }

  if (process.argv.includes('--deactivate')) {
    const { error } = await supabase.from('ht_staff').update({ is_active: false }).eq('email', email)
    if (error) throw new Error(error.message)
    console.log(`deactivated ${email} (auth user kept; re-activate by re-running without --deactivate)`)
    return
  }

  const role = arg('role') ?? 'viewer'
  if (!['admin', 'marketing', 'viewer'].includes(role)) {
    throw new Error(`invalid role "${role}" -- use admin, marketing or viewer`)
  }
  const displayName = arg('name') ?? email.split('@')[0]
  const password = arg('password') ?? generatePassword()
  const generated = !arg('password')

  // The auth user may already exist from an earlier run or another app in this
  // shared project, so look before creating.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`)
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  let userId: string
  if (existing) {
    userId = existing.id
    // This Supabase project is shared with several other MPD apps, so an
    // existing auth user very likely signs in to those too. Silently rotating
    // its password locks the person out everywhere -- which is exactly what
    // this script did to dev@mpdgroup.co on 2026-09-15. Changing a password
    // now has to be asked for explicitly.
    if (!arg('password')) {
      console.log(`auth user already exists (${email}) -- password left untouched.`)
      console.log('Pass --password <value> if you really mean to change it.')
    } else {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password })
      if (error) throw new Error(`password update failed: ${error.message}`)
      console.log(`auth user already existed -- password set to the value you supplied (${email})`)
    }
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // internal accounts: no confirmation mail round-trip
    })
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
    userId = data.user.id
    console.log(`auth user created (${email})`)
  }

  const { error: staffErr } = await supabase
    .from('ht_staff')
    .upsert(
      { auth_user_id: userId, email, display_name: displayName, role, is_active: true },
      { onConflict: 'auth_user_id' }
    )
  if (staffErr) throw new Error(`ht_staff upsert failed: ${staffErr.message}`)

  console.log(`\n  email : ${email}`)
  console.log(`  role  : ${role}`)
  console.log(`  name  : ${displayName}`)
  if (generated && !existing) {
    console.log(`\n  password (shown once, not stored anywhere):\n  ${password}\n`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
