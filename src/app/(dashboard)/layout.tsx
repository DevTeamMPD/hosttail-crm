import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { DashboardNav } from './nav'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // src/proxy.ts already redirects unauthenticated navigation, but it trusts a
  // user-editable cookie for the role. This is the real gate: it reads
  // ht_staff on the server for every dashboard render.
  const session = await getStaffSession()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav role={session.role} displayName={session.displayName} />
      <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
