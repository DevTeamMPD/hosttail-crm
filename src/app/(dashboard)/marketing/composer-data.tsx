import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getBroadcastSettings } from '@/lib/settings'

/** What the composer needs besides the campaign itself. */
export async function loadComposerData() {
  const supabase = await createClient()
  const [{ data: segments }, { data: testMembers }, settings] = await Promise.all([
    supabase.from('ht_segments').select('id, name, kind').order('name'),
    supabase
      .from('ht_members')
      .select('id, full_name, line_display_name')
      .eq('is_test', true)
      .eq('status', 'active')
      .not('line_uid', 'is', null)
      .order('full_name'),
    getBroadcastSettings(supabase),
  ])
  return {
    segments: (segments ?? []).map((s) => ({ id: s.id, name: s.name, manual: s.kind === 'manual' })),
    testMembers: (testMembers ?? []).map((m) => ({ id: m.id, name: m.full_name ?? m.line_display_name ?? '(บัญชีทดสอบ)' })),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    dryRun: settings.dry_run,
  }
}

export function DryRunNotice({ dryRun }: { dryRun: boolean }) {
  if (!dryRun) return null
  return (
    <p className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--ht-warning-bg)', color: 'var(--ht-warning)' }}>
      <b>โหมดทดลองเปิดอยู่</b> — กดส่งแล้วระบบจะทำทุกขั้นตอน (บันทึกรายชื่อผู้รับ) แต่<b>ไม่ส่งถึงลูกค้าจริง</b>{' '}
      ปิดได้ที่ <code className="text-xs">ht_settings</code> key <code className="text-xs">broadcast</code> →{' '}
      <code className="text-xs">&quot;dry_run&quot;: false</code> · ปุ่ม “ส่งทดสอบ” ส่งจริงเสมอ (เฉพาะบัญชีทดสอบ)
    </p>
  )
}
