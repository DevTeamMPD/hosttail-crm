'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/home', label: 'หน้าหลัก' },
  { href: '/profile', label: 'ข้อมูลสมาชิก' },
  { href: '/warranty', label: 'การรับประกัน' },
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
        className="grid w-full max-w-md grid-cols-3 border-t border-[var(--ht-divider)] bg-white/95 px-2 pt-2 backdrop-blur"
        style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}
        role="tablist"
        aria-label="เมนูหลัก"
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className="flex flex-col items-center gap-1 py-1 text-[11px]"
              style={{ color: active ? 'var(--ht-primary)' : 'var(--ht-muted)', fontWeight: active ? 600 : 500 }}
            >
              <span
                aria-hidden
                className="h-1 w-7 rounded-sm"
                style={{ background: active ? 'var(--ht-primary)' : 'transparent' }}
              />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
