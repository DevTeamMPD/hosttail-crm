import type { Metadata } from 'next'
import { getCurrentTermsBody, getProvinces } from '@/lib/liff/reference-data'
import { RegisterClient } from './register-client'

export const metadata: Metadata = {
  title: 'ลงทะเบียนรับประกันสินค้า — Hosttail',
}

// Dynamic for ?new=1; the provinces and terms it renders come from an
// hour-long server cache (src/lib/liff/reference-data.ts).
export const dynamic = 'force-dynamic'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { new: newParam } = await searchParams
  const [provinces, termsBody] = await Promise.all([getProvinces(), getCurrentTermsBody()])

  return (
    <>
      <RegisterClient
        provinces={provinces}
        termsBody={termsBody}
        forceForm={newParam === '1'}
      />
    </>
  )
}
