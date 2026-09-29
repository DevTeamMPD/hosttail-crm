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

export type PushResult = { ok: true } | { ok: false; error: string; retryable: boolean }

/**
 * Campaign variant of pushLineMessage: arbitrary message objects, tagged with
 * a customAggregationUnit (for LINE's per-campaign insight numbers), and sent
 * with an X-Line-Retry-Key so re-sending the same recipient -- a retried
 * batch, two staff pressing "send" at once -- can never deliver twice: LINE
 * answers 409 for a key it already accepted, which counts as sent here.
 */
export async function pushCampaignMessages(
  to: string,
  messages: object[],
  opts: { retryKey: string; aggregationUnit?: string }
): Promise<PushResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN is not set', retryable: false }
  if (!/^U[0-9a-f]{32}$/.test(to)) return { ok: false, error: 'invalid LINE user id', retryable: false }

  try {
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Line-Retry-Key': opts.retryKey,
      },
      body: JSON.stringify({
        to,
        messages,
        ...(opts.aggregationUnit ? { customAggregationUnits: [opts.aggregationUnit] } : {}),
      }),
      cache: 'no-store',
    })
    if (res.ok || res.status === 409) return { ok: true }
    const body = (await res.text()).slice(0, 500)
    // 429 = rate limit or monthly quota; 5xx = LINE side. Both may pass later.
    return { ok: false, error: `HTTP ${res.status} ${body}`, retryable: res.status === 429 || res.status >= 500 }
  } catch (err) {
    return { ok: false, error: `network error: ${String(err)}`.slice(0, 500), retryable: true }
  }
}
