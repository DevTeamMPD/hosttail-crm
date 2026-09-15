'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { liffFetch } from '@/lib/liff/client'
import { createClient } from '@/lib/supabase/client'

interface Props {
  hasFile: boolean
  onUploaded: (objectKey: string) => void
  onClear: () => void
  disabled?: boolean
  error?: string
}

const MAX_DIM = 1600
const JPEG_QUALITY = 0.8

/**
 * Downscales on the client before upload (~500KB typical output for an
 * 8MB phone photo) -- fast on 4G, and keeps well under Storage's 8MB cap.
 * HEIC (iPhone default) can't be decoded via canvas in most browsers, so
 * it's uploaded as-is; the server-side size/type check still applies.
 */
async function downscaleImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    return blob ?? file
  } catch {
    return file // decode failed -- fall back to the original file
  }
}

export function ReceiptUpload({ hasFile, onUploaded, onClear, disabled, error }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('uploading')
    setMessage(null)
    try {
      const blob = await downscaleImage(file)
      const contentType = blob.type || file.type

      const res = await liffFetch('/api/liff/receipt-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, sizeBytes: blob.size }),
      })
      if (!res.ok) {
        throw new Error(res.status === 400 ? 'ไฟล์ไม่ถูกต้องหรือมีขนาดใหญ่เกินไป (สูงสุด 8MB)' : 'อัปโหลดไม่สำเร็จ')
      }
      const { objectKey: key, token } = (await res.json()) as { objectKey: string; token: string }

      const supabase = createClient()
      const { error: uploadErr } = await supabase.storage.from('ht-receipts').uploadToSignedUrl(key, token, blob)
      if (uploadErr) throw new Error(uploadErr.message)

      setPreview(URL.createObjectURL(blob))
      setStatus('done')
      onUploaded(key)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ')
    }
  }

  function clear() {
    setPreview(null)
    setStatus('idle')
    setMessage(null)
    if (inputRef.current) inputRef.current.value = ''
    onClear()
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        แนบรูปใบเสร็จ <span style={{ color: 'var(--ht-error)' }}>*</span>
      </p>

      {preview ? (
        <div className="relative w-32">
          <Image
            src={preview}
            alt="ตัวอย่างใบเสร็จ"
            width={128}
            height={128}
            unoptimized
            className="h-32 w-32 rounded-lg border object-cover"
          />
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs shadow"
            style={{ color: 'var(--ht-error)' }}
            aria-label="ลบรูป"
          >
            ✕
          </button>
        </div>
      ) : (
        <label
          className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-center text-xs text-gray-400"
          style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {status === 'uploading' ? (
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--ht-primary)', borderTopColor: 'transparent' }}
            />
          ) : (
            <>
              <span className="text-2xl" aria-hidden>
                📷
              </span>
              <span>แตะเพื่อถ่าย/เลือกรูป</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            capture="environment"
            className="sr-only"
            disabled={disabled || status === 'uploading'}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </label>
      )}

      {(message || error) && (
        <p className="text-xs" style={{ color: 'var(--ht-error)' }}>
          {message ?? error}
        </p>
      )}
      {!hasFile && !message && !error && status === 'idle' && (
        <p className="text-xs text-gray-400">รองรับ JPEG, PNG, WEBP, HEIC ขนาดไม่เกิน 8MB</p>
      )}
    </div>
  )
}
