import 'server-only'

/**
 * LINE's aggregate numbers for one customAggregationUnit (= one campaign).
 * Every count is null while fewer than 20 users are involved -- LINE's own
 * privacy threshold -- and numbers settle about a day after sending.
 * https://developers.line.biz/en/reference/messaging-api/#get-statistics-per-unit
 */
export interface LineUnitInsight {
  overview: {
    uniqueImpression: number | null
    uniqueClick: number | null
    uniqueMediaPlayed: number | null
    uniqueMediaPlayed100Percent: number | null
  }
  messages: { seq: number; impression: number | null; uniqueImpression: number | null }[]
  clicks: { seq: number; url: string; click: number | null; uniqueClick: number | null }[]
}

/** yyyyMMdd in Asia/Tokyo -- the timezone LINE's insight API counts days in. */
function tokyoDay(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, '')
}

export async function fetchUnitInsight(
  unit: string,
  sentAt: Date
): Promise<{ ok: true; data: LineUnitInsight } | { ok: false; error: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN is not set' }

  // The API accepts a window of at most 30 days.
  const from = sentAt.getTime()
  const to = Math.min(Date.now(), from + 29 * 86_400_000)
  const qs = new URLSearchParams({ customAggregationUnit: unit, from: tokyoDay(from), to: tokyoDay(to) })
  try {
    const res = await fetch(`https://api.line.me/v2/bot/insight/message/event/aggregation?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${(await res.text()).slice(0, 300)}` }
    return { ok: true, data: (await res.json()) as LineUnitInsight }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
