'use client'

import Image from 'next/image'

export function LiffLoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <Image src="/logo.png" alt="Hosttail" width={56} height={56} className="h-14 w-14 rounded-full bg-white object-cover" priority />
        <div
          className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--ht-primary)] border-t-transparent"
          role="status"
          aria-label="กำลังโหลด"
        />
        <p className="text-sm text-[var(--ht-text-3)]">กำลังเชื่อมต่อ LINE...</p>
      </div>
    </div>
  )
}

export function LiffErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="w-full max-w-xs space-y-4 rounded-[20px] bg-white p-6 shadow-sm">
        <p className="text-base font-medium" style={{ color: 'var(--ht-error)' }}>
          {message}
        </p>
        <a
          href="https://line.me/R/ti/p/@hosttail"
          className="inline-block w-full rounded-full px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--ht-line)' }}
        >
          เปิด LINE OA @hosttail
        </a>
        <button
          type="button"
          onClick={onRetry}
          className="block w-full text-sm text-gray-500 underline underline-offset-2"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    </div>
  )
}
