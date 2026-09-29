import 'server-only'

const PUSH_URL = 'https://api.line.me/v2/bot/message/push'

export type LineMessage = { type: 'text'; text: string }

/**
 * Sends a push message through the Hosttail Messaging API channel
 * (LINE_CHANNEL_ACCESS_TOKEN -- NOT the Login channel, see liff/verify.ts).
 *
 * Best-effort: never throws. A failed push (member blocked the OA, token
 * missing, LINE outage) must never fail the action that triggered it.
 * Returns whether LINE accepted the message.
 */
export async function pushLineMessage(to: string, messages: LineMessage[]): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    console.error('[line/push] LINE_CHANNEL_ACCESS_TOKEN is not set in this environment')
    return false
  }
  if (!/^U[0-9a-f]{32}$/.test(to)) return false

  try {
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages }),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`[line/push] HTTP ${res.status} ${await res.text()}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[line/push] network error calling LINE push endpoint', err)
    return false
  }
}
