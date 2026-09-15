import 'server-only'

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'
const LINE_ISSUER = 'https://access.line.me'

export interface LineIdTokenClaims {
  iss: string
  sub: string // the LINE user id -- the ONLY trustworthy source of line_uid
  aud: string
  exp: number
  iat: number
  name?: string
  picture?: string
}

/**
 * Verifies a LINE ID token against LINE's own endpoint and returns its
 * claims, or null if the token is missing, expired, or does not belong to
 * our LINE Login channel.
 *
 * ⚠️ LINE_LOGIN_CHANNEL_ID is the LOGIN channel id (the numeric prefix of
 * NEXT_PUBLIC_LIFF_ID, e.g. "2010446478"). This is a DIFFERENT channel from
 * the Messaging API channel that LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN
 * belong to -- mixing the two up is the most common failure mode of a LIFF
 * integration. Confirm the login channel id in the LINE Developers console
 * before relying on this in production.
 *
 * The caller MUST treat `claims.sub` as the only valid source of a member's
 * line_uid. Never accept a line_uid from a request body -- that is exactly
 * the vulnerability the legacy page had (it posted `liff.getProfile().userId`
 * as a plain form field with no server-side verification at all).
 */
export async function verifyLineIdToken(idToken: string): Promise<LineIdTokenClaims | null> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID
  if (!channelId || !idToken) return null

  let res: Response
  try {
    res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      cache: 'no-store',
    })
  } catch (err) {
    console.error('[liff/verify] network error calling LINE verify endpoint', err)
    return null
  }
  if (!res.ok) return null

  let claims: LineIdTokenClaims
  try {
    claims = (await res.json()) as LineIdTokenClaims
  } catch {
    return null
  }

  // LINE already validates aud/exp server-side when client_id is supplied,
  // but re-check locally so a future change at LINE's endpoint can never
  // silently widen what this app accepts.
  if (claims.aud !== channelId) return null
  if (claims.iss !== LINE_ISSUER) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null
  if (!/^U[0-9a-f]{32}$/.test(claims.sub)) return null

  return claims
}
