'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLiffGate } from '@/lib/liff/use-liff-gate'
import { LiffLoadingScreen, LiffErrorScreen } from '@/lib/liff/liff-gate-screens'
import { RegisterForm } from './register-form'
import type { ProvinceOption } from './province-select'

interface Props {
  provinces: ProvinceOption[]
  termsBody: string
  /** `?new=1`, read on the server so it is right on the first render. */
  forceForm: boolean
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
export function RegisterClient({ provinces, termsBody, forceForm }: Props) {
  const { state, retry } = useLiffGate()
  const router = useRouter()
  // forceForm comes from the server page's searchParams. It used to be read
  // off window.location on first render, but on a client-side <Link> to
  // /register?new=1 Next.js has not updated the URL yet at that point, so the
  // flag read false and returning members were bounced straight back to /home.

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

  return <RegisterForm member={state.member} provinces={provinces} termsBody={termsBody} />
}
