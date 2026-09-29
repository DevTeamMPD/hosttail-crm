import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { applyCustomerFilters, parseCustomerFilters, type CustomerFilters } from '@/lib/customer-filters'

type Client = SupabaseClient<Database>

export interface AudienceMember {
  id: string
  line_uid: string
}

export interface Audience {
  segmentName: string
  /** Everyone in the segment (active, non-test members). */
  total: number
  /** Who a campaign will actually go to. */
  members: AudienceMember[]
  /** In the segment but not sendable, by reason. */
  noLine: number
  unfollowed: number
  optedOut: number
}

const PAGE = 1000
const ID_CHUNK = 200

type Row = { id: string; line_uid: string | null; line_followed: boolean }

/**
 * Who a campaign to `segmentId` reaches right now: the segment's members (the
 * same filter logic as /customers) who have a LINE uid, still follow the OA,
 * and have not withdrawn marketing consent. Test accounts are never included
 * -- they get the "ส่งทดสอบ" button instead.
 */
export async function resolveAudience(supabase: Client, segmentId: string): Promise<Audience | null> {
  const { data: seg } = await supabase.from('ht_segments').select('name, kind, filters').eq('id', segmentId).maybeSingle()
  if (!seg) return null

  const select = () =>
    supabase.from('ht_members').select('id, line_uid, line_followed').eq('status', 'active').eq('is_test', false)

  const rows: Row[] = []
  if (seg.kind === 'manual') {
    const { data: links } = await supabase.from('ht_segment_members').select('member_id').eq('segment_id', segmentId)
    const ids = (links ?? []).map((l) => l.member_id)
    // Chunked: a long id list does not fit in one request URL.
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { data, error } = await select().in('id', ids.slice(i, i + ID_CHUNK))
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
    }
  } else {
    const filters: CustomerFilters = { ...parseCustomerFilters((seg.filters ?? {}) as Record<string, unknown>), seg: '' }
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await applyCustomerFilters(select(), filters, null)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
  }

  // Consent is opt-out today: nobody has been asked for marketing consent
  // yet, so only an explicit withdrawal (granted = false) excludes someone.
  const optedOutIds = new Set<string>()
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('ht_v_member_consent')
      .select('member_id')
      .eq('kind', 'marketing')
      .eq('granted', false)
      .range(from, from + PAGE - 1)
    for (const r of data ?? []) if (r.member_id) optedOutIds.add(r.member_id)
    if (!data || data.length < PAGE) break
  }

  const members: AudienceMember[] = []
  let noLine = 0
  let unfollowed = 0
  let optedOut = 0
  for (const r of rows) {
    if (!r.line_uid) noLine++
    else if (!r.line_followed) unfollowed++
    else if (optedOutIds.has(r.id)) optedOut++
    else members.push({ id: r.id, line_uid: r.line_uid })
  }
  return { segmentName: seg.name, total: rows.length, members, noLine, unfollowed, optedOut }
}
