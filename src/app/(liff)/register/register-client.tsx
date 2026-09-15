'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  initLiff,
  isLiffLoggedIn,
  loginLiff,
  bootstrapLiffSession,
  type LiffMemberPublic,
} from '@/lib/liff/client'
import { RegisterForm } from './register-form'
import type { ProvinceOption } from './province-select'

type GateState =
  | { phase: 'checking' }
  | { phase: 'redirecting' } // liff.login() is navigating away; component will unmount
  | { phase: 'error'; message: string }
  | { phase: 'ready'; member: LiffMemberPublic }

interface Props {
  provinces: ProvinceOption[]
  termsBody: string
}

/**
 * Auth gate: liff.init() -> isLoggedIn() -> getIDToken() -> POST
 * /api/liff/session -> server verifies against LINE -> upserts ht_members
 * keyed on the verified sub claim -> mints our own app token. Renders the
 * registration form only once that chain has succeeded.
 */
export function RegisterClient({ provinces, termsBody }: Props) {
  const [state, setState] = useState<GateState>({ phase: 'checking' })

  const boot = useCallback(async () => {
    try {
      await initLiff()
    } catch (err) {
      console.error('[register] liff.init failed', err)
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
      console.error('[register] session bootstrap failed', err)
      setState({ phase: 'error', message: 'ไม่สามารถยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง' })
    }
  }, [])

  useEffect(() => {
    boot()
  }, [boot])

  if (state.phase === 'checking' || state.phase === 'redirecting') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <div
            className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--ht-primary)] border-t-transparent"
            role="status"
            aria-label="กำลังโหลด"
          />
          <p className="text-sm text-gray-500">กำลังเชื่อมต่อ LINE...</p>
        </div>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
        <div className="w-full max-w-xs space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-base font-medium" style={{ color: 'var(--ht-error)' }}>
            {state.message}
          </p>
          <a
            href="https://line.me/R/ti/p/@hosttail"
            className="inline-block w-full rounded-full px-5 py-2.5 text-sm font-medium text-white"
            style={{ background: 'var(--ht-line)' }}
          >
            เปิด LINE OA @hosttail
          </a>
          <button
            type="button"
            onClick={() => {
              // Safe here (an event handler, not an effect body): show the
              // spinner immediately instead of leaving the error card up
              // until boot() resolves.
              setState({ phase: 'checking' })
              boot()
            }}
            className="block w-full text-sm text-gray-500 underline underline-offset-2"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    )
  }

  const { member } = state

  return (
    <div className="space-y-4 p-4 pb-2">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        {member.line_picture_url ? (
          <Image
            src={member.line_picture_url}
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
            {member.line_display_name ?? 'สมาชิก LINE'}
          </p>
          <p
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ background: 'var(--ht-line)' }}
          >
            LINE
          </p>
        </div>
      </div>

      <RegisterForm member={member} provinces={provinces} termsBody={termsBody} />
    </div>
  )
}
