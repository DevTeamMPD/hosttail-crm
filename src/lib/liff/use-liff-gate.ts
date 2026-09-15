'use client'

import { useCallback, useEffect, useState } from 'react'
import { initLiff, isLiffLoggedIn, loginLiff, bootstrapLiffSession, type LiffMemberPublic } from './client'

export type LiffGateState =
  | { phase: 'checking' }
  | { phase: 'redirecting' } // liff.login() is navigating away; component will unmount
  | { phase: 'error'; message: string }
  | { phase: 'ready'; member: LiffMemberPublic }

/**
 * The auth boot sequence every LIFF screen needs: liff.init() -> login check
 * -> exchange ID token for our app token + member row (see
 * /api/liff/session). Extracted so /register and the bottom-nav app shell
 * (/home, /profile, /warranty, /privileges) share one implementation instead
 * of two copies that can drift.
 */
export function useLiffGate() {
  const [state, setState] = useState<LiffGateState>({ phase: 'checking' })

  const boot = useCallback(async () => {
    try {
      await initLiff()
    } catch (err) {
      console.error('[liff-gate] liff.init failed', err)
      setState({ phase: 'error', message: 'กรุณาเปิดหน้านี้ผ่าน LINE OA @hosttail' })
      return
    }

    if (!isLiffLoggedIn()) {
      setState({ phase: 'redirecting' })
      loginLiff() // navigates away
      return
    }

    try {
      const member = await bootstrapLiffSession()
      if (!member) throw new Error('no member in response')
      setState({ phase: 'ready', member })
    } catch (err) {
      console.error('[liff-gate] session bootstrap failed', err)
      setState({ phase: 'error', message: 'ไม่สามารถยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง' })
    }
  }, [])

  useEffect(() => {
    // The classic fetch-on-mount pattern -- boot() is an async chain
    // (LIFF init -> login check -> network token exchange), not synchronous
    // state derived from props/state, so it can't be computed during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    boot()
  }, [boot])

  /** Update the member in place after a mutation (profile edit, legacy merge) without re-running the whole boot chain. */
  const setMember = useCallback((member: LiffMemberPublic) => {
    setState({ phase: 'ready', member })
  }, [])

  const retry = useCallback(() => {
    setState({ phase: 'checking' })
    boot()
  }, [boot])

  return { state, retry, setMember }
}
