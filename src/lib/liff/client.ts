'use client'

import liff from '@line/liff'

export interface LiffMemberPublic {
  id: string
  line_uid: string
  line_display_name: string | null
  line_picture_url: string | null
  full_name: string | null
  phone: string | null
  province_code: string | null
  pet_types: string[]
  pet_other: string | null
  note: string | null
  points_balance: number
  points_lifetime: number
  tier_code: string | null
  registered_at: string
}

let appToken: string | null = null
let appTokenExp = 0
let inflight: Promise<LiffMemberPublic | null> | null = null

/** liff.init() only -- call once, before anything else. */
export async function initLiff(): Promise<void> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID
  if (!liffId) throw new Error('NEXT_PUBLIC_LIFF_ID is not set')
  await liff.init({ liffId })
}

export function isLiffLoggedIn(): boolean {
  return liff.isLoggedIn()
}

export function loginLiff(): void {
  liff.login({ redirectUri: window.location.href })
}

export function isInLineClient(): boolean {
  return liff.isInClient()
}

/** Fires 3s after a successful submit, matching the legacy page's UX. No-ops outside a real LINE webview. */
export function closeLiffWindow(): void {
  try {
    if (liff.isInClient()) liff.closeWindow()
  } catch {
    // closeWindow can throw outside a genuine LINE webview -- never let this crash the success screen.
  }
}

/**
 * Exchanges liff.getIDToken() for our own app token via POST /api/liff/session.
 * Called once per page-open (from initLiff's caller), and again automatically
 * by liffFetch() whenever the app token has expired.
 */
async function exchangeToken(): Promise<LiffMemberPublic | null> {
  const idToken = liff.getIDToken()
  if (!idToken) {
    // The `openid` scope was not granted on this LIFF app's login -- force
    // re-consent rather than calling the API with nothing.
    liff.login({ redirectUri: window.location.href })
    throw new Error('NO_ID_TOKEN')
  }

  const res = await fetch('/api/liff/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`LIFF_SESSION_${res.status}:${body.error ?? 'unknown'}`)
  }

  const data = (await res.json()) as {
    token: string
    expiresIn: number
    member: LiffMemberPublic
  }
  appToken = data.token
  appTokenExp = Date.now() + data.expiresIn * 1000
  return data.member
}

/** Call after initLiff() + a login check. Resolves to the member row (always non-null on success -- the session route always upserts a shell). */
export async function bootstrapLiffSession(): Promise<LiffMemberPublic | null> {
  inflight ??= exchangeToken().finally(() => {
    inflight = null
  })
  return inflight
}

async function getAppToken(): Promise<string> {
  if (appToken && Date.now() < appTokenExp - 60_000) return appToken
  await bootstrapLiffSession()
  if (!appToken) throw new Error('failed to obtain an app token')
  return appToken
}

/** All /api/liff/* calls should go through this. Retries once on 401 with a fresh token. */
export async function liffFetch(path: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
  const token = await getAppToken()
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 && allowRetry) {
    appToken = null
    appTokenExp = 0
    return liffFetch(path, init, false)
  }
  return res
}
