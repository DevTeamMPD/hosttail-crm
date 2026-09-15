'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLiffGate } from '@/lib/liff/use-liff-gate'
import { LiffLoadingScreen, LiffErrorScreen } from '@/lib/liff/liff-gate-screens'
import { MemberProvider } from './member-context'
import { BottomNav } from './bottom-nav'

/**
 * Shared shell for the 4 bottom-nav tabs (/home, /profile, /warranty,
 * /privileges). Runs the LIFF auth gate exactly once -- Next.js keeps this
 * layout mounted across navigations between sibling routes, so switching
 * tabs never re-runs liff.init()/the token exchange.
 *
 * A member with no profile yet (no full_name/phone -- i.e. they reached a
 * tab URL directly rather than finishing /register first) is bounced to
 * /register rather than each tab having to handle that incomplete state.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, retry, setMember } = useLiffGate()
  const router = useRouter()

  const incomplete = state.phase === 'ready' && !(state.member.full_name && state.member.phone)

  useEffect(() => {
    if (incomplete) router.replace('/register')
  }, [incomplete, router])

  if (state.phase === 'checking' || state.phase === 'redirecting') return <LiffLoadingScreen />
  if (state.phase === 'error') return <LiffErrorScreen message={state.message} onRetry={retry} />
  if (incomplete) return <LiffLoadingScreen /> // brief flash while router.replace('/register') takes effect

  return (
    <MemberProvider member={state.member} setMember={setMember}>
      <div className="flex min-h-screen flex-col">
        <div className="flex-1 pb-24">{children}</div>
        <BottomNav />
      </div>
    </MemberProvider>
  )
}
