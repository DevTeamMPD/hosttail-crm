import { z } from 'zod'

/**
 * A campaign's content: up to 5 bubbles, the same limit LINE OA Manager and
 * the Messaging API put on one broadcast. Stored as ht_campaigns.messages.
 * Shared by the composer (preview, client-side checks) and the sender.
 */
export const MAX_BUBBLES = 5
export const MAX_TEXT = 5000
export const CAMPAIGN_MEDIA_BUCKET = 'ht-campaign-media'

const httpsUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((u) => /^https?:\/\/[^\s]+$/i.test(u), 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')

export const TextBubbleSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1, 'ข้อความว่าง').max(MAX_TEXT, `ข้อความยาวเกิน ${MAX_TEXT} ตัวอักษร`),
})

export const ImageBubbleSchema = z.object({
  type: z.literal('image'),
  /** Object key in the ht-campaign-media bucket (≤ 2048px, ≤ 10MB). */
  path: z.string().regex(/^campaigns\/[\w-]+\.(jpg|png)$/),
  /**
   * Object key of a ≤ 1024px, ≤ 1MB copy: LINE's preview image, and the image
   * of the Flex bubble (Flex images are capped at 1024×1024).
   */
  previewPath: z.string().regex(/^campaigns\/[\w-]+\.(jpg|png)$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Optional: tapping the image opens this link (sent as a Flex bubble). */
  linkUrl: z.union([httpsUrl, z.literal('')]).optional(),
})

export const BubbleSchema = z.discriminatedUnion('type', [TextBubbleSchema, ImageBubbleSchema])
export const BubblesSchema = z
  .array(BubbleSchema)
  .min(1, 'ใส่ข้อความหรือรูปอย่างน้อย 1 กล่อง')
  .max(MAX_BUBBLES, `ส่งได้สูงสุด ${MAX_BUBBLES} กล่องต่อครั้ง`)

export type TextBubble = z.infer<typeof TextBubbleSchema>
export type ImageBubble = z.infer<typeof ImageBubbleSchema>
export type Bubble = z.infer<typeof BubbleSchema>

/** URLs inside a text bubble -- LINE auto-links these, so they get tracked too. */
// Stops at whitespace, brackets, quotes and Thai letters (Thai is written
// without spaces, so "https://x.co/aคลิกเลย" must end at the "a"), and does
// not swallow trailing punctuation.
const URL_IN_TEXT = /https?:\/\/[^\s<>"'()\u0E00-\u0E7F]*[^\s<>"'().,!?;:\u0E00-\u0E7F]/gi

/**
 * Every link in a campaign, in a fixed order (bubble by bubble, left to
 * right). The index into this list is the /c/<token>/<n> link number, so it
 * must be computed the same way at send time and when reading click stats.
 */
export function campaignLinks(bubbles: Bubble[]): string[] {
  const links: string[] = []
  for (const b of bubbles) {
    if (b.type === 'text') links.push(...(b.text.match(URL_IN_TEXT) ?? []))
    else if (b.linkUrl) links.push(b.linkUrl)
  }
  return links
}

/** Public URL of an object in the campaign media bucket. */
export function mediaUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${CAMPAIGN_MEDIA_BUCKET}/${path}`
}

/** Short preview used for a Flex message's altText and the campaign list. */
export function campaignSummary(bubbles: Bubble[]): string {
  const text = bubbles.find((b): b is TextBubble => b.type === 'text')?.text
  const s = text ? text.replace(/\s+/g, ' ').trim() : 'รูปภาพ'
  return s.length > 100 ? s.slice(0, 99) + '…' : s
}

// ── LINE message objects ────────────────────────────────────────────────────

export type LineCampaignMessage =
  | { type: 'text'; text: string }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string }
  | { type: 'flex'; altText: string; contents: Record<string, unknown> }

/** LINE Flex aspect ratios: each side 1..100000 and height ≤ 3 × width. */
function flexAspect(width: number, height: number): string {
  const h = Math.min(height, width * 3)
  return `${width}:${Math.max(1, Math.round(h))}`
}

/**
 * The LINE messages for one recipient. `trackedUrl(n)` returns the redirect
 * URL for link n (see campaignLinks); pass `(n) => links[n]` to send the raw
 * links instead (a test send that should not count as a click).
 */
export function buildLineMessages(
  bubbles: Bubble[],
  opts: { supabaseUrl: string; trackedUrl: (index: number) => string }
): LineCampaignMessage[] {
  let n = 0
  const altText = campaignSummary(bubbles)
  return bubbles.map((b) => {
    if (b.type === 'text') {
      // A space before Thai text that directly follows a link, so LINE's own
      // linkifier cannot run the tracked URL into the next word.
      const text = b.text.replace(URL_IN_TEXT, (match: string, offset: number, whole: string) => {
        const next = whole.charAt(offset + match.length)
        return opts.trackedUrl(n++) + (/[\u0E00-\u0E7F]/.test(next) ? ' ' : '')
      })
      return { type: 'text', text }
    }
    const original = mediaUrl(opts.supabaseUrl, b.path)
    const preview = mediaUrl(opts.supabaseUrl, b.previewPath)
    if (!b.linkUrl) return { type: 'image', originalContentUrl: original, previewImageUrl: preview }
    // A plain image message cannot carry a link; a Flex bubble that is just
    // a full-bleed tappable image looks the same in the chat.
    return {
      type: 'flex',
      altText,
      contents: {
        type: 'bubble',
        size: 'giga',
        hero: {
          type: 'image',
          url: preview,
          size: 'full',
          aspectRatio: flexAspect(b.width, b.height),
          aspectMode: 'cover',
          action: { type: 'uri', label: 'เปิดลิงก์', uri: opts.trackedUrl(n++) },
        },
      },
    }
  })
}
