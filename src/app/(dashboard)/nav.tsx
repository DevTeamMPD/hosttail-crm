'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { isPathAllowed, type HtRole } from '@/lib/permissions'

// Only routes that actually exist. /segments and /settings are added back as
// they ship -- a nav link to a 404 is worse than a missing one.
const LINKS = [
  { href: '/overview', label: 'ภาพรวม' },
  { href: '/customers', label: 'ลูกค้า' },
  { href: '/marketing', label: 'การตลาด' },
  { href: '/approvals', label: 'รออนุมัติ', badge: true },
] as const

const ROLE_LABEL: Record<HtRole, string> = {
  admin: 'ผู้ดูแลระบบ',
  marketing: 'การตลาด',
  viewer: 'ดูอย่างเดียว',
}

/**
 * Brown sidebar from the "Hosttail Dashboard" design. Below lg it collapses
 * to a top bar with the same links, so the back office still works on a phone.
 */
export function DashboardNav({ role, displayName, pending }: { role: HtRole; displayName: string; pending: number }) {
  const pathname = usePathname()
  // Hide what this role cannot open anyway -- proxy.ts would bounce them.
  const visible = LINKS.filter((l) => isPathAllowed(l.href, role))

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const links = visible.map((l) => {
    const active = pathname === l.href || pathname.startsWith(l.href + '/')
    return (
      <Link
        key={l.href}
        href={l.href}
        className="flex h-[42px] shrink-0 items-center gap-2.5 rounded-[10px] px-3 text-sm whitespace-nowrap transition-colors"
        style={
          active
            ? { background: 'var(--ht-primary)', color: '#fff', fontWeight: 600 }
            : { color: '#f5e6da' }
        }
      >
        <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: active ? 'var(--ht-yellow)' : '#9c7f69' }} />
        <span className="flex-1">{l.label}</span>
        {'badge' in l && pending > 0 && (
          <span className="font-ht-mono rounded-full bg-[var(--ht-yellow)] px-[7px] py-0.5 text-[11px] font-medium text-[var(--ht-brown)]">
            {pending}
          </span>
        )}
      </Link>
    )
  })

  const initial = displayName.trim().charAt(0) || '?'

  return (
    <aside className="flex flex-col gap-3 bg-[var(--ht-brown)] px-3.5 py-3 text-[#fff1e7] lg:sticky lg:top-0 lg:h-screen lg:gap-6 lg:py-5">
      <div className="flex items-center gap-3 lg:contents">
        <Link href="/overview" className="flex shrink-0 items-center gap-2.5 px-2">
          <Image src="/logo.png" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full bg-white object-cover" />
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold text-white">Hosttail CRM</span>
            <span className="font-ht-mono text-[10px] text-[var(--ht-yellow)]">PHASE 1</span>
          </span>
        </Link>
        <button type="button" onClick={logout} className="ml-auto text-xs text-[#e7d3c3] lg:hidden">
          ออก
        </button>
      </div>

      <nav className="flex gap-0.5 overflow-x-auto lg:flex-col">{links}</nav>

      <div className="mt-auto hidden items-center gap-2.5 border-t border-[#85654e] px-2 pt-3 lg:flex">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ht-yellow)] text-[13px] font-semibold text-[var(--ht-brown)]">
          {initial}
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-snug">
          <span className="truncate text-[13px] text-white">{displayName}</span>
          <span className="text-[11px] text-[#e7d3c3]">{ROLE_LABEL[role]}</span>
        </div>
        <button type="button" onClick={logout} className="text-xs text-[#e7d3c3] hover:text-white" aria-label="ออกจากระบบ">
          ออก
        </button>
      </div>
    </aside>
  )
}
