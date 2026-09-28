'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ShieldCheck, User } from 'lucide-react'

const TABS = [
  { href: '/home', label: 'หน้าหลัก', icon: Home },
  { href: '/profile', label: 'ข้อมูลสมาชิก', icon: User },
  { href: '/warranty', label: 'การรับประกัน', icon: ShieldCheck },
  // สิทธิพิเศษ (points) is hidden in Phase 1 -- see docs/PHASE1_PLAN.md.
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
        className="grid w-full max-w-md grid-cols-3 border-t border-[var(--ht-divider)] bg-white/95 px-2 backdrop-blur"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
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
              className="flex flex-col items-center gap-1 text-[13px]"
              style={{ color: active ? 'var(--ht-primary)' : 'var(--ht-muted)', fontWeight: active ? 600 : 500 }}
            >
              <span
                aria-hidden
                className="h-[3px] w-10 rounded-b-sm"
                style={{ background: active ? 'var(--ht-primary)' : 'transparent' }}
              />
              <Icon size={24} strokeWidth={active ? 2.3 : 1.8} aria-hidden className="mt-1" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
