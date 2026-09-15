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
 * NEXT_PUBLIC_LIFF_ID). This is a DIFFERENT channel from the Messaging API
 * channel that LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN belong to --
 * mixing the two up is a common failure mode of a LIFF integration.
 *
 * ⚠️⚠️ It must ALSO be under the same LINE Developers PROVIDER as the real
 * Hosttail Messaging API channel (the OA customers actually follow) --
 * confirmed 2026-09-15: LINE user IDs are scoped per PROVIDER, not per
 * channel, so a Login channel under a different provider issues a
 * completely unrelated line_uid for the same real person. The channel
 * hardcoded in legacy/index.html (2010446478) turned out to have been
 * created under a former developer's PERSONAL provider, unrelated to the
 * org-owned one -- the 72 real legacy members' line_uids from that channel
 * are permanently unusable here regardless of this env var's value. The
 * live channel is 1660779377, under the org provider. See
 * submit.ts's phone-based ht_merge_members() call for how those legacy
 * members get their history re-linked on their first login under the new
 * provider. Confirm the login channel id (and its provider) in the LINE
 * Developers console before relying on this in production.
 *
 * The caller MUST treat `claims.sub` as the only valid source of a member's
 * line_uid. Never accept a line_uid from a request body -- that is exactly
 * the vulnerability the legacy page had (it posted `liff.getProfile().userId`
 * as a plain form field with no server-side verification at all).
 */
export async function verifyLineIdToken(idToken: string): Promise<LineIdTokenClaims | null> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID
  if (!channelId) {
    console.error('[liff/verify] LINE_LOGIN_CHANNEL_ID is not set in this environment')
    return null
  }
  if (!idToken) return null

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

  // Read the body once as text regardless of status -- LINE's verify
  // endpoint returns a JSON error body (e.g. invalid_client / token
  // expired) on 4xx, and logging it is the only way to tell "wrong
  // channel id" apart from "expired token" apart from "not our token"
  // without ever logging the token itself.
  const rawBody = await res.text()
  if (!res.ok) {
    console.error(
      `[liff/verify] LINE verify endpoint rejected the token: HTTP ${res.status} ${rawBody} (client_id used: ${channelId})`
    )
    return null
  }

  let claims: LineIdTokenClaims
  try {
    claims = JSON.parse(rawBody) as LineIdTokenClaims
  } catch {
    console.error('[liff/verify] LINE verify endpoint returned a non-JSON 200 body:', rawBody)
    return null
  }

  // LINE already validates aud/exp server-side when client_id is supplied,
  // but re-check locally so a future change at LINE's endpoint can never
  // silently widen what this app accepts.
  if (claims.aud !== channelId) {
    console.error(`[liff/verify] aud mismatch: token aud=${claims.aud}, expected=${channelId}`)
    return null
  }
  if (claims.iss !== LINE_ISSUER) {
    console.error(`[liff/verify] unexpected iss: ${claims.iss}`)
    return null
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    console.error(`[liff/verify] token expired or missing exp: exp=${claims.exp}`)
    return null
  }
  if (!/^U[0-9a-f]{32}$/.test(claims.sub)) {
    console.error('[liff/verify] sub does not match the expected LINE uid shape')
    return null
  }

  return claims
}
