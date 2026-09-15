'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, User, ShieldCheck, Gift } from 'lucide-react'

const TABS = [
  { href: '/home', label: 'หน้าหลัก', icon: Home },
  { href: '/profile', label: 'ข้อมูลสมาชิก', icon: User },
  { href: '/warranty', label: 'การรับประกัน', icon: ShieldCheck },
  { href: '/privileges', label: 'สิทธิพิเศษ', icon: Gift },
] as const

/**
 * Fixed to the viewport bottom but width-capped and centered to match the
 * `max-w-md` column the rest of the LIFF app renders in (src/app/(liff)/layout.tsx)
 * -- otherwise it'd stretch edge-to-edge on a desktop test window while the
 * content above stays centered.
 */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center">
      <nav
        className="flex w-full max-w-md border-t border-gray-100 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="tablist"
        aria-label="เมนูหลัก"
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
              style={{ color: active ? 'var(--ht-primary)' : 'var(--ht-muted)' }}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
