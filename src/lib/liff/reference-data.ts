import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

/*
 * Reference data the LIFF pages render on the server. It changes rarely, so
 * it is cached for an hour instead of costing a database round trip on every
 * page open. RLS keeps these tables staff-only, hence the admin client; the
 * data itself is not per-member.
 */

export const getProvinces = unstable_cache(
  async () => {
    const { data } = await createAdminClient()
      .from('ht_provinces')
      .select('code, name_th, region')
      .order('sort_order')
    return data ?? []
  },
  ['ht-provinces'],
  { revalidate: 3600 }
)

export const getCurrentTermsBody = unstable_cache(
  async () => {
    const { data } = await createAdminClient()
      .from('ht_consent_documents')
      .select('body_md')
      .eq('kind', 'terms')
      .eq('locale', 'th')
      .eq('is_current', true)
      .maybeSingle()
    return data?.body_md ?? ''
  },
  ['ht-terms-current'],
  { revalidate: 3600 }
)
