'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, ClipboardCheck, LogOut } from 'lucide-react'
import { isPathAllowed, type HtRole } from '@/lib/permissions'

// Only routes that actually exist. /segments and /settings are added back as
// they ship -- a nav link to a 404 is worse than a missing one.
const LINKS = [
  { href: '/overview', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/customers', label: 'ลูกค้า', icon: Users },
  { href: '/approvals', label: 'รออนุมัติ', icon: ClipboardCheck },
] as const

const ROLE_LABEL: Record<HtRole, string> = {
  admin: 'ผู้ดูแลระบบ',
  marketing: 'การตลาด',
  viewer: 'ดูอย่างเดียว',
}

export function DashboardNav({ role, displayName }: { role: HtRole; displayName: string }) {
  const pathname = usePathname()
  // Hide what this role cannot open anyway -- proxy.ts would bounce them.
  const visible = LINKS.filter((l) => isPathAllowed(l.href, role))

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/overview" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
          <span className="text-sm font-semibold text-gray-900">Hosttail CRM</span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {visible.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/')
            const Icon = l.icon
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors"
                style={
                  active
                    ? { background: 'var(--ht-shopee-bg)', color: 'var(--ht-primary)', fontWeight: 600 }
                    : { color: '#4b5563' }
                }
              >
                <Icon size={16} aria-hidden />
                {l.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-medium text-gray-900">{displayName}</p>
            <p className="text-[11px] text-gray-500">{ROLE_LABEL[role]}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="ออกจากระบบ"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
