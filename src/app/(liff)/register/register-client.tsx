'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useLiffGate } from '@/lib/liff/use-liff-gate'
import { LiffLoadingScreen, LiffErrorScreen } from '@/lib/liff/liff-gate-screens'
import { RegisterForm } from './register-form'
import { CheckLegacyMember } from './check-legacy-member'
import type { ProvinceOption } from './province-select'

interface Props {
  provinces: ProvinceOption[]
  termsBody: string
}

/**
 * Auth gate (see useLiffGate) then the registration/add-order form.
 *
 * A returning member (full_name + phone already set) who opens this page
 * bare -- i.e. via the LIFF app's configured entry point, not a link we
 * generated ourselves -- is sent straight to the bottom-nav app shell at
 * /home instead of seeing the form again. Our own "add a new order" CTAs
 * (Home/Warranty tabs) link here with `?new=1` to opt out of that redirect.
 */
export function RegisterClient({ provinces, termsBody }: Props) {
  const { state, retry, setMember } = useLiffGate()
  const router = useRouter()
  // Read directly off window (lazy initializer, not useEffect) rather than
  // useSearchParams() -- this component never renders anything that depends
  // on the flag until the async LIFF boot resolves (server-side it's always
  // the loading screen regardless), so there's no hydration mismatch, and no
  // need for the <Suspense> boundary useSearchParams() would require.
  const [forceForm] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === '1'
  )

  const isReady = state.phase === 'ready'
  const member = isReady ? state.member : null
  const isReturning = Boolean(member?.full_name && member?.phone)

  useEffect(() => {
    if (isReady && isReturning && !forceForm) {
      router.replace('/home')
    }
  }, [isReady, isReturning, forceForm, router])

  if (state.phase === 'checking' || state.phase === 'redirecting') return <LiffLoadingScreen />
  if (state.phase === 'error') return <LiffErrorScreen message={state.message} onRetry={retry} />
  if (isReturning && !forceForm) return <LiffLoadingScreen /> // brief flash while router.replace('/home') takes effect

  return (
    <div className="space-y-4 p-4 pb-2">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        {state.member.line_picture_url ? (
          <Image
            src={state.member.line_picture_url}
            alt=""
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-gray-200" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {state.member.line_display_name ?? 'สมาชิก LINE'}
          </p>
          <p
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ background: 'var(--ht-line)' }}
          >
            LINE
          </p>
        </div>
      </div>

      {!isReturning && <CheckLegacyMember onMerged={setMember} />}

      <RegisterForm member={state.member} provinces={provinces} termsBody={termsBody} />
    </div>
  )
}
