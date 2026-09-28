import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from './nav'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // src/proxy.ts already redirects unauthenticated navigation, but it trusts a
  // user-editable cookie for the role. This is the real gate: it reads
  // ht_staff on the server for every dashboard render.
  const session = await getStaffSession()
  if (!session) redirect('/login')

  // Queue size for the sidebar badge.
  const supabase = await createClient()
  const { count: pending } = await supabase
    .from('ht_warranty_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <div className="min-h-screen bg-[var(--ht-bg-from)] text-[var(--ht-ink)] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <DashboardNav role={session.role} displayName={session.displayName} pending={pending ?? 0} />
      <main className="min-w-0 px-4 py-6 lg:px-9 lg:pt-7 lg:pb-16">{children}</main>
    </div>
  )
}
