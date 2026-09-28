import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { BrandHeader } from '../brand-header'
import { RegisterClient } from './register-client'

export const metadata: Metadata = {
  title: 'ลงทะเบียนรับประกันสินค้า — Hosttail',
}

// Static per request, not cached across requests -- ht_provinces and the
// current terms document rarely change, but this is server-only data the
// customer's browser could never fetch directly anyway (RLS on ht_provinces
// restricts SELECT to staff; a LIFF customer has no Supabase Auth session).
export const dynamic = 'force-dynamic'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { new: newParam } = await searchParams
  const supabase = createAdminClient()

  const [{ data: provinces }, { data: termsDoc }] = await Promise.all([
    supabase.from('ht_provinces').select('code, name_th, region').order('sort_order'),
    supabase
      .from('ht_consent_documents')
      .select('body_md')
      .eq('kind', 'terms')
      .eq('locale', 'th')
      .eq('is_current', true)
      .maybeSingle(),
  ])

  return (
    <>
      <BrandHeader />
      <RegisterClient
        provinces={provinces ?? []}
        termsBody={termsDoc?.body_md ?? ''}
        forceForm={newParam === '1'}
      />
    </>
  )
}
