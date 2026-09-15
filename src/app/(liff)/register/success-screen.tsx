'use client'

import { useEffect } from 'react'
import { closeLiffWindow, isInLineClient } from '@/lib/liff/client'

interface Props {
  message: string
  status: 'active' | 'pending'
}

export function SuccessScreen({ message, status }: Props) {
  useEffect(() => {
    const t = setTimeout(() => {
      if (isInLineClient()) closeLiffWindow()
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-6xl" aria-hidden>
        {status === 'active' ? '🎉' : '⏳'}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">
        {status === 'active' ? 'ลงทะเบียนรับประกันสำเร็จ!' : 'ได้รับเรื่องแล้ว'}
      </h2>
      <p className="max-w-xs text-sm text-gray-500">{message}</p>
      {status === 'active' && (
        <span
          className="rounded-full px-4 py-1.5 text-sm font-medium"
          style={{ background: 'var(--ht-success-bg)', color: 'var(--ht-success)' }}
        >
          ✅ ประกันมีผลแล้ว
        </span>
      )}
      {isInLineClient() && <p className="text-xs text-gray-400">หน้าต่างนี้จะปิดอัตโนมัติ...</p>}
    </div>
  )
}
