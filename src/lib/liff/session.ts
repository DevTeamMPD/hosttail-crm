import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

export const LIFF_SESSION_TTL_SEC = 30 * 60
const ISS = 'hosttail-liff'

function secret(): Uint8Array {
  const s = process.env.LIFF_SESSION_SECRET
  if (!s) throw new Error('LIFF_SESSION_SECRET is not set')
  return new TextEncoder().encode(s)
}

/**
 * Mints our own short-lived app token after a LINE ID token has been
 * verified server-side. A Bearer token (not a cookie) because LIFF runs in
 * LINE's in-app webview -- and on desktop LINE, sometimes an iframe -- where
 * SameSite cookie behaviour is inconsistent across iOS/Android/desktop LINE
 * versions. The token lives only in the client's memory and dies with the tab.
 */
export async function mintLiffSession(memberId: string, lineUid: string): Promise<string> {
  return new SignJWT({ uid: lineUid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(memberId)
    .setIssuer(ISS)
    .setAudience(ISS)
    .setIssuedAt()
    .setExpirationTime(`${LIFF_SESSION_TTL_SEC}s`)
    .sign(secret())
}

export interface LiffSession {
  memberId: string
  lineUid: string
}

/**
 * Reads and verifies the app-minted Bearer token from an incoming request.
 * Returns null on any failure -- callers MUST treat that as unauthenticated
 * and never fall back to a client-supplied id.
 *
 * Dev-only bypass: when NODE_ENV==='development' and both LIFF_DEV_MEMBER_ID
 * and LIFF_DEV_UID are set, skip verification entirely so the LIFF form can
 * be exercised at localhost:3000 without a real LINE webview. Mirrors the
 * NODE_ENV guard in verifyCronRequest() (src/lib/cron-auth.ts).
 */
export async function readLiffSession(req: Request): Promise<LiffSession | null> {
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.LIFF_DEV_MEMBER_ID &&
    process.env.LIFF_DEV_UID
  ) {
    return { memberId: process.env.LIFF_DEV_MEMBER_ID, lineUid: process.env.LIFF_DEV_UID }
  }

  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  try {
    const { payload } = await jwtVerify(header.slice(7), secret(), { issuer: ISS, audience: ISS })
    if (typeof payload.sub !== 'string' || typeof payload.uid !== 'string') return null
    return { memberId: payload.sub, lineUid: payload.uid }
  } catch {
    return null
  }
}
