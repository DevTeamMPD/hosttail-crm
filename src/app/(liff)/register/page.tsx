import type { Metadata } from 'next'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { RegisterClient } from './register-client'

export const metadata: Metadata = {
  title: 'ลงทะเบียนรับประกันสินค้า — Hosttail',
}

// Static per request, not cached across requests -- ht_provinces and the
// current terms document rarely change, but this is server-only data the
// customer's browser could never fetch directly anyway (RLS on ht_provinces
// restricts SELECT to staff; a LIFF customer has no Supabase Auth session).
export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
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
      <header
        className="flex flex-col items-center gap-2 px-4 pt-8 pb-6 text-center text-white"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary) 0%, var(--ht-deep) 100%)' }}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-md">
          <Image src="/logo.png" alt="Hosttail" width={80} height={80} className="rounded-full" priority />
        </div>
        <p className="text-xs tracking-[4px] opacity-90">PET VARIETY STORE</p>
        <span className="mt-1 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium">
          🛡️ ลงทะเบียนรับประกันสินค้า
        </span>
      </header>
      <RegisterClient provinces={provinces ?? []} termsBody={termsDoc?.body_md ?? ''} />
    </>
  )
}
