'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Camera, ImageIcon } from 'lucide-react'
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
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-[var(--ht-text-2)]">แนบรูปใบเสร็จ</span>

      {preview ? (
        <div className="relative w-fit">
          <Image
            src={preview}
            alt="ตัวอย่างใบเสร็จ"
            width={128}
            height={128}
            unoptimized
            className="h-32 w-32 rounded-xl border border-[var(--ht-border)] object-cover"
          />
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-[var(--ht-error)] shadow"
            aria-label="ลบรูป"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-dashed border-[var(--ht-check-border)] bg-[var(--ht-field)] p-3">
          {status === 'uploading' ? (
            <div className="flex h-[88px] items-center justify-center gap-2 text-[13px] text-[var(--ht-text-3)]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ht-primary)] border-t-transparent" />
              กำลังอัปโหลด...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {/* Two inputs on purpose: `capture` forces the camera on
                    phones, so the gallery button must not carry it. */}
                <PickButton label="ถ่ายรูป" icon={<Camera size={20} aria-hidden />} capture disabled={disabled} onFile={handleFile} />
                <PickButton label="เลือกจากคลังภาพ" icon={<ImageIcon size={20} aria-hidden />} disabled={disabled} onFile={handleFile} inputRef={inputRef} />
              </div>
              <span className="text-center text-xs text-[var(--ht-text-4)]">JPEG, PNG, WEBP, HEIC ไม่เกิน 8MB</span>
            </>
          )}
        </div>
      )}

      {(message || error) && <p className="text-xs text-[var(--ht-error)]">{message ?? error}</p>}
      {hasFile && !message && <p className="text-xs text-[var(--ht-success)]">แนบรูปแล้ว</p>}
    </div>
  )
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic'

function PickButton({
  label,
  icon,
  capture,
  disabled,
  onFile,
  inputRef,
}: {
  label: string
  icon: React.ReactNode
  capture?: boolean
  disabled?: boolean
  onFile: (file: File) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <label
      className="flex h-[60px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-[var(--ht-border)] bg-white text-[13px] font-medium text-[var(--ht-deep)] active:bg-[var(--ht-bg-to)]"
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      {icon}
      {label}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        capture={capture ? 'environment' : undefined}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </label>
  )
}
