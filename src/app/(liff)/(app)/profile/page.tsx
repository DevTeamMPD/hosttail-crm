import { createAdminClient } from '@/lib/supabase/admin'
import { ProfileForm } from './profile-form'

// Same reasoning as /register: ht_provinces is staff-only under RLS, so a
// LIFF customer's browser can never fetch it directly -- the admin client
// reads it here, server-side, and passes it down as plain props.
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const supabase = createAdminClient()
  const { data: provinces } = await supabase
    .from('ht_provinces')
    .select('code, name_th, region')
    .order('sort_order')

  return (
    <div className="flex flex-col gap-3 px-3.5 pt-8 pb-20">
      <h1 className="px-1 text-[22px] font-semibold text-[var(--ht-ink)]">ข้อมูลสมาชิก</h1>
      <ProfileForm provinces={provinces ?? []} />
    </div>
  )
}
