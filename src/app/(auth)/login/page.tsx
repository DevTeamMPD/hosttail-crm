import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getHomePath } from '@/lib/permissions'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ — Hosttail CRM' }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Already signed in: skip the form rather than letting someone log in twice.
  if (await getStaffSession()) redirect(getHomePath())

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="Hosttail" width={56} height={56} className="rounded-full" priority />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Hosttail CRM</h1>
            <p className="text-xs text-gray-500">สำหรับทีมงานภายในเท่านั้น</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
