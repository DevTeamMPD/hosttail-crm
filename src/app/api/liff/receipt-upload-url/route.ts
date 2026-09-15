import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLiffSession } from '@/lib/liff/session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

const BodySchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 * 1024, 'ไฟล์ต้องมีขนาดไม่เกิน 8MB'),
})

/**
 * Mints a short-lived, single-use signed upload URL for a receipt photo.
 *
 * Deliberately NOT a server-side upload route: Vercel serverless functions
 * cap request bodies at 4.5MB, and a modern phone photo routinely exceeds
 * that -- server-side upload would silently fail on a meaningful fraction of
 * real receipts, the exact class of bug the legacy page already had (it told
 * customers to attach a receipt photo but never actually built the upload).
 *
 * The object key is chosen HERE, not by the client, so a client can never
 * write outside its own member_id prefix.
 */
export async function POST(req: Request) {
  const session = await readLiffSession(req)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await rateLimit(`liff-receipt-url:${session.memberId}`, 10, 60_000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { contentType } = parsed.data
  const objectKey = `${session.memberId}/${randomUUID()}.${EXT[contentType]}`

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from('ht-receipts').createSignedUploadUrl(objectKey)
  if (error) {
    console.error('[api/liff/receipt-upload-url]', error.message)
    return NextResponse.json({ error: 'upload_url_failed' }, { status: 500 })
  }

  return NextResponse.json({ objectKey, token: data.token, path: data.path })
}
