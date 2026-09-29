'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { CAMPAIGN_MEDIA_BUCKET } from '@/lib/campaigns/messages'
import { createImageUploadUrls } from './actions'

export interface UploadedImage {
  path: string
  previewPath: string
  width: number
  height: number
}

/** Draw `bitmap` scaled to fit `maxSide`, as JPEG no larger than `maxBytes`. */
async function toJpeg(bitmap: ImageBitmap, maxSide: number, maxBytes: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // LINE has no transparency in chat: flatten PNGs onto white, not black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    if (blob && blob.size <= maxBytes) return { blob, width, height }
  }
  throw new Error('รูปใหญ่เกินไป ลองใช้รูปที่เล็กลง')
}

/**
 * Picks an image, resizes it in the browser to what LINE accepts (full copy
 * ≤ 2048px / 10MB, preview ≤ 1024px / 1MB), and uploads both straight to
 * Storage with signed URLs.
 */
export function ImagePicker({ onUploaded, label = 'เลือกรูป' }: { onUploaded: (img: UploadedImage) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handle(file: File) {
    setError('')
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return setError('รองรับไฟล์ JPG หรือ PNG')
    if (file.size > 20 * 1024 * 1024) return setError('ไฟล์ต้องไม่เกิน 20MB')
    setBusy(true)
    try {
      const bitmap = await createImageBitmap(file)
      const full = await toJpeg(bitmap, 2048, 10 * 1024 * 1024)
      const preview = await toJpeg(bitmap, 1024, 1024 * 1024)
      bitmap.close()

      const urls = await createImageUploadUrls('image/jpeg')
      if (!urls.ok) throw new Error(urls.message)
      const bucket = createClient().storage.from(CAMPAIGN_MEDIA_BUCKET)
      const [a, b] = await Promise.all([
        bucket.uploadToSignedUrl(urls.full.path, urls.full.token, full.blob, { contentType: 'image/jpeg' }),
        bucket.uploadToSignedUrl(urls.preview.path, urls.preview.token, preview.blob, { contentType: 'image/jpeg' }),
      ])
      if (a.error || b.error) throw new Error((a.error ?? b.error)!.message)
      onUploaded({ path: urls.full.path, previewPath: urls.preview.path, width: full.width, height: full.height })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'กำลังอัปโหลด...' : label}
      </Button>
      {error && <span className="text-xs text-[var(--ht-error)]">{error}</span>}
    </span>
  )
}
